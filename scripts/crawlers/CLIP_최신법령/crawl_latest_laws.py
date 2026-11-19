#!/usr/bin/env python3
"""관세법령정보포털(CLIP) 최신법령을 SQLite로 누적 저장하는 크롤러.

동작 원칙
---------
* 첫 페이지 미지정 실행은 포털의 최신법령 전체 페이지를 기준선으로 수집한다.
* 기준선이 저장된 뒤 페이지 미지정 실행은 마지막 확인 법령보다 새로 등록된 법령만 수집한다.
* --pages 1,3-5와 같이 목록 페이지 범위를 선택할 수 있다.
* 기존 smart_law_ai.db의 업무 테이블은 읽거나 변경하지 않는다. latest_ 전용 테이블만 사용한다.

포털의 공개 목록·본문·첨부파일 다운로드 요청만 사용하며, 로그인·우회·비공개 자료 접근은 하지 않는다.
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
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.message import Message
from pathlib import Path
from typing import Any, Iterable, Iterator
from urllib.parse import unquote, urljoin

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://unipass.customs.go.kr/clip"
LIST_ENDPOINT = "/lworsrch/retrieveNewestLworLst.do"
DETAIL_ENDPOINT = "/lworsrch/openULS0101008S.do"
EXTERNAL_ATTACHMENT_ENDPOINT = "/lworsrch/retrieveLworAttchFileInfo.do"
CHECK_DOWNLOAD_ENDPOINT = "/framework/filedownload/checkDownloadFile.do"
DOWNLOAD_ENDPOINT = "/framework/filedownload/kcs4gDownload.do"
CATEGORY_FOLDER = "최신법령"
SYNC_STATE_KEY = "CLIP_NEWEST_LAWS_ALL"

# 사용자 지정 운영 DB 경로: 변경하지 말고 --db 옵션으로만 대체 경로를 지정한다.
DEFAULT_DB = r"D:\SQLiteDB\smart_law_ai.db"
DEFAULT_ATTACH_DIR = r"C:\SQLiteDB\ATTACH"
SQLITE_BUSY_TIMEOUT_SECONDS = 30

LOGGER = logging.getLogger("clip_latest_laws")


class PortalError(RuntimeError):
    """Raised when the public portal returns an unusable response."""


@dataclass(frozen=True)
class AttachmentCandidate:
    attachment_id: str | None
    label: str
    file_kind: str
    external_url: str | None = None


@dataclass(frozen=True)
class ListedLaw:
    """A law record paired with the CLIP list page where it was discovered."""

    law: dict[str, Any]
    list_page: int
    is_incremental_candidate: bool = False


@dataclass(frozen=True)
class NewLaw:
    """The compact, user-facing information for a newly registered law."""

    law_id: str
    pmgt_dt_tp_no: str
    law_name: str
    enforcement_date: str | None
    promulgation_date: str | None
    law_type_name: str | None
    detail_url: str
    list_page: int


@dataclass
class RunStats:
    listed: int = 0
    processed: int = 0
    skipped_existing: int = 0
    detail_saved: int = 0
    attachment_downloaded: int = 0
    attachment_skipped: int = 0
    external_attachment_saved: int = 0
    list_pages_read: int = 0
    run_mode: str = ""
    selected_pages: list[int] = field(default_factory=list)
    checkpoint_found: bool | None = None
    truncated: bool = False
    new_laws: list[NewLaw] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalise_date(value: Any) -> str | None:
    """Convert the portal's YYYYMMDD dates to ISO dates, retaining other values."""
    if value is None:
        return None
    text = str(value).strip()
    if re.fullmatch(r"\d{8}", text):
        return f"{text[:4]}-{text[4:6]}-{text[6:]}"
    return text or None


def sanitize_filename(name: str, fallback: str, max_length: int = 100) -> str:
    """Return a Windows-safe, bounded filename while retaining a useful extension."""
    name = unquote(name or "").strip().replace("\x00", "")
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name:
        name = fallback

    stem, dot, suffix = name.rpartition(".")
    if not dot:
        stem, suffix = name, ""
    if stem.upper() in {
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5",
        "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5",
        "LPT6", "LPT7", "LPT8", "LPT9",
    }:
        stem = f"_{stem}"
    suffix_part = f".{suffix}" if suffix else ""
    available = max(1, max_length - len(suffix_part))
    return f"{stem[:available].rstrip(' .')}{suffix_part}" or fallback


def to_os_path(path: Path) -> str:
    """Use the Windows long-path prefix for file operations when necessary."""
    resolved = str(path.resolve())
    if os.name == "nt" and not resolved.startswith("\\\\?\\"):
        return "\\\\?\\" + resolved
    return resolved


def content_disposition_filename(value: str | None) -> str | None:
    """Decode Content-Disposition filenames, including percent-encoded Korean names."""
    if not value:
        return None
    message = Message()
    message["content-disposition"] = value
    params = message.get_params(header="content-disposition", failobj=[])
    for key, raw_value in params:
        if key.lower() in {"filename", "filename*"} and raw_value:
            if isinstance(raw_value, tuple):
                charset, _language, encoded = raw_value
                try:
                    return unquote(encoded, encoding=charset or "utf-8", errors="replace")
                except LookupError:
                    return unquote(encoded, encoding="utf-8", errors="replace")
            return unquote(str(raw_value), encoding="utf-8", errors="replace")
    matched = re.search(r"filename\*?=(?:UTF-8''|\")?([^;\"]+)", value, flags=re.I)
    return unquote(matched.group(1).strip()) if matched else None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(to_os_path(path), "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def law_identity(law: dict[str, Any]) -> tuple[str, str]:
    return str(law["lworAdmnRulNo"]), str(law["pmgtDtTpNo"])


def law_to_new_law(law: dict[str, Any], list_page: int) -> NewLaw:
    return NewLaw(
        law_id=str(law["lworAdmnRulNo"]),
        pmgt_dt_tp_no=str(law["pmgtDtTpNo"]),
        law_name=str(law.get("lworKoreNm") or "(법령명 없음)"),
        enforcement_date=normalise_date(law.get("enfrDt")),
        promulgation_date=normalise_date(law.get("pmgtGoorDt")),
        law_type_name=law.get("lworKcdNm"),
        detail_url=make_detail_url(law),
        list_page=list_page,
    )


def parse_page_spec(value: str) -> list[int]:
    """Parse a one-based CLIP page selector such as ``1,3-5,8``."""
    pages: set[int] = set()
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        if "-" in item:
            parts = [part.strip() for part in item.split("-", 1)]
            if len(parts) != 2 or not all(part.isdigit() for part in parts):
                raise argparse.ArgumentTypeError("페이지 범위는 예: 1,3-5 형식이어야 합니다.")
            start, end = int(parts[0]), int(parts[1])
            if start < 1 or end < start:
                raise argparse.ArgumentTypeError("페이지 범위는 1 이상의 오름차순이어야 합니다.")
            pages.update(range(start, end + 1))
        else:
            if not item.isdigit() or int(item) < 1:
                raise argparse.ArgumentTypeError("페이지 번호는 1 이상의 정수여야 합니다.")
            pages.add(int(item))
    if not pages:
        raise argparse.ArgumentTypeError("하나 이상의 페이지 번호를 지정해야 합니다.")
    return sorted(pages)


class ClipClient:
    """Stateful client for public CLIP list, detail and file-download requests."""

    def __init__(self, timeout: int, throttle: float) -> None:
        self.timeout = timeout
        self.throttle = throttle
        self.session = requests.Session()
        retry = Retry(
            total=4,
            connect=4,
            read=4,
            backoff_factor=1.0,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"GET", "POST"}),
            respect_retry_after_header=True,
        )
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        self.session.headers.update(
            {
                "User-Agent": "Mozilla/5.0 (compatible; CLIPLatestLawCrawler/2.0; +https://unipass.customs.go.kr/clip/)",
                "Accept": "application/json, text/html, */*; q=0.1",
                "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
                "X-Requested-With": "XMLHttpRequest",
            }
        )

    def _request(self, method: str, endpoint: str, **kwargs: Any) -> requests.Response:
        url = endpoint if endpoint.startswith("http") else f"{BASE_URL}{endpoint}"
        try:
            response = self.session.request(method, url, timeout=self.timeout, **kwargs)
            response.raise_for_status()
        except requests.RequestException as exc:
            raise PortalError(f"{method} {url} failed: {exc}") from exc
        if self.throttle:
            time.sleep(self.throttle)
        return response

    def _json(self, method: str, endpoint: str, **kwargs: Any) -> dict[str, Any]:
        response = self._request(method, endpoint, **kwargs)
        try:
            payload = response.json()
        except ValueError as exc:
            excerpt = response.text[:300].replace("\n", " ")
            raise PortalError(f"Expected JSON from {endpoint}, received: {excerpt!r}") from exc
        if not isinstance(payload, dict):
            raise PortalError(f"Unexpected JSON shape from {endpoint}")
        return payload

    def list_page(self, page: int, page_size: int, law_type: str) -> dict[str, Any]:
        # The endpoint accepts pageIndex/pageUnit directly. Submitting the client-side
        # orderColumns JSON representation is rejected by the public request filter.
        return self._json(
            "POST",
            LIST_ENDPOINT,
            data={
                "lworKcd": law_type,
                "pageIndex": page,
                "pageUnit": page_size,
                "pageSize": 10,
            },
        )

    def law_detail_html(self, law: dict[str, Any]) -> str:
        response = self._request(
            "POST",
            DETAIL_ENDPOINT,
            data={
                "lworAdmnRulNo": law["lworAdmnRulNo"],
                "pmgtDtTpNo": law["pmgtDtTpNo"],
                "opnMod": "N",
                "lworUtNo": "",
                "callScrnId": "",
                "lworKcd": law.get("lworKcd", ""),
            },
        )
        if "lworDtlForm" not in response.text:
            raise PortalError(
                f"Detail form not found for {law['lworAdmnRulNo']}/{law['pmgtDtTpNo']}"
            )
        return response.text

    def external_attachments(self, law: dict[str, Any]) -> list[dict[str, Any]]:
        payload = self._json(
            "POST",
            EXTERNAL_ATTACHMENT_ENDPOINT,
            data={
                "lworAdmnRulNo": law["lworAdmnRulNo"],
                "pmgtDtTpNo": law["pmgtDtTpNo"],
                "pageIndex": 1,
                "pageUnit": 100,
                "pageSize": 10,
            },
        )
        result = payload.get("rLworAttchFileInfo", [])
        return result if isinstance(result, list) else []

    def check_download(self, attachment_id: str) -> bool:
        payload = self._json(
            "POST", CHECK_DOWNLOAD_ENDPOINT, data={"attchFileId": attachment_id}
        )
        return str(payload.get("checkResult", "")).lower() == "true"

    def download(self, attachment_id: str) -> requests.Response:
        return self._request(
            "GET", DOWNLOAD_ENDPOINT, params={"attchFileId": attachment_id}, stream=True
        )

    def download_external(self, external_url: str) -> requests.Response:
        return self._request("GET", external_url, stream=True)


def _column_names(connection: sqlite3.Connection, table_name: str) -> set[str]:
    return {
        str(row[1]) for row in connection.execute(f"PRAGMA table_info({table_name})")
    }


def _ensure_column(connection: sqlite3.Connection, table_name: str, definition: str) -> None:
    column_name = definition.split()[0]
    if column_name not in _column_names(connection, table_name):
        connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {definition}")


def init_database(connection: sqlite3.Connection) -> None:
    """Create additive tables and non-destructive schema extensions only."""
    connection.executescript(
        """
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS latest_laws (
            law_id TEXT NOT NULL,
            pmgt_dt_tp_no TEXT NOT NULL,
            law_name TEXT NOT NULL,
            law_type_code TEXT,
            law_type_name TEXT,
            category_code TEXT,
            category_name TEXT,
            jurisdiction_code TEXT,
            jurisdiction_name TEXT,
            enforcement_date TEXT,
            promulgation_date TEXT,
            revision_type_code TEXT,
            revision_type_name TEXT,
            revision_reason_html TEXT,
            law_body_html TEXT NOT NULL,
            law_body_text TEXT NOT NULL,
            list_payload_json TEXT NOT NULL,
            detail_url TEXT NOT NULL,
            content_sha256 TEXT NOT NULL,
            crawled_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (law_id, pmgt_dt_tp_no)
        );

        CREATE INDEX IF NOT EXISTS idx_latest_laws_promulgation_date
            ON latest_laws(promulgation_date DESC);
        CREATE INDEX IF NOT EXISTS idx_latest_laws_category
            ON latest_laws(category_code);
        CREATE INDEX IF NOT EXISTS idx_latest_laws_jurisdiction
            ON latest_laws(jurisdiction_code);

        CREATE TABLE IF NOT EXISTS latest_law_attachments (
            law_id TEXT NOT NULL,
            pmgt_dt_tp_no TEXT NOT NULL,
            attachment_id TEXT NOT NULL,
            attachment_label TEXT,
            attachment_kind TEXT NOT NULL,
            source_url TEXT NOT NULL,
            original_filename TEXT,
            saved_relative_path TEXT,
            content_type TEXT,
            byte_size INTEGER,
            sha256 TEXT,
            status TEXT NOT NULL,
            error_message TEXT,
            downloaded_at TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (law_id, pmgt_dt_tp_no, attachment_id),
            FOREIGN KEY (law_id, pmgt_dt_tp_no)
                REFERENCES latest_laws(law_id, pmgt_dt_tp_no)
                ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_latest_law_attachments_status
            ON latest_law_attachments(status);

        CREATE TABLE IF NOT EXISTS latest_law_crawl_runs (
            run_id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            configuration_json TEXT NOT NULL,
            listed_count INTEGER NOT NULL DEFAULT 0,
            processed_count INTEGER NOT NULL DEFAULT 0,
            skipped_existing_count INTEGER NOT NULL DEFAULT 0,
            law_saved_count INTEGER NOT NULL DEFAULT 0,
            attachment_downloaded_count INTEGER NOT NULL DEFAULT 0,
            attachment_skipped_count INTEGER NOT NULL DEFAULT 0,
            external_attachment_saved_count INTEGER NOT NULL DEFAULT 0,
            error_count INTEGER NOT NULL DEFAULT 0,
            errors_json TEXT
        );

        CREATE TABLE IF NOT EXISTS latest_law_sync_state (
            state_key TEXT PRIMARY KEY,
            checkpoint_law_id TEXT NOT NULL,
            checkpoint_pmgt_dt_tp_no TEXT NOT NULL,
            checkpoint_law_name TEXT NOT NULL,
            checkpoint_enforcement_date TEXT,
            checkpoint_promulgation_date TEXT,
            checkpoint_list_page INTEGER NOT NULL,
            baseline_mode TEXT NOT NULL,
            initialized_at TEXT NOT NULL,
            last_full_crawl_at TEXT,
            last_incremental_check_at TEXT,
            last_successful_run_id TEXT,
            last_new_law_count INTEGER NOT NULL DEFAULT 0,
            last_list_total_count INTEGER,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS latest_law_new_registrations (
            law_id TEXT NOT NULL,
            pmgt_dt_tp_no TEXT NOT NULL,
            law_name TEXT NOT NULL,
            enforcement_date TEXT,
            promulgation_date TEXT,
            law_type_name TEXT,
            detail_url TEXT NOT NULL,
            first_detected_at TEXT NOT NULL,
            last_detected_at TEXT NOT NULL,
            first_detected_run_id TEXT NOT NULL,
            last_detected_run_id TEXT NOT NULL,
            first_detected_list_page INTEGER NOT NULL,
            detection_count INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (law_id, pmgt_dt_tp_no)
        );

        CREATE INDEX IF NOT EXISTS idx_latest_law_new_registrations_detected
            ON latest_law_new_registrations(first_detected_at DESC);
        CREATE INDEX IF NOT EXISTS idx_latest_law_new_registrations_promulgation
            ON latest_law_new_registrations(promulgation_date DESC);
        """
    )

    # V1.1 compatibility: only append nullable/defaulted columns to its existing
    # execution table. Existing rows and business tables are never changed.
    _ensure_column(connection, "latest_law_crawl_runs", "run_mode TEXT")
    _ensure_column(connection, "latest_law_crawl_runs", "selected_pages_csv TEXT")
    _ensure_column(connection, "latest_law_crawl_runs", "list_pages_read INTEGER NOT NULL DEFAULT 0")
    _ensure_column(connection, "latest_law_crawl_runs", "checkpoint_found INTEGER")
    _ensure_column(connection, "latest_law_crawl_runs", "new_law_count INTEGER NOT NULL DEFAULT 0")
    _ensure_column(connection, "latest_law_crawl_runs", "new_law_names_json TEXT")
    _ensure_column(connection, "latest_law_crawl_runs", "checkpoint_before_json TEXT")
    _ensure_column(connection, "latest_law_crawl_runs", "checkpoint_after_json TEXT")
    connection.commit()


def get_sync_state(connection: sqlite3.Connection) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM latest_law_sync_state WHERE state_key = ?", (SYNC_STATE_KEY,)
    ).fetchone()


def sync_state_as_json(state: sqlite3.Row | None) -> str | None:
    if state is None:
        return None
    return json.dumps(dict(state), ensure_ascii=False, sort_keys=True)


def law_exists(connection: sqlite3.Connection, law: dict[str, Any]) -> bool:
    return connection.execute(
        """SELECT 1 FROM latest_laws
           WHERE law_id = ? AND pmgt_dt_tp_no = ?""",
        law_identity(law),
    ).fetchone() is not None


def attachment_already_downloaded(
    connection: sqlite3.Connection, law: dict[str, Any], attachment_id: str, attachment_root: Path
) -> bool:
    row = connection.execute(
        """SELECT saved_relative_path FROM latest_law_attachments
           WHERE law_id = ? AND pmgt_dt_tp_no = ? AND attachment_id = ?
             AND status = 'downloaded'""",
        (*law_identity(law), attachment_id),
    ).fetchone()
    if not row or not row[0]:
        return False
    return (attachment_root / row[0]).is_file()


def parse_detail(html: str) -> tuple[str, str, str, str, list[AttachmentCandidate]]:
    """Extract law title, body HTML/text, revision reason and CLIP attachment IDs."""
    soup = BeautifulSoup(html, "html.parser")
    form = soup.select_one("#lworDtlForm")
    body = soup.select_one("#lworDtlInfoArea") or soup.select_one(".law_view")
    if form is None or body is None:
        raise PortalError("Law detail HTML is missing the expected form or body")

    title = soup.select_one("h3.title_01")
    law_name = title.get_text(" ", strip=True) if title else ""
    body_html = str(body)
    body_text = body.get_text("\n", strip=True)

    # CLIP loads revision reasons in a separate interactive tab. The reserved field
    # stays empty until that independent source is explicitly added to the crawler.
    revision_reason_html = ""

    candidates: list[AttachmentCandidate] = []
    seen: set[tuple[str, str]] = set()
    for position, file_input in enumerate(
        soup.select('input[name="pdfAttchFileId"], input[name="hwpAttchFileId"]'), start=1
    ):
        attachment_id = (file_input.get("value") or "").strip()
        if not attachment_id:
            continue
        kind = "pdf" if file_input.get("name") == "pdfAttchFileId" else "hwp"
        parent = file_input.find_parent("li") or file_input.parent
        label_element = parent.select_one("a.link_pdfdown") if parent else None
        label = (
            label_element.get_text(" ", strip=True)
            if label_element
            else f"{law_name or '법령'}_{position}"
        )
        signature = (attachment_id, kind)
        if signature not in seen:
            candidates.append(AttachmentCandidate(attachment_id, label, kind))
            seen.add(signature)
    return law_name, body_html, body_text, revision_reason_html, candidates


def make_detail_url(law: dict[str, Any]) -> str:
    return (
        f"{BASE_URL}/lworsrch/openULS0101009S.do?"
        f"lworAdmnRulNo={law['lworAdmnRulNo']}&pmgtDtTpNo={law['pmgtDtTpNo']}"
        f"&lworKcd={law.get('lworKcd', '')}"
    )


def upsert_law(
    connection: sqlite3.Connection,
    law: dict[str, Any],
    law_name: str,
    body_html: str,
    body_text: str,
    revision_reason_html: str,
) -> None:
    now = utc_now()
    content_hash = hashlib.sha256(body_html.encode("utf-8")).hexdigest()
    connection.execute(
        """
        INSERT INTO latest_laws (
            law_id, pmgt_dt_tp_no, law_name, law_type_code, law_type_name,
            category_code, category_name, jurisdiction_code, jurisdiction_name,
            enforcement_date, promulgation_date, revision_type_code, revision_type_name,
            revision_reason_html, law_body_html, law_body_text, list_payload_json,
            detail_url, content_sha256, crawled_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(law_id, pmgt_dt_tp_no) DO UPDATE SET
            law_name = excluded.law_name,
            law_type_code = excluded.law_type_code,
            law_type_name = excluded.law_type_name,
            category_code = excluded.category_code,
            category_name = excluded.category_name,
            jurisdiction_code = excluded.jurisdiction_code,
            jurisdiction_name = excluded.jurisdiction_name,
            enforcement_date = excluded.enforcement_date,
            promulgation_date = excluded.promulgation_date,
            revision_type_code = excluded.revision_type_code,
            revision_type_name = excluded.revision_type_name,
            revision_reason_html = excluded.revision_reason_html,
            law_body_html = excluded.law_body_html,
            law_body_text = excluded.law_body_text,
            list_payload_json = excluded.list_payload_json,
            detail_url = excluded.detail_url,
            content_sha256 = excluded.content_sha256,
            crawled_at = excluded.crawled_at,
            updated_at = excluded.updated_at
        """,
        (
            *law_identity(law),
            law_name or law.get("lworKoreNm", ""),
            law.get("lworKcd"),
            law.get("lworKcdNm"),
            law.get("lworGrpMdclCd"),
            law.get("lworGrpMdclCdNm"),
            law.get("lworJursdMsofCd"),
            law.get("lworJursdMsofNm"),
            normalise_date(law.get("enfrDt")),
            normalise_date(law.get("pmgtGoorDt")),
            law.get("enrfTpcd"),
            law.get("enrfTpcdNm"),
            revision_reason_html,
            body_html,
            body_text,
            json.dumps(law, ensure_ascii=False, sort_keys=True),
            make_detail_url(law),
            content_hash,
            now,
            now,
        ),
    )


def record_attachment(
    connection: sqlite3.Connection,
    law: dict[str, Any],
    candidate: AttachmentCandidate,
    source_url: str,
    status: str,
    original_filename: str | None = None,
    saved_relative_path: str | None = None,
    content_type: str | None = None,
    byte_size: int | None = None,
    sha256: str | None = None,
    error_message: str | None = None,
) -> None:
    now = utc_now()
    attachment_id = candidate.attachment_id or hashlib.sha256(source_url.encode("utf-8")).hexdigest()
    connection.execute(
        """
        INSERT INTO latest_law_attachments (
            law_id, pmgt_dt_tp_no, attachment_id, attachment_label, attachment_kind,
            source_url, original_filename, saved_relative_path, content_type, byte_size,
            sha256, status, error_message, downloaded_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(law_id, pmgt_dt_tp_no, attachment_id) DO UPDATE SET
            attachment_label = excluded.attachment_label,
            attachment_kind = excluded.attachment_kind,
            source_url = excluded.source_url,
            original_filename = excluded.original_filename,
            saved_relative_path = excluded.saved_relative_path,
            content_type = excluded.content_type,
            byte_size = excluded.byte_size,
            sha256 = excluded.sha256,
            status = excluded.status,
            error_message = excluded.error_message,
            downloaded_at = excluded.downloaded_at,
            updated_at = excluded.updated_at
        """,
        (
            *law_identity(law),
            attachment_id,
            candidate.label,
            candidate.file_kind,
            source_url,
            original_filename,
            saved_relative_path,
            content_type,
            byte_size,
            sha256,
            status,
            error_message,
            now if status == "downloaded" else None,
            now,
        ),
    )


def save_response_to_file(response: requests.Response, target: Path) -> tuple[int, str]:
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.part")
    size = 0
    try:
        with open(to_os_path(temporary), "wb") as handle:
            for chunk in response.iter_content(chunk_size=128 * 1024):
                if chunk:
                    handle.write(chunk)
                    size += len(chunk)
        os.replace(to_os_path(temporary), to_os_path(target))
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return size, sha256_file(target)


def local_attachment_target(
    attachment_root: Path, law: dict[str, Any], filename: str, ordinal: int
) -> tuple[Path, str]:
    law_folder = f"{law['lworAdmnRulNo']}_{law['pmgtDtTpNo']}"
    clean_name = sanitize_filename(filename, f"attachment_{ordinal}")
    clean_name = sanitize_filename(f"{ordinal:03d}_{clean_name}", f"attachment_{ordinal}")
    relative = Path(CATEGORY_FOLDER) / law_folder / clean_name
    return attachment_root / relative, relative.as_posix()


def download_clip_attachment(
    client: ClipClient,
    connection: sqlite3.Connection,
    law: dict[str, Any],
    candidate: AttachmentCandidate,
    attachment_root: Path,
    ordinal: int,
) -> tuple[bool, bool]:
    """Return (downloaded, skipped) after recording the attachment's final status."""
    assert candidate.attachment_id
    attachment_id = candidate.attachment_id
    source_url = f"{BASE_URL}{DOWNLOAD_ENDPOINT}?attchFileId={attachment_id}"
    if attachment_already_downloaded(connection, law, attachment_id, attachment_root):
        return False, True
    if not client.check_download(attachment_id):
        record_attachment(
            connection, law, candidate, source_url, "unavailable",
            error_message="Portal reported unavailable file",
        )
        return False, False

    response = client.download(attachment_id)
    filename = content_disposition_filename(response.headers.get("Content-Disposition"))
    fallback = f"{candidate.label}.{candidate.file_kind}"
    target, relative = local_attachment_target(attachment_root, law, filename or fallback, ordinal)
    size, digest = save_response_to_file(response, target)
    record_attachment(
        connection,
        law,
        candidate,
        source_url,
        "downloaded",
        original_filename=filename or target.name,
        saved_relative_path=relative,
        content_type=response.headers.get("Content-Type"),
        byte_size=size,
        sha256=digest,
    )
    return True, False


def download_external_attachment(
    client: ClipClient,
    connection: sqlite3.Connection,
    law: dict[str, Any],
    candidate: AttachmentCandidate,
    attachment_root: Path,
    ordinal: int,
) -> bool:
    assert candidate.external_url
    source_url = candidate.external_url
    attachment_id = hashlib.sha256(source_url.encode("utf-8")).hexdigest()
    if attachment_already_downloaded(connection, law, attachment_id, attachment_root):
        return False
    response = client.download_external(source_url)
    filename = content_disposition_filename(response.headers.get("Content-Disposition"))
    fallback = f"{candidate.label}_external"
    target, relative = local_attachment_target(attachment_root, law, filename or fallback, ordinal)
    size, digest = save_response_to_file(response, target)
    record_attachment(
        connection,
        law,
        AttachmentCandidate(attachment_id, candidate.label, candidate.file_kind, source_url),
        source_url,
        "downloaded",
        original_filename=filename or target.name,
        saved_relative_path=relative,
        content_type=response.headers.get("Content-Type"),
        byte_size=size,
        sha256=digest,
    )
    return True


def page_records(payload: dict[str, Any], page: int) -> list[ListedLaw]:
    records = payload.get("rLworLst", [])
    if not isinstance(records, list):
        raise PortalError(f"List page {page} has an unexpected record shape")
    valid: list[ListedLaw] = []
    for law in records:
        if not isinstance(law, dict) or not law.get("lworAdmnRulNo") or not law.get("pmgtDtTpNo"):
            LOGGER.warning("Skipping malformed list record on page %s: %r", page, law)
            continue
        valid.append(ListedLaw(law=law, list_page=page))
    return valid


def total_pages(payload: dict[str, Any]) -> int:
    value = payload.get("paginationInfo", {}).get("totalPageCount", 1)
    try:
        return max(1, int(value or 1))
    except (TypeError, ValueError) as exc:
        raise PortalError(f"Invalid totalPageCount: {value!r}") from exc


def total_record_count(payload: dict[str, Any]) -> int | None:
    value = payload.get("paginationInfo", {}).get("totalRecordCount")
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def collect_full_or_selected(
    client: ClipClient,
    page_size: int,
    law_type: str,
    selected_pages: list[int] | None,
    limit: int | None,
) -> tuple[list[ListedLaw], list[ListedLaw], int, int | None, bool]:
    """Collect list records for a full run or explicitly selected pages.

    Returns selected records, first-page records, list pages read, total records,
    and whether a test --limit truncated the requested scope.
    """
    first_payload = client.list_page(1, page_size, law_type)
    first_records = page_records(first_payload, 1)
    page_count = total_pages(first_payload)
    total_count = total_record_count(first_payload)
    wanted_pages = selected_pages or list(range(1, page_count + 1))
    invalid = [page for page in wanted_pages if page > page_count]
    if invalid:
        raise PortalError(
            f"선택한 페이지 {', '.join(map(str, invalid))}가 포털의 마지막 페이지 {page_count}보다 큽니다."
        )

    records: list[ListedLaw] = []
    pages_read = 1
    for page in wanted_pages:
        rows = first_records if page == 1 else page_records(client.list_page(page, page_size, law_type), page)
        if page != 1:
            pages_read += 1
        for row in rows:
            records.append(row)
            if limit is not None and len(records) >= limit:
                return records, first_records, pages_read, total_count, True
    return records, first_records, pages_read, total_count, False


def collect_incremental(
    client: ClipClient,
    page_size: int,
    law_type: str,
    state: sqlite3.Row,
    limit: int | None,
) -> tuple[list[ListedLaw], list[ListedLaw], int, int | None, bool, bool]:
    """Read list pages until the stored newest-law checkpoint is reached.

    The returned laws are only the records before the old checkpoint. If the old
    checkpoint has disappeared from the portal list, all pages are examined but the
    caller treats only DB-unknown records as new to prevent an accidental full refresh.
    """
    first_payload = client.list_page(1, page_size, law_type)
    first_records = page_records(first_payload, 1)
    page_count = total_pages(first_payload)
    total_count = total_record_count(first_payload)
    checkpoint = (str(state["checkpoint_law_id"]), str(state["checkpoint_pmgt_dt_tp_no"]))

    candidates: list[ListedLaw] = []
    pages_read = 0
    found = False
    truncated = False
    for page in range(1, page_count + 1):
        rows = first_records if page == 1 else page_records(client.list_page(page, page_size, law_type), page)
        pages_read += 1
        for row in rows:
            if law_identity(row.law) == checkpoint:
                found = True
                break
            candidates.append(
                ListedLaw(law=row.law, list_page=page, is_incremental_candidate=True)
            )
            if limit is not None and len(candidates) >= limit:
                truncated = True
                break
        if found or truncated:
            break

    return candidates, first_records, pages_read, total_count, found, truncated


def start_run(
    connection: sqlite3.Connection,
    configuration: dict[str, Any],
    run_mode: str,
    selected_pages: list[int],
    checkpoint_before: sqlite3.Row | None,
) -> tuple[str, str]:
    run_id = str(uuid.uuid4())
    started_at = utc_now()
    connection.execute(
        """
        INSERT INTO latest_law_crawl_runs(
            run_id, started_at, configuration_json, run_mode, selected_pages_csv,
            checkpoint_before_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            started_at,
            json.dumps(configuration, ensure_ascii=False, sort_keys=True),
            run_mode,
            ",".join(map(str, selected_pages)) if selected_pages else None,
            sync_state_as_json(checkpoint_before),
        ),
    )
    connection.commit()
    return run_id, started_at


def finish_run(
    connection: sqlite3.Connection,
    run_id: str,
    stats: RunStats,
    checkpoint_after: sqlite3.Row | None,
) -> None:
    new_names = [
        {
            "law_id": law.law_id,
            "pmgt_dt_tp_no": law.pmgt_dt_tp_no,
            "law_name": law.law_name,
            "enforcement_date": law.enforcement_date,
            "promulgation_date": law.promulgation_date,
            "law_type_name": law.law_type_name,
            "detail_url": law.detail_url,
            "list_page": law.list_page,
        }
        for law in stats.new_laws
    ]
    connection.execute(
        """
        UPDATE latest_law_crawl_runs
        SET finished_at = ?, listed_count = ?, processed_count = ?,
            skipped_existing_count = ?, law_saved_count = ?,
            attachment_downloaded_count = ?, attachment_skipped_count = ?,
            external_attachment_saved_count = ?, error_count = ?, errors_json = ?,
            list_pages_read = ?, checkpoint_found = ?, new_law_count = ?,
            new_law_names_json = ?, checkpoint_after_json = ?
        WHERE run_id = ?
        """,
        (
            utc_now(),
            stats.listed,
            stats.processed,
            stats.skipped_existing,
            stats.detail_saved,
            stats.attachment_downloaded,
            stats.attachment_skipped,
            stats.external_attachment_saved,
            len(stats.errors),
            json.dumps(stats.errors, ensure_ascii=False),
            stats.list_pages_read,
            None if stats.checkpoint_found is None else int(stats.checkpoint_found),
            len(stats.new_laws),
            json.dumps(new_names, ensure_ascii=False),
            sync_state_as_json(checkpoint_after),
            run_id,
        ),
    )
    connection.commit()


def update_sync_state(
    connection: sqlite3.Connection,
    first_law: ListedLaw,
    run_id: str,
    run_mode: str,
    total_count: int | None,
    new_law_count: int,
) -> None:
    """Atomically save the top-of-list checkpoint after a complete successful run."""
    now = utc_now()
    law = first_law.law
    baseline_mode = "full" if run_mode == "full" else "selected_page_1"
    connection.execute(
        """
        INSERT INTO latest_law_sync_state (
            state_key, checkpoint_law_id, checkpoint_pmgt_dt_tp_no, checkpoint_law_name,
            checkpoint_enforcement_date, checkpoint_promulgation_date, checkpoint_list_page,
            baseline_mode, initialized_at, last_full_crawl_at, last_incremental_check_at,
            last_successful_run_id, last_new_law_count, last_list_total_count, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(state_key) DO UPDATE SET
            checkpoint_law_id = excluded.checkpoint_law_id,
            checkpoint_pmgt_dt_tp_no = excluded.checkpoint_pmgt_dt_tp_no,
            checkpoint_law_name = excluded.checkpoint_law_name,
            checkpoint_enforcement_date = excluded.checkpoint_enforcement_date,
            checkpoint_promulgation_date = excluded.checkpoint_promulgation_date,
            checkpoint_list_page = excluded.checkpoint_list_page,
            baseline_mode = CASE WHEN excluded.baseline_mode = 'full'
                                 THEN 'full' ELSE latest_law_sync_state.baseline_mode END,
            last_full_crawl_at = CASE WHEN excluded.baseline_mode = 'full'
                                      THEN excluded.last_full_crawl_at
                                      ELSE latest_law_sync_state.last_full_crawl_at END,
            last_incremental_check_at = excluded.last_incremental_check_at,
            last_successful_run_id = excluded.last_successful_run_id,
            last_new_law_count = excluded.last_new_law_count,
            last_list_total_count = excluded.last_list_total_count,
            updated_at = excluded.updated_at
        """,
        (
            SYNC_STATE_KEY,
            *law_identity(law),
            str(law.get("lworKoreNm") or "(법령명 없음)"),
            normalise_date(law.get("enfrDt")),
            normalise_date(law.get("pmgtGoorDt")),
            first_law.list_page,
            baseline_mode,
            now,
            now if run_mode == "full" else None,
            now,
            run_id,
            new_law_count,
            total_count,
            now,
        ),
    )
    connection.commit()


def record_new_registration(
    connection: sqlite3.Connection,
    new_law: NewLaw,
    run_id: str,
) -> None:
    now = utc_now()
    connection.execute(
        """
        INSERT INTO latest_law_new_registrations (
            law_id, pmgt_dt_tp_no, law_name, enforcement_date, promulgation_date,
            law_type_name, detail_url, first_detected_at, last_detected_at,
            first_detected_run_id, last_detected_run_id, first_detected_list_page,
            detection_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(law_id, pmgt_dt_tp_no) DO UPDATE SET
            law_name = excluded.law_name,
            enforcement_date = excluded.enforcement_date,
            promulgation_date = excluded.promulgation_date,
            law_type_name = excluded.law_type_name,
            detail_url = excluded.detail_url,
            last_detected_at = excluded.last_detected_at,
            last_detected_run_id = excluded.last_detected_run_id,
            detection_count = latest_law_new_registrations.detection_count + 1
        """,
        (
            new_law.law_id,
            new_law.pmgt_dt_tp_no,
            new_law.law_name,
            new_law.enforcement_date,
            new_law.promulgation_date,
            new_law.law_type_name,
            new_law.detail_url,
            now,
            now,
            run_id,
            run_id,
            new_law.list_page,
        ),
    )


def process_attachments(
    client: ClipClient,
    connection: sqlite3.Connection,
    law: dict[str, Any],
    identity: str,
    attachments: list[AttachmentCandidate],
    arguments: argparse.Namespace,
    attachment_root: Path,
    stats: RunStats,
) -> None:
    if arguments.no_attachments:
        return

    for ordinal, candidate in enumerate(attachments, start=1):
        if arguments.max_attachments_per_law and ordinal > arguments.max_attachments_per_law:
            LOGGER.info("Attachment cap reached for: %s", identity)
            break
        try:
            downloaded, skipped = download_clip_attachment(
                client, connection, law, candidate, attachment_root, ordinal
            )
            connection.commit()
            stats.attachment_downloaded += int(downloaded)
            stats.attachment_skipped += int(skipped)
        except Exception as exc:  # Continue processing other public files.
            message = f"Attachment failed ({identity}, {candidate.attachment_id}): {exc}"
            LOGGER.exception(message)
            stats.errors.append(message)
            record_attachment(
                connection,
                law,
                candidate,
                f"{BASE_URL}{DOWNLOAD_ENDPOINT}?attchFileId={candidate.attachment_id}",
                "failed",
                error_message=str(exc),
            )
            connection.commit()

    if not arguments.download_external_links:
        return

    external_rows = client.external_attachments(law)
    for ordinal, row in enumerate(external_rows, start=len(attachments) + 1):
        external_url = str(row.get("lnkUrl") or "").strip()
        if not external_url:
            continue
        candidate = AttachmentCandidate(
            None,
            str(row.get("attchFileNm") or "external_attachment"),
            "external",
            urljoin(BASE_URL + "/", external_url),
        )
        try:
            if download_external_attachment(client, connection, law, candidate, attachment_root, ordinal):
                stats.external_attachment_saved += 1
            connection.commit()
        except Exception as exc:
            message = f"External attachment failed ({identity}, {external_url}): {exc}"
            LOGGER.exception(message)
            stats.errors.append(message)
            record_attachment(
                connection,
                law,
                candidate,
                candidate.external_url or external_url,
                "failed",
                error_message=str(exc),
            )
            connection.commit()


def process_law(
    client: ClipClient,
    connection: sqlite3.Connection,
    item: ListedLaw,
    arguments: argparse.Namespace,
    attachment_root: Path,
    stats: RunStats,
    force_detail: bool,
) -> None:
    law = item.law
    identity = f"{law['lworAdmnRulNo']}/{law['pmgtDtTpNo']} {law.get('lworKoreNm', '')}"
    exists = law_exists(connection, law)
    if exists and not arguments.refresh_existing and not force_detail:
        stats.skipped_existing += 1
        LOGGER.info("Existing law skipped: %s", identity)
        return

    stats.processed += 1
    try:
        html = client.law_detail_html(law)
        law_name, body_html, body_text, reason_html, attachments = parse_detail(html)
        upsert_law(connection, law, law_name, body_html, body_text, reason_html)
        connection.commit()
        stats.detail_saved += 1
        LOGGER.info("Saved law: %s", identity)
        process_attachments(
            client, connection, law, identity, attachments, arguments, attachment_root, stats
        )
    except Exception as exc:
        message = f"Law failed ({identity}): {exc}"
        LOGGER.exception(message)
        stats.errors.append(message)
        connection.rollback()


def crawl(arguments: argparse.Namespace) -> RunStats:
    database_path = Path(arguments.db).expanduser()
    attachment_root = Path(arguments.attach_dir).expanduser()
    database_path.parent.mkdir(parents=True, exist_ok=True)
    attachment_root.mkdir(parents=True, exist_ok=True)

    # The target is an operational DB that may be opened briefly by another program.
    # Wait for a transient lock but do not change journal mode or any DB-wide setting.
    connection = sqlite3.connect(to_os_path(database_path), timeout=SQLITE_BUSY_TIMEOUT_SECONDS)
    connection.row_factory = sqlite3.Row
    connection.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT_SECONDS * 1000}")
    init_database(connection)

    state_before = get_sync_state(connection)
    selected_pages = arguments.pages or []
    if arguments.full:
        run_mode = "full"
    elif selected_pages:
        run_mode = "selected_pages"
    elif arguments.incremental:
        if state_before is None:
            connection.close()
            raise PortalError("증분 수집 기준선이 없습니다. 먼저 --full 또는 --pages 1을 실행하십시오.")
        run_mode = "incremental"
    elif state_before is None:
        run_mode = "full"
    else:
        run_mode = "incremental"

    configuration = {
        "source": "관세법령정보포털 CLIP 최신법령",
        "run_mode": run_mode,
        "law_type": arguments.law_type,
        "page_size": arguments.page_size,
        "selected_pages": selected_pages,
        "download_attachments": not arguments.no_attachments,
        "download_external_links": arguments.download_external_links,
        "refresh_existing": arguments.refresh_existing,
        "limit": arguments.limit,
        "max_attachments_per_law": arguments.max_attachments_per_law,
    }
    run_id, _started_at = start_run(
        connection, configuration, run_mode, selected_pages, state_before
    )
    stats = RunStats(run_mode=run_mode, selected_pages=selected_pages)
    client = ClipClient(arguments.timeout, arguments.throttle)
    state_after: sqlite3.Row | None = state_before

    try:
        if run_mode == "incremental":
            assert state_before is not None
            records, first_records, pages_read, total_count, found, truncated = collect_incremental(
                client, arguments.page_size, arguments.law_type, state_before, arguments.limit
            )
            stats.checkpoint_found = found
            stats.truncated = truncated
            stats.list_pages_read = pages_read
            if not found:
                LOGGER.warning(
                    "Stored checkpoint %s/%s was not found. Checked %d list page(s); "
                    "only DB-unknown laws will be treated as newly registered.",
                    state_before["checkpoint_law_id"], state_before["checkpoint_pmgt_dt_tp_no"], pages_read,
                )
        else:
            records, first_records, pages_read, total_count, truncated = collect_full_or_selected(
                client,
                arguments.page_size,
                arguments.law_type,
                selected_pages if run_mode == "selected_pages" else None,
                arguments.limit,
            )
            stats.list_pages_read = pages_read
            stats.truncated = truncated
            stats.checkpoint_found = None

        stats.listed = len(records)
        if run_mode == "incremental":
            LOGGER.info(
                "Incremental scan: candidates=%d pages_read=%d checkpoint_found=%s",
                len(records), pages_read, stats.checkpoint_found,
            )
        elif run_mode == "full":
            LOGGER.info("Full scan: records=%d pages_read=%d", len(records), pages_read)
        else:
            LOGGER.info("Selected-page scan: pages=%s records=%d", selected_pages, len(records))

        for item in records:
            force_detail = False
            if run_mode == "incremental":
                if stats.checkpoint_found:
                    # Records before the checkpoint are new for this run. For a retry after
                    # an incomplete incremental run, refresh them so failed files are retried.
                    force_detail = True
                    new_law = law_to_new_law(item.law, item.list_page)
                    record_new_registration(connection, new_law, run_id)
                    stats.new_laws.append(new_law)
                    connection.commit()
                elif not law_exists(connection, item.law):
                    # The old anchor vanished. Do not refresh every existing row; only record
                    # identities absent from the local latest_laws table as newly registered.
                    force_detail = True
                    new_law = law_to_new_law(item.law, item.list_page)
                    record_new_registration(connection, new_law, run_id)
                    stats.new_laws.append(new_law)
                    connection.commit()
            process_law(
                client, connection, item, arguments, attachment_root, stats, force_detail
            )

        can_advance_checkpoint = (
            bool(first_records)
            and not stats.errors
            and not stats.truncated
            and run_mode in {"full", "incremental"}
        )
        if can_advance_checkpoint:
            update_sync_state(
                connection,
                first_records[0],
                run_id,
                "full" if run_mode == "full" else "selected_page_1",
                total_count,
                len(stats.new_laws),
            )
            state_after = get_sync_state(connection)
        elif run_mode in {"full", "selected_pages"} and stats.truncated:
            LOGGER.warning(
                "--limit caused a partial run. The incremental checkpoint was not established or advanced."
            )
        elif stats.errors:
            LOGGER.warning(
                "Errors occurred. The incremental checkpoint was not advanced so new records can be retried."
            )
        return stats
    finally:
        finish_run(connection, run_id, stats, state_after)
        connection.close()


def query_latest_names(
    db_path: Path,
    days: int,
    limit: int,
) -> list[sqlite3.Row]:
    """Read recently detected names without accessing CLIP or changing the DB."""
    if not db_path.is_file():
        raise PortalError(f"데이터베이스 파일을 찾을 수 없습니다: {db_path}")
    connection = sqlite3.connect(to_os_path(db_path), timeout=SQLITE_BUSY_TIMEOUT_SECONDS)
    connection.row_factory = sqlite3.Row
    try:
        exists = connection.execute(
            """SELECT 1 FROM sqlite_master
               WHERE type = 'table' AND name = 'latest_law_new_registrations'"""
        ).fetchone()
        if exists is None:
            raise PortalError(
                "신규 등록 이력 테이블이 없습니다. 먼저 전체 수집을 한 번 실행하십시오."
            )
        threshold = (datetime.now(timezone.utc) - timedelta(days=days)).replace(microsecond=0).isoformat()
        return connection.execute(
            """
            SELECT law_id, pmgt_dt_tp_no, law_name, law_type_name,
                   enforcement_date, promulgation_date, detail_url,
                   first_detected_at, last_detected_at, detection_count
            FROM latest_law_new_registrations
            WHERE first_detected_at >= ?
            ORDER BY first_detected_at DESC, promulgation_date DESC, law_name ASC
            LIMIT ?
            """,
            (threshold, limit),
        ).fetchall()
    finally:
        connection.close()


def print_new_law_names(new_laws: Iterable[NewLaw]) -> None:
    rows = list(new_laws)
    if not rows:
        print("신규 등록 법령명: 없음")
        return
    print(f"신규 등록 법령명: {len(rows)}건")
    for number, law in enumerate(rows, start=1):
        print(
            f"{number}. {law.law_name} | 시행일 {law.enforcement_date or '-'} | "
            f"공포일 {law.promulgation_date or '-'} | 목록 {law.list_page}페이지"
        )


def print_saved_new_law_names(rows: Iterable[sqlite3.Row], as_json: bool) -> None:
    items = [dict(row) for row in rows]
    if as_json:
        print(json.dumps(items, ensure_ascii=False, indent=2))
        return
    if not items:
        print("최근 신규 등록 법령명: 없음")
        return
    print(f"최근 신규 등록 법령명: {len(items)}건")
    for number, row in enumerate(items, start=1):
        print(
            f"{number}. {row['law_name']} | 시행일 {row['enforcement_date'] or '-'} | "
            f"공포일 {row['promulgation_date'] or '-'} | 최초 탐지 {row['first_detected_at']}"
        )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "관세법령정보포털(CLIP) 최신법령을 SQLite DB와 ATTACH 폴더에 누적 저장합니다. "
            "첫 실행은 전체 수집이고, 이후 페이지 미지정 실행은 신규 법령만 증분 수집합니다."
        )
    )
    parser.add_argument("--db", default=DEFAULT_DB, help=f"SQLite DB 경로 (기본값: {DEFAULT_DB})")
    parser.add_argument(
        "--attach-dir", default=DEFAULT_ATTACH_DIR,
        help=f"첨부파일 루트 경로 (기본값: {DEFAULT_ATTACH_DIR})",
    )
    parser.add_argument(
        "--law-type",
        choices=("all", "A01", "A02", "A03"),
        default="all",
        help="all=전체, A01=법률, A02=시행령, A03=시행규칙 (기본값: all)",
    )
    parser.add_argument("--page-size", type=int, choices=(10, 20, 30, 50, 100), default=100)
    parser.add_argument(
        "--pages",
        type=parse_page_spec,
        default=None,
        help="수집할 목록 페이지. 예: 1 또는 1,3-5. 생략하면 최초 전체·이후 증분 수집.",
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--full", action="store_true",
        help="기준선과 관계없이 최신법령 전체 페이지를 다시 조회합니다.",
    )
    mode_group.add_argument(
        "--incremental", action="store_true",
        help="저장된 체크포인트 이후 신규 등록 법령만 조회합니다. 기준선이 없으면 오류입니다.",
    )
    parser.add_argument("--timeout", type=int, default=45, help="HTTP 요청별 제한시간(초)")
    parser.add_argument("--throttle", type=float, default=0.25, help="요청 사이 대기시간(초)")
    parser.add_argument(
        "--limit", type=int, default=None,
        help="테스트용 최대 법령 수. 지정하면 체크포인트를 갱신하지 않습니다.",
    )
    parser.add_argument(
        "--max-attachments-per-law", type=int, default=0,
        help="법령별 최대 첨부파일 수. 0이면 제한 없이 전부 저장합니다.",
    )
    parser.add_argument("--no-attachments", action="store_true", help="본문/메타데이터만 저장합니다.")
    parser.add_argument(
        "--download-external-links", action="store_true",
        help="CLIP가 외부 URL로 제공하는 별도 첨부파일도 내려받습니다.",
    )
    parser.add_argument(
        "--refresh-existing", action="store_true",
        help="기존 법령도 본문과 첨부파일 상태를 다시 확인합니다.",
    )
    parser.add_argument(
        "--show-latest-names", action="store_true",
        help="크롤링하지 않고 DB에 저장된 최근 신규 등록 법령명을 출력합니다.",
    )
    parser.add_argument(
        "--new-name-days", type=int, default=7,
        help="--show-latest-names 조회 기간(일, 기본값: 7)",
    )
    parser.add_argument(
        "--new-name-limit", type=int, default=100,
        help="--show-latest-names 최대 출력 건수(기본값: 100)",
    )
    parser.add_argument(
        "--name-output", choices=("table", "json"), default="table",
        help="신규 법령명 조회 출력 형식(기본값: table)",
    )
    parser.add_argument(
        "--log-file",
        default=None,
        help="UTF-8 실행 로그 파일 경로. 지정하면 화면 출력과 동일한 로그를 파일에도 저장합니다.",
    )
    parser.add_argument("--log-level", choices=("DEBUG", "INFO", "WARNING", "ERROR"), default="INFO")
    parsed = parser.parse_args(argv)
    if parsed.pages and (parsed.full or parsed.incremental):
        parser.error("--pages는 --full 또는 --incremental과 함께 사용할 수 없습니다.")
    if parsed.limit is not None and parsed.limit < 1:
        parser.error("--limit은 1 이상이어야 합니다.")
    if parsed.max_attachments_per_law < 0:
        parser.error("--max-attachments-per-law는 0 이상이어야 합니다.")
    if parsed.new_name_days < 1:
        parser.error("--new-name-days는 1 이상이어야 합니다.")
    if parsed.new_name_limit < 1:
        parser.error("--new-name-limit은 1 이상이어야 합니다.")
    if parsed.show_latest_names and (parsed.pages or parsed.full or parsed.incremental):
        parser.error("--show-latest-names는 수집 모드 옵션과 함께 사용할 수 없습니다.")
    return parsed


def configure_logging(log_level: str, log_file: str | None) -> None:
    """Write normal crawler progress to stdout and optionally to a UTF-8 log file.

    stdout avoids PowerShell treating normal INFO records written to stderr as
    NativeCommandError records. FileHandler owns log-file output so Windows batch
    files do not need a fragile PowerShell Tee-Object pipeline.
    """
    handlers: list[logging.Handler] = [logging.StreamHandler(stream=sys.stdout)]
    if log_file:
        path = Path(log_file).expanduser()
        path.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(to_os_path(path), encoding="utf-8"))
    logging.basicConfig(
        level=getattr(logging, log_level),
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
        force=True,
    )


def main(argv: list[str] | None = None) -> int:
    arguments = parse_args(argv)
    configure_logging(arguments.log_level, arguments.log_file)
    try:
        if arguments.show_latest_names:
            rows = query_latest_names(
                Path(arguments.db).expanduser(), arguments.new_name_days, arguments.new_name_limit
            )
            print_saved_new_law_names(rows, arguments.name_output == "json")
            return 0

        stats = crawl(arguments)
    except PortalError as exc:
        LOGGER.error("Crawl stopped: %s", exc)
        return 2
    except Exception:
        LOGGER.exception("Unexpected crawler failure")
        return 1

    LOGGER.info(
        "Completed: mode=%s list_pages=%d listed=%d processed=%d saved=%d "
        "skipped_existing=%d new_laws=%d attachments_downloaded=%d "
        "attachments_skipped=%d external_attachments=%d errors=%d",
        stats.run_mode,
        stats.list_pages_read,
        stats.listed,
        stats.processed,
        stats.detail_saved,
        stats.skipped_existing,
        len(stats.new_laws),
        stats.attachment_downloaded,
        stats.attachment_skipped,
        stats.external_attachment_saved,
        len(stats.errors),
    )
    if stats.run_mode == "incremental":
        print_new_law_names(stats.new_laws)
    return 0 if not stats.errors else 3


if __name__ == "__main__":
    sys.exit(main())
