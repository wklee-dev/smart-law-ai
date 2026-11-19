#!/usr/bin/env python3
"""Download administrative-rule annex/form files from the CLIP portal into SQLite.

The program queries only the portal's public "행정규칙" annex/form listing.  It
writes its own two tables into an existing SQLite database, so it does not
assume or alter the existing administrative-rule table layout.

Python 3.9+; dependency: requests
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional
from urllib.parse import unquote

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


PORTAL_ROOT = "https://unipass.customs.go.kr/clip"
LIST_URL = f"{PORTAL_ROOT}/lworsrch/retrieveAnxFrmlLst.do"
LANDING_URL = f"{PORTAL_ROOT}/index.do?opnurl=/lworsrch/openULS0106001Q.do"
CHECK_DOWNLOAD_URL = f"{PORTAL_ROOT}/framework/filedownload/checkDownloadFile.do"
DOWNLOAD_URL = f"{PORTAL_ROOT}/framework/filedownload/kcs4gDownload.do"

# An existing SQLite database is used.  The crawler adds only its own
# CREATE TABLE IF NOT EXISTS tables and never alters or deletes existing data.
DEFAULT_DATABASE = Path(r"D:\SQLiteDB\smart_law_ai.db")
DEFAULT_ATTACHMENT_DIR = Path(r"C:\SQLiteDB\ATTACH")
LAW_CLASSIFICATIONS = {
    "all": ("NA", "전체(법령+행정규칙)"),
    "law": ("01", "법령"),
    "admin": ("02", "행정규칙"),
}
ANNEX_FORM_TYPES = {
    "all": ("", "전체(별표+서식+별도+부록)"),
    "annex": ("01", "별표"),
    "form": ("02", "서식"),
    "separate": ("03", "별도"),
    "appendix": ("04", "부록"),
}
LAW_CLASSIFICATION_LABELS = {"01": "법령", "02": "행정규칙", "unknown": "미분류"}
ANNEX_FORM_TYPE_LABELS = {"01": "별표", "02": "서식", "03": "별도", "04": "부록", "unknown": "미분류"}
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)

INVALID_FILENAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


@dataclass(frozen=True)
class RemoteFile:
    """A downloadable file advertised by a CLIP listing row."""

    attachment_id: str
    file_type: str
    display_name: str


@dataclass
class Summary:
    rows_seen: int = 0
    unique_form_keys: int = 0
    rows_with_no_download_files: int = 0
    files_advertised: int = 0
    pdf_files_advertised: int = 0
    hwp_files_advertised: int = 0
    downloaded: int = 0
    skipped: int = 0
    failed: int = 0
    portal_total_records: Optional[int] = None
    pages_processed: int = 0
    count_verified: Optional[bool] = None
    law_classification_counts: dict[str, int] = field(default_factory=dict)
    annex_form_type_counts: dict[str, int] = field(default_factory=dict)


class DuplicateFormKeyError(RuntimeError):
    """Raised when distinct portal listing rows share a database form key."""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def create_session() -> requests.Session:
    """Create a retrying session and establish the portal session cookie."""
    retries = Retry(
        total=4,
        connect=4,
        read=4,
        status=4,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET", "POST"}),
        raise_on_status=False,
    )
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
        }
    )
    adapter = HTTPAdapter(max_retries=retries, pool_connections=1, pool_maxsize=1)
    session.mount("https://", adapter)
    session.get(LANDING_URL, timeout=(10, 45)).raise_for_status()
    return session


def open_database(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 10000")
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS clip_annex_forms (
            form_key TEXT PRIMARY KEY,
            lwor_admn_rul_no TEXT NOT NULL,
            pmgt_dt_tp_no TEXT NOT NULL,
            anx_frml_srno TEXT NOT NULL,
            anx_frml_ut_no TEXT,
            law_classification_code TEXT,
            law_kind_code TEXT,
            law_name TEXT NOT NULL,
            annex_type_code TEXT,
            form_title TEXT NOT NULL,
            effective_date TEXT,
            source_json TEXT NOT NULL,
            first_seen_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS clip_annex_files (
            attachment_id TEXT PRIMARY KEY,
            form_key TEXT NOT NULL REFERENCES clip_annex_forms(form_key) ON DELETE CASCADE,
            file_type TEXT NOT NULL CHECK(file_type IN ('pdf', 'hwp')),
            original_filename TEXT,
            stored_path TEXT NOT NULL,
            download_url TEXT NOT NULL,
            byte_size INTEGER,
            sha256 TEXT,
            download_status TEXT NOT NULL DEFAULT 'pending'
                CHECK(download_status IN ('pending', 'downloaded', 'failed', 'skipped')),
            downloaded_at TEXT,
            last_error TEXT,
            UNIQUE(form_key, file_type)
        );

        CREATE INDEX IF NOT EXISTS idx_clip_annex_forms_law_name
            ON clip_annex_forms(law_name);
        CREATE INDEX IF NOT EXISTS idx_clip_annex_files_form_key
            ON clip_annex_files(form_key);

        CREATE TABLE IF NOT EXISTS clip_annex_crawl_runs (
            run_id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            list_url TEXT NOT NULL,
            row_count INTEGER NOT NULL DEFAULT 0,
            downloaded_count INTEGER NOT NULL DEFAULT 0,
            skipped_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            note TEXT
        );
        """
    )
    connection.commit()
    return connection


def make_form_key(row: dict[str, Any]) -> str:
    """Return the portal's stable composite identifier for a listing row."""
    fields = ("lworAdmnRulNo", "pmgtDtTpNo", "anxFrmlSrno")
    values = [str(row.get(field) or "").strip() for field in fields]
    if not all(values):
        raise ValueError(f"Listing row has no complete key: {values!r}")
    return "|".join(values)


def law_classification_from_row(row: dict[str, Any], requested_code: str) -> str:
    """Return a per-row classification even when the all-category API omits it."""
    row_code = str(row.get("lworClsfCd") or "").strip()
    if row_code in {"01", "02"}:
        return row_code
    if requested_code in {"01", "02"}:
        return requested_code
    # The CLIP list uses A-series law-kind codes for 법령 and C-series codes for 행정규칙.
    law_kind_code = str(row.get("lworKcd") or "").strip().upper()
    if law_kind_code.startswith("A"):
        return "01"
    if law_kind_code.startswith("C"):
        return "02"
    return "unknown"


def upsert_form(
    connection: sqlite3.Connection,
    row: dict[str, Any],
    law_classification_code: str,
) -> str:
    form_key = make_form_key(row)
    seen_at = utc_now()
    source_json = json.dumps(row, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    connection.execute(
        """
        INSERT INTO clip_annex_forms (
            form_key, lwor_admn_rul_no, pmgt_dt_tp_no, anx_frml_srno,
            anx_frml_ut_no, law_classification_code, law_kind_code, law_name,
            annex_type_code, form_title, effective_date, source_json,
            first_seen_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(form_key) DO UPDATE SET
            anx_frml_ut_no=excluded.anx_frml_ut_no,
            law_classification_code=excluded.law_classification_code,
            law_kind_code=excluded.law_kind_code,
            law_name=excluded.law_name,
            annex_type_code=excluded.annex_type_code,
            form_title=excluded.form_title,
            effective_date=excluded.effective_date,
            source_json=excluded.source_json,
            last_seen_at=excluded.last_seen_at
        """,
        (
            form_key,
            row.get("lworAdmnRulNo"),
            row.get("pmgtDtTpNo"),
            row.get("anxFrmlSrno"),
            row.get("anxFrmlUtNo"),
            law_classification_code,
            row.get("lworKcd"),
            row.get("lworKoreNm") or "",
            row.get("anxFrmlTpcd"),
            row.get("frmlTtle") or "",
            row.get("enfrDt"),
            source_json,
            seen_at,
            seen_at,
        ),
    )
    return form_key


def advertised_files(row: dict[str, Any]) -> Iterator[RemoteFile]:
    """Yield only the PDF and HWP/HWPX download controls requested."""
    mapping = (
        ("pdfAttchFileId", "pdfSaveFileNm", "pdf"),
        ("hwpAttchFileId", "hwpSaveFileNm", "hwp"),
    )
    for id_field, name_field, file_type in mapping:
        attachment_id = str(row.get(id_field) or "").strip()
        if attachment_id:
            yield RemoteFile(
                attachment_id=attachment_id,
                file_type=file_type,
                display_name=str(row.get(name_field) or "").strip(),
            )


def safe_filename(value: str, fallback: str) -> str:
    value = INVALID_FILENAME.sub("_", value).strip().rstrip(". ")
    value = re.sub(r"\s+", " ", value)
    return value[:180] or fallback


def local_file_path(directory: Path, remote: RemoteFile) -> Path:
    """Create a collision-free filesystem name while retaining the source title."""
    extension = Path(remote.display_name).suffix.lower()
    if not extension:
        extension = ".pdf" if remote.file_type == "pdf" else ".hwp"
    stem = safe_filename(Path(remote.display_name).stem, remote.attachment_id)
    attachment_slug = safe_filename(remote.attachment_id, "attachment")
    return directory / remote.file_type / f"{stem}__{attachment_slug}{extension}"


def file_sha256_and_size(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def is_valid_file(path: Path, remote: RemoteFile) -> bool:
    """Reject saved HTML/error responses; support PDF, legacy HWP, and HWPX."""
    if not path.exists() or path.stat().st_size == 0:
        return False
    with path.open("rb") as handle:
        header = handle.read(16)
    if remote.file_type == "pdf":
        return header.startswith(b"%PDF-")
    # HWPX is a ZIP container; legacy HWP uses OLE Compound File Binary Format.
    return header.startswith(b"PK\x03\x04") or header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")


def content_disposition_filename(header_value: Optional[str]) -> Optional[str]:
    if not header_value:
        return None
    matched = re.search(r"filename\*?=(?:UTF-8''|\")?([^\";]+)", header_value, flags=re.I)
    return unquote(matched.group(1).strip()) if matched else None


def request_listing(
    session: requests.Session,
    page_index: int,
    page_unit: int,
    law_classification_code: str,
    annex_form_type_code: str,
    law_name: str,
    form_title: str,
) -> dict[str, Any]:
    response = session.post(
        LIST_URL,
        data={
            "pageIndex": str(page_index),
            "pageUnit": str(page_unit),
            "lworClsfCd": law_classification_code,
            "anxFrmlTpcd": annex_form_type_code,
            "lworKoreNm": law_name,
            "frmlTtle": form_title,
        },
        timeout=(10, 60),
    )
    response.raise_for_status()
    data = response.json()
    if data.get("error") == "true":
        raise RuntimeError(f"Portal listing error: {data.get('message', data)}")
    if not isinstance(data.get("rAnxFrmlLst"), list):
        raise RuntimeError("Portal listing response did not contain rAnxFrmlLst")
    return data


def check_download(session: requests.Session, attachment_id: str) -> bool:
    response = session.post(
        CHECK_DOWNLOAD_URL,
        data={"attchFileId": attachment_id},
        timeout=(10, 30),
    )
    response.raise_for_status()
    return response.json().get("checkResult") == "true"


def download_file(
    session: requests.Session,
    remote: RemoteFile,
    destination: Path,
) -> tuple[str, int, str]:
    """Stream a portal attachment to a temporary path, then atomically publish it."""
    if not check_download(session, remote.attachment_id):
        raise RuntimeError("Portal reported that the attachment is not downloadable")

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    temporary.unlink(missing_ok=True)
    try:
        response = session.get(
            DOWNLOAD_URL,
            params={"attchFileId": remote.attachment_id},
            headers={
                "Referer": f"{PORTAL_ROOT}/lworsrch/openULS0106001Q.do",
                "Accept": "application/octet-stream, */*; q=0.8",
            },
            stream=True,
            timeout=(10, 180),
        )
        response.raise_for_status()
        with temporary.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    handle.write(chunk)
        if not is_valid_file(temporary, remote):
            preview = temporary.read_bytes()[:160].decode("utf-8", errors="replace")
            raise RuntimeError(f"Downloaded response is not a valid {remote.file_type} file: {preview!r}")
        downloaded_name = content_disposition_filename(response.headers.get("Content-Disposition"))
        sha256, byte_size = file_sha256_and_size(temporary)
        temporary.replace(destination)
        return sha256, byte_size, downloaded_name or remote.display_name
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def record_file(
    connection: sqlite3.Connection,
    form_key: str,
    remote: RemoteFile,
    destination: Path,
    status: str,
    *,
    sha256: Optional[str] = None,
    byte_size: Optional[int] = None,
    original_filename: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    download_url = f"{DOWNLOAD_URL}?attchFileId={remote.attachment_id}"
    connection.execute(
        """
        INSERT INTO clip_annex_files (
            attachment_id, form_key, file_type, original_filename, stored_path,
            download_url, byte_size, sha256, download_status, downloaded_at, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(attachment_id) DO UPDATE SET
            form_key=excluded.form_key,
            file_type=excluded.file_type,
            original_filename=COALESCE(excluded.original_filename, clip_annex_files.original_filename),
            stored_path=excluded.stored_path,
            download_url=excluded.download_url,
            byte_size=COALESCE(excluded.byte_size, clip_annex_files.byte_size),
            sha256=COALESCE(excluded.sha256, clip_annex_files.sha256),
            download_status=excluded.download_status,
            downloaded_at=COALESCE(excluded.downloaded_at, clip_annex_files.downloaded_at),
            last_error=excluded.last_error
        """,
        (
            remote.attachment_id,
            form_key,
            remote.file_type,
            original_filename or remote.display_name or None,
            str(destination),
            download_url,
            byte_size,
            sha256,
            status,
            utc_now() if status in {"downloaded", "skipped"} else None,
            error,
        ),
    )


def crawl(args: argparse.Namespace) -> Summary:
    law_classification_code, law_classification_label = LAW_CLASSIFICATIONS[args.law_classification]
    annex_form_type_code, annex_form_type_label = ANNEX_FORM_TYPES[args.annex_form_type]
    if args.page is not None:
        if args.start_page != 1 or args.end_page is not None:
            raise ValueError("--page cannot be used with --start-page or --end-page")
        args.start_page = args.page
        args.end_page = args.page
    if args.page_size < 1 or args.page_size > 100:
        raise ValueError("--page-size must be between 1 and 100")
    if args.page is not None and args.page < 1:
        raise ValueError("--page must be at least 1")
    if args.start_page < 1:
        raise ValueError("--start-page must be at least 1")
    if args.end_page is not None and args.end_page < args.start_page:
        raise ValueError("--end-page must be greater than or equal to --start-page")
    if args.max_records is not None and args.max_records < 1:
        raise ValueError("--max-records must be at least 1")
    if args.delay < 0:
        raise ValueError("--delay cannot be negative")

    database_path = Path(args.db).expanduser()
    attachment_dir = Path(args.attachment_dir).expanduser()
    connection: Optional[sqlite3.Connection] = None
    if not args.dry_run:
        connection = open_database(database_path)
    session = create_session()
    summary = Summary()
    run_id: Optional[int] = None
    seen_form_keys: set[str] = set()

    try:
        if not args.dry_run:
            assert connection is not None
            page_range_note = (
                f"pages={args.start_page}-{args.end_page}"
                if args.end_page is not None
                else f"pages={args.start_page}-last"
            )
            cursor = connection.execute(
                "INSERT INTO clip_annex_crawl_runs (started_at, list_url, note) VALUES (?, ?, ?)",
                (
                    utc_now(),
                    LIST_URL,
                    (
                        f"{law_classification_label} {annex_form_type_label} 별표/서식 PDF 및 HWP/HWPX 수집; "
                        f"{page_range_note}; page_size={args.page_size}"
                    ),
                ),
            )
            run_id = int(cursor.lastrowid)
            connection.commit()

        page = args.start_page
        while True:
            payload = request_listing(
                session,
                page,
                args.page_size,
                law_classification_code,
                annex_form_type_code,
                args.law_name,
                args.form_title,
            )
            rows = payload["rAnxFrmlLst"]
            pagination = payload.get("paginationInfo") or {}
            total = int(pagination.get("totalRecordCount") or 0)
            if summary.portal_total_records is None:
                summary.portal_total_records = total
            elif summary.portal_total_records != total:
                raise RuntimeError(
                    "Portal total changed during the crawl "
                    f"({summary.portal_total_records} -> {total}); rerun to obtain a consistent snapshot"
                )
            expected_rows = min(args.page_size, max(0, total - ((page - 1) * args.page_size)))
            logging.info(
                "Listing page %s: %s/%s rows (portal total: %s; classification: %s; type: %s)",
                page,
                len(rows),
                expected_rows,
                total,
                law_classification_label,
                annex_form_type_label,
            )
            if len(rows) != expected_rows:
                raise RuntimeError(
                    f"Portal returned an incomplete page {page}: expected {expected_rows} rows, received {len(rows)}"
                )
            if not rows:
                break
            summary.pages_processed += 1

            for row in rows:
                if args.max_records is not None and summary.rows_seen >= args.max_records:
                    break
                summary.rows_seen += 1
                try:
                    form_key = make_form_key(row)
                    if form_key in seen_form_keys:
                        raise DuplicateFormKeyError(
                            "Portal returned duplicate form key; stopping to prevent one row from overwriting another: "
                            f"{form_key}"
                        )
                    seen_form_keys.add(form_key)
                    summary.unique_form_keys = len(seen_form_keys)
                    row_law_classification = law_classification_from_row(row, law_classification_code)
                    row_annex_type = str(row.get("anxFrmlTpcd") or "unknown").strip() or "unknown"
                    summary.law_classification_counts[row_law_classification] = (
                        summary.law_classification_counts.get(row_law_classification, 0) + 1
                    )
                    summary.annex_form_type_counts[row_annex_type] = (
                        summary.annex_form_type_counts.get(row_annex_type, 0) + 1
                    )
                    if row_annex_type == "unknown":
                        logging.warning(
                            "Portal returned an unclassified annex/form row; included in all-scope crawl: %s | %s",
                            row.get("lworKoreNm"),
                            row.get("frmlTtle"),
                        )
                    remote_files = list(advertised_files(row))
                    summary.files_advertised += len(remote_files)
                    summary.pdf_files_advertised += sum(remote.file_type == "pdf" for remote in remote_files)
                    summary.hwp_files_advertised += sum(remote.file_type == "hwp" for remote in remote_files)
                    if not remote_files:
                        summary.rows_with_no_download_files += 1
                    if args.dry_run:
                        logging.debug(
                            "[DRY RUN] %s | %s | %s files",
                            row.get("lworKoreNm"),
                            row.get("frmlTtle"),
                            len(remote_files),
                        )
                        continue

                    with connection:
                        assert connection is not None
                        form_key = upsert_form(connection, row, row_law_classification)
                        for remote in remote_files:
                            target = local_file_path(attachment_dir, remote)
                            if is_valid_file(target, remote):
                                sha256, byte_size = file_sha256_and_size(target)
                                record_file(
                                    connection, form_key, remote, target, "skipped",
                                    sha256=sha256, byte_size=byte_size,
                                )
                                summary.skipped += 1
                                logging.info("Exists, skipped: %s", target.name)
                                continue

                            try:
                                sha256, byte_size, source_name = download_file(session, remote, target)
                                record_file(
                                    connection, form_key, remote, target, "downloaded",
                                    sha256=sha256, byte_size=byte_size,
                                    original_filename=source_name,
                                )
                                summary.downloaded += 1
                                logging.info("Downloaded: %s (%s bytes)", target.name, byte_size)
                            except Exception as exc:  # Continue remaining records and store audit information.
                                record_file(connection, form_key, remote, target, "failed", error=str(exc)[:2000])
                                summary.failed += 1
                                logging.exception("Download failed: attachment_id=%s", remote.attachment_id)
                            if args.delay:
                                time.sleep(args.delay)
                except DuplicateFormKeyError:
                    raise
                except Exception:
                    summary.failed += 1
                    logging.exception("Could not process listing row: %r", row.get("frmlTtle"))

            if args.max_records is not None and summary.rows_seen >= args.max_records:
                logging.info("Stopped after --max-records=%s", args.max_records)
                break
            if args.end_page is not None and page >= args.end_page:
                logging.info("Stopped after --end-page=%s", args.end_page)
                break
            if page >= int(pagination.get("totalPageCount") or page):
                break
            page += 1
            if args.delay:
                time.sleep(args.delay)

        complete_unfiltered_crawl = (
            args.start_page == 1
            and args.end_page is None
            and args.max_records is None
            and args.law_classification == "all"
            and args.annex_form_type == "all"
            and not args.law_name
            and not args.form_title
        )
        if complete_unfiltered_crawl:
            summary.count_verified = summary.rows_seen == summary.portal_total_records
            if not summary.count_verified:
                raise RuntimeError(
                    "Crawl count verification failed: "
                    f"portal total={summary.portal_total_records}, processed={summary.rows_seen}, "
                    f"unique_form_keys={summary.unique_form_keys}"
                )
            logging.info(
                "Count verification passed: portal total=%s, processed=%s",
                summary.portal_total_records,
                summary.rows_seen,
            )
        else:
            summary.count_verified = None

        classification_summary = ", ".join(
            f"{LAW_CLASSIFICATION_LABELS.get(code, code)}={count}"
            for code, count in sorted(summary.law_classification_counts.items())
        )
        type_summary = ", ".join(
            f"{ANNEX_FORM_TYPE_LABELS.get(code, code)}={count}"
            for code, count in sorted(summary.annex_form_type_counts.items())
        )
        logging.info("Processed classification counts: %s", classification_summary or "none")
        logging.info("Processed annex/form type counts: %s", type_summary or "none")

        if run_id is not None:
            with connection:
                connection.execute(
                    """
                    UPDATE clip_annex_crawl_runs
                    SET finished_at=?, row_count=?, downloaded_count=?, skipped_count=?, failed_count=?
                    WHERE run_id=?
                    """,
                    (utc_now(), summary.rows_seen, summary.downloaded, summary.skipped, summary.failed, run_id),
                )
        return summary
    finally:
        session.close()
        if connection is not None:
            connection.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Download PDF and HWP/HWPX attachments for CLIP administrative-rule annex/forms."
    )
    parser.add_argument("--db", default=str(DEFAULT_DATABASE), help="SQLite database path")
    parser.add_argument(
        "--attachment-dir", default=str(DEFAULT_ATTACHMENT_DIR),
        help="Root directory for downloaded PDF/HWP files",
    )
    parser.add_argument("--page-size", type=int, default=100, help="Listing rows per request (1–100; default: 100)")
    parser.add_argument("--start-page", type=int, default=1, help="First listing page to process (default: 1)")
    parser.add_argument("--end-page", type=int, help="Last listing page to process, inclusive (default: final page)")
    parser.add_argument("--page", type=int, help="One listing page to process; shortcut for matching start/end pages")
    parser.add_argument(
        "--law-classification",
        choices=tuple(LAW_CLASSIFICATIONS),
        default="all",
        help="Portal law classification: all, law, or admin (default: all)",
    )
    parser.add_argument(
        "--annex-form-type",
        choices=tuple(ANNEX_FORM_TYPES),
        default="all",
        help="Portal annex/form type: all, annex, form, separate, or appendix (default: all)",
    )
    parser.add_argument("--delay", type=float, default=0.25, help="Seconds to wait between download/list requests (default: 0.25)")
    parser.add_argument("--law-name", default="", help="Optional portal filter: 법령명")
    parser.add_argument("--form-title", default="", help="Optional portal filter: 별표/서식명")
    parser.add_argument("--max-records", type=int, help="Process only this many listing rows; useful for a test run")
    parser.add_argument("--dry-run", action="store_true", help="Read the listing only; do not modify SQLite or download files")
    parser.add_argument("--verbose", action="store_true", help="Show debug logs")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    configure_logging(args.verbose)
    try:
        summary = crawl(args)
    except (requests.RequestException, ValueError, RuntimeError, sqlite3.Error) as exc:
        logging.error("Crawl stopped: %s", exc)
        return 2

    verification_label = (
        "PASS"
        if summary.count_verified is True
        else "NOT_APPLICABLE"
        if summary.count_verified is None
        else "FAIL"
    )
    logging.info(
        "Complete: portal_total=%s, rows=%s, unique_form_keys=%s, pages=%s, count_verification=%s, "
        "advertised=%s (pdf=%s, hwp=%s), rows_without_download_files=%s, "
        "downloaded=%s, skipped=%s, failed=%s",
        summary.portal_total_records,
        summary.rows_seen,
        summary.unique_form_keys,
        summary.pages_processed,
        verification_label,
        summary.files_advertised,
        summary.pdf_files_advertised,
        summary.hwp_files_advertised,
        summary.rows_with_no_download_files,
        summary.downloaded,
        summary.skipped,
        summary.failed,
    )
    return 1 if summary.failed else 0


if __name__ == "__main__":
    sys.exit(main())
