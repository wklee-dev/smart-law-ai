#!/usr/bin/env python3
"""관세법령정보포털 CLIP 조약/협정 크롤러.

목록 API에서 조약을 페이지 단위로 조회하고, 각 상세 화면의 본문과 첨부파일을
SQLite 데이터베이스 및 로컬 파일 시스템에 보존한다.
"""
from __future__ import annotations

import argparse
import hashlib
import logging
import math
import re
import sqlite3
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

PORTAL_ROOT = "https://unipass.customs.go.kr/clip"
LIST_SCREEN_URL = f"{PORTAL_ROOT}/lworsrch/openULS0103001Q.do"
LIST_API_URL = f"{PORTAL_ROOT}/lworsrch/retrieveTrtyLst.do"
DETAIL_URL = f"{PORTAL_ROOT}/lworsrch/openULS0103002S.do"
# These endpoints are read from the portal's shared client-side download function.
DOWNLOAD_CHECK_URL = f"{PORTAL_ROOT}/framework/filedownload/checkDownloadFile.do"
DOWNLOAD_URL = f"{PORTAL_ROOT}/framework/filedownload/kcs4gDownload.do"
DEFAULT_WINDOWS_DB = r"D:\SQLiteDB\clip_admin_rule.db"
ATTACHMENT_CATEGORY = "조약협정"
VALID_PAGE_SIZES = (10, 20, 30, 50, 100)


class CrawlerError(RuntimeError):
    """Raised when the portal returns an unusable response."""


@dataclass(frozen=True)
class TreatySummary:
    """A treaty record returned by the listing API."""

    trty_srno: str
    name: str
    category_code: str | None
    category_name: str | None
    countries: str | None
    treaty_number: str | None
    effective_date: str | None
    registered_date: str | None
    list_page: int
    list_row_number: int | None
    korean_content: str | None
    english_content: str | None
    raw_json: str


@dataclass(frozen=True)
class Attachment:
    """An attachment identified on a treaty detail screen."""

    attachment_id: str
    filename: str
    displayed_size: str | None


@dataclass
class CrawlStats:
    """Counters reported at the end of a run."""

    pages_requested: int = 0
    treaties_seen: int = 0
    treaties_saved: int = 0
    attachments_seen: int = 0
    attachments_downloaded: int = 0
    attachment_failures: int = 0


def utc_now() -> str:
    """Return a stable UTC timestamp suitable for SQLite text columns."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def clean_text(value: Any) -> str | None:
    """Convert portal values to normalized nullable text."""
    if value is None:
        return None
    text = str(value).replace("\r\n", "\n").replace("\r", "\n").strip()
    return text or None


def json_dumps(value: Any) -> str:
    """Serialize response data without adding a dependency beyond the stdlib."""
    import json

    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def safe_filename(value: str, fallback: str = "attachment") -> str:
    """Return a Windows-safe, bounded file name while retaining its extension."""
    name = re.sub(r"[\\/:*?\"<>|\x00-\x1f]", "_", value).strip(" .")
    name = re.sub(r"\s+", " ", name)
    if not name:
        name = fallback

    suffix = Path(name).suffix
    stem = Path(name).stem
    max_length = 180
    if len(name) > max_length:
        available = max(1, max_length - len(suffix))
        name = stem[:available].rstrip(" .") + suffix
    return name or fallback


def sha256_file(path: Path) -> str:
    """Calculate SHA-256 without retaining a whole attachment in memory."""
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def text_from_html(html: str) -> str:
    """Extract readable detail text while preserving logical line breaks."""
    soup = BeautifulSoup(html, "html.parser")
    for node in soup.select("script, style, noscript"):
        node.decompose()
    text = soup.get_text("\n", strip=True)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def extract_attachments(html: str) -> list[Attachment]:
    """Extract and de-duplicate attachment IDs from a detail screen."""
    soup = BeautifulSoup(html, "html.parser")
    found: list[Attachment] = []
    seen: set[str] = set()

    for link in soup.select("a[data-attchfileid]"):
        attachment_id = clean_text(link.get("data-attchfileid"))
        if not attachment_id or attachment_id in seen:
            continue
        seen.add(attachment_id)

        filename = clean_text(link.get("title")) or clean_text(link.get_text(" ", strip=True))
        if not filename:
            filename = f"{attachment_id}.bin"

        size_element = link.find_next("span")
        displayed_size = clean_text(size_element.get_text(" ", strip=True)) if size_element else None
        found.append(Attachment(attachment_id, filename, displayed_size))

    return found


class TreatyDatabase:
    """SQLite persistence with additive tables for the existing administration DB."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path.expanduser()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.db_path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA journal_mode = WAL")
        self._create_schema()

    def close(self) -> None:
        self.connection.close()

    def _create_schema(self) -> None:
        self.connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS clip_treaties (
                trty_srno TEXT PRIMARY KEY,
                treaty_name TEXT NOT NULL,
                category_code TEXT,
                category_name TEXT,
                countries TEXT,
                treaty_number TEXT,
                effective_date TEXT,
                registered_date TEXT,
                list_page INTEGER NOT NULL,
                list_row_number INTEGER,
                korean_content TEXT,
                english_content TEXT,
                detail_text TEXT,
                detail_html TEXT,
                source_url TEXT NOT NULL,
                raw_list_json TEXT NOT NULL,
                crawled_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_clip_treaties_effective_date
                ON clip_treaties(effective_date);
            CREATE INDEX IF NOT EXISTS idx_clip_treaties_category_code
                ON clip_treaties(category_code);

            CREATE TABLE IF NOT EXISTS clip_treaty_attachments (
                attachment_id TEXT PRIMARY KEY,
                trty_srno TEXT NOT NULL,
                file_name TEXT NOT NULL,
                displayed_size TEXT,
                relative_path TEXT,
                file_size_bytes INTEGER,
                sha256 TEXT,
                download_url TEXT NOT NULL,
                download_status TEXT NOT NULL DEFAULT 'pending',
                last_error TEXT,
                downloaded_at TEXT,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (trty_srno) REFERENCES clip_treaties(trty_srno)
                    ON DELETE CASCADE,
                UNIQUE (trty_srno, attachment_id)
            );

            CREATE INDEX IF NOT EXISTS idx_clip_treaty_attachments_treaty
                ON clip_treaty_attachments(trty_srno);

            CREATE TABLE IF NOT EXISTS clip_treaty_crawl_runs (
                run_id INTEGER PRIMARY KEY AUTOINCREMENT,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                requested_start_page INTEGER,
                requested_end_page INTEGER,
                page_size INTEGER NOT NULL,
                attachments_enabled INTEGER NOT NULL,
                status TEXT NOT NULL,
                pages_requested INTEGER NOT NULL DEFAULT 0,
                treaties_seen INTEGER NOT NULL DEFAULT 0,
                treaties_saved INTEGER NOT NULL DEFAULT 0,
                attachments_seen INTEGER NOT NULL DEFAULT 0,
                attachments_downloaded INTEGER NOT NULL DEFAULT 0,
                attachment_failures INTEGER NOT NULL DEFAULT 0,
                error_message TEXT
            );
            """
        )
        self.connection.commit()

    def start_run(self, start_page: int, end_page: int | None, page_size: int, attachments_enabled: bool) -> int:
        cursor = self.connection.execute(
            """
            INSERT INTO clip_treaty_crawl_runs (
                started_at, requested_start_page, requested_end_page, page_size,
                attachments_enabled, status
            ) VALUES (?, ?, ?, ?, ?, 'running')
            """,
            (utc_now(), start_page, end_page, page_size, int(attachments_enabled)),
        )
        self.connection.commit()
        return int(cursor.lastrowid)

    def finish_run(self, run_id: int, stats: CrawlStats, status: str, error_message: str | None = None) -> None:
        self.connection.execute(
            """
            UPDATE clip_treaty_crawl_runs
               SET finished_at = ?, status = ?, pages_requested = ?, treaties_seen = ?,
                   treaties_saved = ?, attachments_seen = ?, attachments_downloaded = ?,
                   attachment_failures = ?, error_message = ?
             WHERE run_id = ?
            """,
            (
                utc_now(), status, stats.pages_requested, stats.treaties_seen,
                stats.treaties_saved, stats.attachments_seen, stats.attachments_downloaded,
                stats.attachment_failures, error_message, run_id,
            ),
        )
        self.connection.commit()

    def upsert_treaty(self, treaty: TreatySummary, detail_html: str, detail_text: str) -> None:
        now = utc_now()
        self.connection.execute(
            """
            INSERT INTO clip_treaties (
                trty_srno, treaty_name, category_code, category_name, countries,
                treaty_number, effective_date, registered_date, list_page, list_row_number,
                korean_content, english_content, detail_text, detail_html, source_url,
                raw_list_json, crawled_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(trty_srno) DO UPDATE SET
                treaty_name = excluded.treaty_name,
                category_code = excluded.category_code,
                category_name = excluded.category_name,
                countries = excluded.countries,
                treaty_number = excluded.treaty_number,
                effective_date = excluded.effective_date,
                registered_date = excluded.registered_date,
                list_page = excluded.list_page,
                list_row_number = excluded.list_row_number,
                korean_content = excluded.korean_content,
                english_content = excluded.english_content,
                detail_text = excluded.detail_text,
                detail_html = excluded.detail_html,
                source_url = excluded.source_url,
                raw_list_json = excluded.raw_list_json,
                crawled_at = excluded.crawled_at,
                updated_at = excluded.updated_at
            """,
            (
                treaty.trty_srno, treaty.name, treaty.category_code, treaty.category_name,
                treaty.countries, treaty.treaty_number, treaty.effective_date,
                treaty.registered_date, treaty.list_page, treaty.list_row_number,
                treaty.korean_content, treaty.english_content, detail_text, detail_html,
                f"{DETAIL_URL}?trtySrno={treaty.trty_srno}", treaty.raw_json, now, now,
            ),
        )

    def upsert_attachment(self, treaty_srno: str, attachment: Attachment, relative_path: str | None,
                          file_size_bytes: int | None, checksum: str | None, status: str,
                          error: str | None) -> None:
        self.connection.execute(
            """
            INSERT INTO clip_treaty_attachments (
                attachment_id, trty_srno, file_name, displayed_size, relative_path,
                file_size_bytes, sha256, download_url, download_status, last_error,
                downloaded_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(attachment_id) DO UPDATE SET
                trty_srno = excluded.trty_srno,
                file_name = excluded.file_name,
                displayed_size = excluded.displayed_size,
                relative_path = excluded.relative_path,
                file_size_bytes = excluded.file_size_bytes,
                sha256 = excluded.sha256,
                download_url = excluded.download_url,
                download_status = excluded.download_status,
                last_error = excluded.last_error,
                downloaded_at = excluded.downloaded_at,
                updated_at = excluded.updated_at
            """,
            (
                attachment.attachment_id, treaty_srno, attachment.filename,
                attachment.displayed_size, relative_path, file_size_bytes, checksum,
                f"{DOWNLOAD_URL}?attchFileId={attachment.attachment_id}", status, error,
                utc_now() if status == "downloaded" else None, utc_now(),
            ),
        )

    def attachment_file(self, attachment_id: str) -> str | None:
        row = self.connection.execute(
            "SELECT relative_path FROM clip_treaty_attachments WHERE attachment_id = ? AND download_status = 'downloaded'",
            (attachment_id,),
        ).fetchone()
        return str(row["relative_path"]) if row and row["relative_path"] else None

    def commit(self) -> None:
        self.connection.commit()


class TreatyCrawler:
    """Page-aware client for the public CLIP treaty screens."""

    def __init__(self, database: TreatyDatabase, delay_seconds: float, timeout_seconds: float,
                 logger: logging.Logger) -> None:
        self.database = database
        self.delay_seconds = max(0.0, delay_seconds)
        self.timeout_seconds = timeout_seconds
        self.logger = logger
        self.session = self._build_session()
        self.attachments_root = database.db_path.parent / "attachments" / ATTACHMENT_CATEGORY

    @staticmethod
    def _build_session() -> requests.Session:
        session = requests.Session()
        retry = Retry(
            total=3,
            connect=3,
            read=3,
            status=3,
            backoff_factor=1.0,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"GET", "POST"}),
            respect_retry_after_header=True,
        )
        adapter = HTTPAdapter(max_retries=retry)
        session.mount("https://", adapter)
        session.headers.update(
            {
                "User-Agent": "CLIP-Treaty-Archive/1.0 (+public-record-preservation)",
                "Accept": "text/html,application/json,application/octet-stream;q=0.9,*/*;q=0.8",
                "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
                "Referer": LIST_SCREEN_URL,
            }
        )
        return session

    def initialise(self) -> None:
        """Load the public listing screen once to establish portal cookies."""
        response = self.session.get(LIST_SCREEN_URL, params={"trtyRlmCd": "all"}, timeout=self.timeout_seconds)
        response.raise_for_status()
        self._pause()

    def _pause(self) -> None:
        if self.delay_seconds:
            time.sleep(self.delay_seconds)

    def _post_list(self, page: int, page_size: int, treaty_name: str | None,
                   country_name: str | None) -> dict[str, Any]:
        form = {
            "pageIndex": str(page),
            "pageUnit": str(page_size),
            "pageSize": "5",
            "orderColumns": "TKEF_DT desc",
            "trtyRlmCd": "all",
            "filterOnYn": "N",
            "searchUseYn": "",
            "filters": "",
            "trtyNm": treaty_name or "",
            "trtyCncluCntyNm": country_name or "",
        }
        response = self.session.post(LIST_API_URL, data=form, timeout=self.timeout_seconds)
        response.raise_for_status()
        self._pause()
        try:
            payload = response.json()
        except ValueError as exc:
            raise CrawlerError("목록 API가 JSON 응답을 반환하지 않았습니다.") from exc
        if not isinstance(payload, dict) or "rTrtyInfoLst" not in payload:
            raise CrawlerError("목록 API 응답에서 rTrtyInfoLst 필드를 찾지 못했습니다.")
        return payload

    @staticmethod
    def _summary_from_item(item: dict[str, Any], list_page: int) -> TreatySummary:
        serial = clean_text(item.get("trtySrno"))
        name = clean_text(item.get("trtyNm"))
        if not serial or not name:
            raise CrawlerError(f"목록 데이터에 필수 식별자 또는 조약명이 없습니다: {item!r}")
        row_number_value = item.get("rowNum")
        try:
            row_number = int(row_number_value) if row_number_value is not None else None
        except (TypeError, ValueError):
            row_number = None
        return TreatySummary(
            trty_srno=serial,
            name=name,
            category_code=clean_text(item.get("trtyRlmCd")),
            category_name=clean_text(item.get("trtyRlmNm")),
            countries=clean_text(item.get("trtyCncluCntyNm")),
            treaty_number=clean_text(item.get("trtyNoNm")),
            effective_date=clean_text(item.get("tkefDt")),
            registered_date=clean_text(item.get("ofgzRgsrDt")),
            list_page=list_page,
            list_row_number=row_number,
            korean_content=clean_text(item.get("trtyKoreCn")),
            english_content=clean_text(item.get("trtyEnglCn")),
            raw_json=json_dumps(item),
        )

    def list_page(self, page: int, page_size: int, treaty_name: str | None,
                  country_name: str | None) -> tuple[list[TreatySummary], int]:
        payload = self._post_list(page, page_size, treaty_name, country_name)
        pagination = payload.get("paginationInfo") or {}
        total_records = pagination.get("totalRecordCount")
        try:
            total = int(total_records)
        except (TypeError, ValueError) as exc:
            raise CrawlerError("목록 API 응답에서 전체 건수를 읽지 못했습니다.") from exc
        items = payload.get("rTrtyInfoLst") or []
        if not isinstance(items, list):
            raise CrawlerError("목록 API의 rTrtyInfoLst 값이 목록이 아닙니다.")
        return [self._summary_from_item(item, page) for item in items], total

    def detail(self, treaty: TreatySummary) -> tuple[str, str, list[Attachment]]:
        response = self.session.get(DETAIL_URL, params={"trtySrno": treaty.trty_srno}, timeout=self.timeout_seconds)
        response.raise_for_status()
        self._pause()
        html = response.text
        if "data-attchfileid" not in html and treaty.trty_srno not in html:
            raise CrawlerError(f"상세 화면이 예상한 조약 식별자를 포함하지 않습니다: {treaty.trty_srno}")
        return html, text_from_html(html), extract_attachments(html)

    def _attachment_path(self, treaty: TreatySummary, attachment: Attachment) -> Path:
        safe_name = safe_filename(attachment.filename, fallback=f"{attachment.attachment_id}.bin")
        # The category directory is deliberate: it keeps files attributable to this crawl screen.
        return self.attachments_root / treaty.trty_srno / f"{attachment.attachment_id}__{safe_name}"

    def download_attachment(self, treaty: TreatySummary, attachment: Attachment,
                            refresh: bool = False) -> tuple[Path, int, str, bool]:
        destination = self._attachment_path(treaty, attachment)
        existing_relative = self.database.attachment_file(attachment.attachment_id)
        if not refresh and existing_relative:
            existing_path = self.database.db_path.parent / existing_relative
            if existing_path.is_file() and existing_path.stat().st_size > 0:
                return existing_path, existing_path.stat().st_size, sha256_file(existing_path), False

        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_suffix(destination.suffix + ".part")
        if temporary.exists():
            temporary.unlink()

        # This mirrors the portal UI: confirm the attachment ID before asking
        # the browser-oriented endpoint to stream a binary response.
        check_response = self.session.post(
            DOWNLOAD_CHECK_URL,
            data={"attchFileId": attachment.attachment_id},
            timeout=self.timeout_seconds,
        )
        check_response.raise_for_status()
        try:
            available = str(check_response.json().get("checkResult", "")).lower() == "true"
        except ValueError as exc:
            raise CrawlerError(
                f"첨부파일 확인 API가 JSON을 반환하지 않았습니다: {attachment.attachment_id}"
            ) from exc
        finally:
            check_response.close()
        if not available:
            raise CrawlerError(f"포털에서 첨부파일을 찾지 못했습니다: {attachment.attachment_id}")
        self._pause()

        response = self.session.get(
            DOWNLOAD_URL,
            params={"attchFileId": attachment.attachment_id},
            timeout=(self.timeout_seconds, max(120, self.timeout_seconds)),
            stream=True,
        )
        response.raise_for_status()
        content_type = (response.headers.get("Content-Type") or "").lower()
        if "text/html" in content_type:
            response.close()
            raise CrawlerError(f"첨부파일 다운로드가 HTML을 반환했습니다: {attachment.attachment_id}")

        size = 0
        try:
            with temporary.open("wb") as output:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        output.write(chunk)
                        size += len(chunk)
        finally:
            response.close()
        self._pause()

        if size == 0:
            temporary.unlink(missing_ok=True)
            raise CrawlerError(f"빈 첨부파일 응답: {attachment.attachment_id}")
        temporary.replace(destination)
        return destination, size, sha256_file(destination), True

    def crawl(self, start_page: int, end_page: int | None, page_size: int,
              download_attachments: bool, treaty_name: str | None,
              country_name: str | None, limit: int | None,
              refresh_attachments: bool) -> CrawlStats:
        stats = CrawlStats()
        self.initialise()
        first_items, total_records = self.list_page(1, page_size, treaty_name, country_name)
        total_pages = max(1, math.ceil(total_records / page_size)) if total_records else 0
        final_page = min(end_page or total_pages, total_pages)
        if start_page > total_pages and total_pages:
            raise CrawlerError(f"요청한 시작 페이지({start_page})가 전체 페이지({total_pages})를 초과합니다.")
        if end_page is not None and end_page < start_page:
            raise CrawlerError("종료 페이지는 시작 페이지보다 작을 수 없습니다.")

        self.logger.info("검색 결과: %s건, %s페이지 (페이지당 %s건)", total_records, total_pages, page_size)
        if not total_records:
            return stats

        processed = 0
        for page in range(start_page, final_page + 1):
            if page == 1:
                treaties = first_items
            else:
                treaties, _ = self.list_page(page, page_size, treaty_name, country_name)
            stats.pages_requested += 1
            self.logger.info("페이지 %s/%s: %s건 처리", page, final_page, len(treaties))

            for treaty in treaties:
                if limit is not None and processed >= limit:
                    self.database.commit()
                    return stats
                processed += 1
                stats.treaties_seen += 1
                try:
                    detail_html, detail_text, attachments = self.detail(treaty)
                    self.database.upsert_treaty(treaty, detail_html, detail_text)
                    stats.treaties_saved += 1
                    stats.attachments_seen += len(attachments)
                    self.logger.info("  [%s] %s (첨부 %s건)", treaty.trty_srno, treaty.name, len(attachments))

                    for attachment in attachments:
                        if not download_attachments:
                            self.database.upsert_attachment(
                                treaty.trty_srno, attachment, None, None, None, "pending", None
                            )
                            continue
                        try:
                            path, size, digest, downloaded = self.download_attachment(
                                treaty, attachment, refresh=refresh_attachments
                            )
                            relative_path = str(path.relative_to(self.database.db_path.parent))
                            self.database.upsert_attachment(
                                treaty.trty_srno, attachment, relative_path, size, digest, "downloaded", None
                            )
                            if downloaded:
                                stats.attachments_downloaded += 1
                        except Exception as exc:  # Record attachment errors but continue with other public records.
                            stats.attachment_failures += 1
                            self.database.upsert_attachment(
                                treaty.trty_srno, attachment, None, None, None, "failed", str(exc)
                            )
                            self.logger.error("  첨부파일 실패 [%s]: %s", attachment.attachment_id, exc)
                    self.database.commit()
                except Exception:
                    self.database.commit()
                    raise
        return stats


def configure_logging(verbose: bool) -> logging.Logger:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    return logging.getLogger("clip_treaty_crawler")


def parse_arguments(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="관세법령정보포털(CLIP) 조약/협정의 본문과 첨부파일을 SQLite에 저장합니다.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--db",
        default=DEFAULT_WINDOWS_DB,
        help="기존 행정규칙 SQLite DB 경로. clip_* 테이블만 추가됩니다.",
    )
    page_group = parser.add_mutually_exclusive_group()
    page_group.add_argument("--page", type=int, help="지정한 목록 페이지 한 페이지만 수집합니다.")
    page_group.add_argument("--start-page", type=int, help="수집 시작 페이지(종료 페이지와 함께 사용 가능).")
    parser.add_argument("--end-page", type=int, help="수집 종료 페이지(포함). 생략하면 마지막 페이지까지 수집합니다.")
    parser.add_argument("--page-size", type=int, choices=VALID_PAGE_SIZES, default=10, help="목록 조회 건수.")
    parser.add_argument("--treaty-name", help="조약명 검색어. 생략하면 모든 조약/협정을 수집합니다.")
    parser.add_argument("--country", help="조약체결국가명 검색어. 생략하면 모든 국가를 수집합니다.")
    parser.add_argument("--no-attachments", action="store_true", help="첨부 파일은 내려받지 않고 메타데이터만 저장합니다.")
    parser.add_argument("--refresh-attachments", action="store_true", help="이미 성공한 첨부파일도 다시 내려받습니다.")
    parser.add_argument("--limit", type=int, help="검증용 최대 조약 처리 건수. 운영 수집에서는 사용하지 마십시오.")
    parser.add_argument("--delay", type=float, default=0.35, help="포털 요청 사이의 최소 대기 시간(초).")
    parser.add_argument("--timeout", type=float, default=30.0, help="일반 HTTP 요청 제한 시간(초).")
    parser.add_argument("--verbose", action="store_true", help="디버그 로그를 표시합니다.")
    arguments = parser.parse_args(argv)

    if arguments.page is not None:
        arguments.start_page = arguments.page
        arguments.end_page = arguments.page
    elif arguments.start_page is None:
        arguments.start_page = 1
    if arguments.start_page < 1:
        parser.error("--page 또는 --start-page는 1 이상이어야 합니다.")
    if arguments.end_page is not None and arguments.end_page < 1:
        parser.error("--end-page는 1 이상이어야 합니다.")
    if arguments.end_page is not None and arguments.end_page < arguments.start_page:
        parser.error("--end-page는 시작 페이지보다 작을 수 없습니다.")
    if arguments.limit is not None and arguments.limit < 1:
        parser.error("--limit은 1 이상이어야 합니다.")
    if arguments.delay < 0:
        parser.error("--delay는 0 이상이어야 합니다.")
    if arguments.timeout <= 0:
        parser.error("--timeout은 0보다 커야 합니다.")
    return arguments


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_arguments(argv)
    logger = configure_logging(args.verbose)
    database = TreatyDatabase(Path(args.db))
    crawler = TreatyCrawler(database, args.delay, args.timeout, logger)
    run_id = database.start_run(args.start_page, args.end_page, args.page_size, not args.no_attachments)
    stats = CrawlStats()

    try:
        stats = crawler.crawl(
            start_page=args.start_page,
            end_page=args.end_page,
            page_size=args.page_size,
            download_attachments=not args.no_attachments,
            treaty_name=args.treaty_name,
            country_name=args.country,
            limit=args.limit,
            refresh_attachments=args.refresh_attachments,
        )
        status = "completed" if stats.attachment_failures == 0 else "completed_with_attachment_errors"
        database.finish_run(run_id, stats, status)
        logger.info(
            "완료: 페이지 %s, 조약 %s/%s, 첨부파일 신규 다운로드 %s, 첨부파일 실패 %s",
            stats.pages_requested, stats.treaties_saved, stats.treaties_seen,
            stats.attachments_downloaded, stats.attachment_failures,
        )
        return 0 if stats.attachment_failures == 0 else 2
    except KeyboardInterrupt:
        database.finish_run(run_id, stats, "interrupted", "사용자 중단")
        logger.warning("사용자 중단으로 종료했습니다. 완료된 항목은 SQLite에 보존되었습니다.")
        return 130
    except Exception as exc:
        database.finish_run(run_id, stats, "failed", str(exc))
        logger.exception("수집 실패: %s", exc)
        return 1
    finally:
        database.close()


if __name__ == "__main__":
    sys.exit(main())
