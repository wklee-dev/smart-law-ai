"""국민참여입법센터 통합입법예고 주차 기반 크롤러.

공개 목록·상세 페이지를 조회하여 (부처)입법예고와 (부처)행정예고의
본문 및 첨부파일을 SQLite에 적재한다. 검색 키워드는 사용하지 않는다.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
import re
import sqlite3
import time
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE_URL = "https://opinion.lawmaking.go.kr"
DEFAULT_DB_PATH = Path(r"D:\SQLiteDB\smart_law_ai.db")
DEFAULT_DOWNLOAD_ROOT = Path(r"C:\SQLiteDB\downloads")
PROGRAM_VERSION = "3.0.0"
LEGISLATION_MINISTRIES = (
    "재정경제부", "관세청", "산업통상부", "국토교통부", "해양수산부",
    "식품의약품안전처", "기후에너지환경부", "농림축산식품부",
)
ADMINISTRATIVE_MINISTRIES = (
    "재정경제부", "산업통상부", "국토교통부", "해양수산부",
    "기후에너지환경부", "농림축산식품부",
)


def institution_filters(notices: list[str]) -> dict[str, list[str]]:
    """각 화면의 고정 기관 목록을 이력·실행 결과에 기록한다."""
    return {
        "legislation": list(LEGISLATION_MINISTRIES) if "legislation" in notices else [],
        "administrative": list(ADMINISTRATIVE_MINISTRIES) if "administrative" in notices else [],
    }


LIST_URLS = {
    "legislation": "/gcom/ogLmPp",
    "administrative": "/gcom/admpp",
}
KIND_LABELS = {
    "legislation": "(부처)입법예고",
    "administrative": "(부처)행정예고",
}
DETAIL_PREFIXES = {
    "legislation": "/gcom/ogLmPp/",
    "administrative": "/gcom/admpp/",
}
FILE_PATTERN = re.compile(r"fnDownload\(\s*['\"](?P<seq>\d+)['\"]\s*,\s*['\"](?P<token>[^'\"]+)['\"]\s*\)")
SEQ_PATTERN = re.compile(r"/(?:ogLmPp|admpp)/(\d+)")
SPACE_PATTERN = re.compile(r"\s+")
INVALID_FILE_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

LOGGER = logging.getLogger("national_law_notice_crawler")


@dataclass(frozen=True)
class WeekRange:
    iso_year: int
    iso_week: int
    start_date: date
    end_date: date
    period_type: str = "ISO_WEEK"

    @property
    def start_compact(self) -> str:
        return self.start_date.strftime("%Y%m%d")

    @property
    def end_compact(self) -> str:
        return self.end_date.strftime("%Y%m%d")

    @property
    def key(self) -> str:
        if self.period_type == "DATE_RANGE":
            return f"{self.start_compact}~{self.end_compact}"
        return f"{self.iso_year}-W{self.iso_week:02d}"


def iso_week_range(iso_year: int, iso_week: int) -> WeekRange:
    """ISO 8601 연도·주차의 월요일~일요일 범위를 반환한다."""
    if not 1 <= iso_week <= date(iso_year, 12, 28).isocalendar().week:
        max_week = date(iso_year, 12, 28).isocalendar().week
        raise ValueError(f"{iso_year}년의 ISO 주차는 1~{max_week} 범위여야 합니다.")
    try:
        start = date.fromisocalendar(iso_year, iso_week, 1)
    except ValueError as exc:
        raise ValueError("올바른 ISO 연도·주차를 입력하세요.") from exc
    return WeekRange(iso_year, iso_week, start, start.fromordinal(start.toordinal() + 6))


def date_range(start_compact: str, end_compact: str) -> WeekRange:
    """YYYYMMDD 형식의 직접 입력 기간을 검증하고 수집 범위로 변환한다."""
    if not re.fullmatch(r"\d{8}", start_compact) or not re.fullmatch(r"\d{8}", end_compact):
        raise ValueError("시작일과 종료일은 YYYYMMDD 형식의 8자리 숫자여야 합니다. (예: 20260301)")
    try:
        start = datetime.strptime(start_compact, "%Y%m%d").date()
        end = datetime.strptime(end_compact, "%Y%m%d").date()
    except ValueError as exc:
        raise ValueError("시작일과 종료일은 YYYYMMDD 형식의 실제 날짜여야 합니다. (예: 20260301)") from exc
    if start > end:
        raise ValueError("시작일은 종료일보다 늦을 수 없습니다.")
    iso = start.isocalendar()
    return WeekRange(iso.year, iso.week, start, end, period_type="DATE_RANGE")


def selected_period(args: argparse.Namespace) -> WeekRange:
    """주차 입력 또는 직접 날짜 범위 입력 중 정확히 하나를 수집 범위로 해석한다."""
    has_week_input = args.year is not None or args.week is not None
    has_date_input = args.start_date is not None or args.end_date is not None
    if has_week_input and has_date_input:
        raise ValueError("주차(--year, --week)와 직접 날짜 범위(--start-date, --end-date)는 함께 사용할 수 없습니다.")
    if has_date_input:
        if not args.start_date or not args.end_date:
            raise ValueError("직접 날짜 범위는 --start-date와 --end-date를 함께 입력해야 합니다.")
        return date_range(args.start_date, args.end_date)
    if args.year is None or args.week is None:
        raise ValueError("--year와 --week를 함께 입력하거나, --start-date와 --end-date를 함께 입력해야 합니다.")
    return iso_week_range(args.year, args.week)


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = SPACE_PATTERN.sub(" ", value.replace("\xa0", " ")).strip()
    return cleaned or None


def parse_korean_date(value: str | None) -> str | None:
    """상세/목록 화면의 'YYYY. M. D.' 표기를 ISO 날짜로 정규화한다."""
    if not value:
        return None
    match = re.search(r"(20\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.", value)
    if not match:
        return None
    return f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"


def parse_date_range(value: str | None) -> tuple[str | None, str | None]:
    if not value:
        return None, None
    dates = re.findall(r"20\d{2}\s*\.\s*\d{1,2}\s*\.\s*\d{1,2}\s*\.", value)
    normalized = [parse_korean_date(item) for item in dates]
    normalized = [item for item in normalized if item]
    return (normalized[0] if normalized else None, normalized[1] if len(normalized) > 1 else None)


def sanitize_filename(name: str, fallback: str = "attachment") -> str:
    name = INVALID_FILE_CHARS.sub("_", name).strip(" .")
    name = SPACE_PATTERN.sub(" ", name)
    return (name or fallback)[:180]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def make_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        raise_on_status=False,
    )
    session.mount("https://", HTTPAdapter(max_retries=retry))
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (compatible; NationalLawNoticeCrawler/1.0; +https://opinion.lawmaking.go.kr/)",
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7",
        }
    )
    return session


class RateLimitedClient:
    def __init__(self, delay_seconds: float = 0.35) -> None:
        self.session = make_session()
        self.delay_seconds = max(0.0, delay_seconds)
        self._last_request = 0.0

    def get(self, url: str, **kwargs: Any) -> requests.Response:
        remaining = self.delay_seconds - (time.monotonic() - self._last_request)
        if remaining > 0:
            time.sleep(remaining)
        response = self.session.get(url, timeout=(10, 60), **kwargs)
        self._last_request = time.monotonic()
        response.raise_for_status()
        return response


def _detail_anchor(row: Tag, kind: str) -> Tag | None:
    prefix = DETAIL_PREFIXES[kind]
    for anchor in row.select("a[href]"):
        href = anchor.get("href", "")
        if href.startswith(prefix) and "/myOpn" not in href:
            return anchor
    return None


def parse_list_page(html: str, kind: str) -> list[dict[str, Any]]:
    """한 목록 페이지에서 공고별 상세 URL과 목록 메타데이터를 수집한다."""
    soup = BeautifulSoup(html, "lxml")
    notices: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in soup.select("table tbody tr"):
        anchor = _detail_anchor(row, kind)
        if anchor is None:
            continue
        href = anchor.get("href", "")
        match = SEQ_PATTERN.search(href)
        if not match or match.group(1) in seen:
            continue
        sequence = match.group(1)
        seen.add(sequence)
        cells = {cell.get("data-th", "").strip(): clean_text(cell.get_text(" ", strip=True)) for cell in row.select("td[data-th]")}
        period = cells.get("입법의견 접수기간")
        start_date, end_date = parse_date_range(period)
        title = clean_text(anchor.get_text(" ", strip=True))
        # 행정예고 목록의 '진행' 상태 배지는 제목의 첫 텍스트로 섞일 수 있다.
        if title and title.startswith("진행 "):
            title = title[3:].strip()
        item: dict[str, Any] = {
            "notice_sequence": sequence,
            "source_url": urljoin(BASE_URL, href),
            "title": title,
            "list_start_date": start_date,
            "list_end_date": end_date,
            "list_view_count": cells.get("조회수"),
            "list_cells": cells,
        }
        if kind == "legislation":
            department = cells.get("소관부처 (법령종류)") or ""
            department_match = re.match(r"^(.*?)(?:\s*\(([^)]*)\))?$", department)
            item.update(
                {
                    "department": clean_text(department_match.group(1)) if department_match else department,
                    "law_type": clean_text(department_match.group(2)) if department_match and department_match.group(2) else None,
                    "law_field": cells.get("법령분야 (주요적용대상)"),
                }
            )
        else:
            office = cells.get("기관 (공고번호)") or ""
            office_match = re.match(r"(.*?)(\(.*\))?$", office)
            item.update(
                {
                    "rule_type": cells.get("행정규칙"),
                    "institution": clean_text(office_match.group(1)) if office_match else office,
                    "notice_number": clean_text(office_match.group(2).strip("()")) if office_match and office_match.group(2) else None,
                }
            )
        notices.append(item)
    return notices


def page_count(html: str) -> int:
    soup = BeautifulSoup(html, "lxml")
    numbers: list[int] = []
    for anchor in soup.select("div.pagination a[href]"):
        match = re.search(r"pageIndex=(\d+)", anchor.get("href", ""))
        if match:
            numbers.append(int(match.group(1)))
    return max(numbers, default=1)


def validate_list_response(html: str, kind: str, params: dict[str, str]) -> int:
    """기간 조건과 목록 구조를 검증한다. 오류 화면을 0건으로 오인하지 않는다."""
    soup = BeautifulSoup(html, "lxml")
    for name in ("stYd", "edYd"):
        node = soup.select_one(f'input[name="{name}"]')
        if node is None or node.get("value") != params[name]:
            raise ValueError(f"목록 응답에서 {name} 기간 조건이 유지되지 않았습니다.")
    total_node = next((node for node in soup.select("p.numBuild") if "전체" in node.get_text()), None)
    match = re.search(r"전체\s*([\d,]+)\s*건", total_node.get_text(" ", strip=True)) if total_node else None
    if match is None or soup.select_one(".gridCnt table") is None:
        raise ValueError(f"{KIND_LABELS[kind]} 목록 구조 또는 전체 건수를 확인하지 못했습니다.")
    return int(match.group(1).replace(",", ""))


def parse_detail_page(html: str, kind: str, source_url: str) -> dict[str, Any]:
    """상세 공고 페이지의 메타데이터·본문·첨부파일 정보를 파싱한다."""
    soup = BeautifulSoup(html, "lxml")
    sequence_match = SEQ_PATTERN.search(source_url)
    if not sequence_match:
        hidden = soup.select_one('input[name="ogLmPpSeq"], input[name="ogAdmPpSeq"]')
        sequence = hidden.get("value") if hidden else None
    else:
        sequence = sequence_match.group(1)
    title_node = soup.select_one(".subjectHead_tit")
    if title_node is not None:
        for badge in title_node.select("span"):
            badge.decompose()
    title = clean_text(title_node.get_text(" ", strip=True)) if title_node else None

    detail_info: dict[str, str | None] = {}
    for item in soup.select("ul.detailInfo > li"):
        label = item.select_one(".label_tit")
        if label is None:
            continue
        label_text = clean_text(label.get_text(" ", strip=True))
        values = [clean_text(part.get_text(" ", strip=True)) for part in item.find_all("span", recursive=False) if "label_tit" not in (part.get("class") or [])]
        if label_text:
            detail_info[label_text] = clean_text(" ".join(part for part in values if part))

    content_node = soup.select_one("div.detailContent")
    body_html = str(content_node) if content_node else None
    body_text = clean_text(content_node.get_text("\n", strip=True)) if content_node else None
    attachments = parse_attachments(soup, kind, sequence or "")
    start_date, end_date = parse_date_range(detail_info.get("접수기간") or detail_info.get("예고기간"))
    return {
        "notice_sequence": sequence,
        "title": title,
        "detail_info": detail_info,
        "body_html": body_html,
        "body_text": body_text,
        "attachments": attachments,
        "start_date": start_date,
        "end_date": end_date,
    }


def parse_attachments(soup: BeautifulSoup, kind: str, notice_sequence: str) -> list[dict[str, str]]:
    attachments: list[dict[str, str]] = []
    for row in soup.select("div.detailAttach table tr"):
        category_node = row.select_one("th")
        category = clean_text(category_node.get_text(" ", strip=True)) if category_node else "첨부파일"
        for button in row.select('button[onclick*="fnDownload"]'):
            match = FILE_PATTERN.search(button.get("onclick", ""))
            if not match:
                continue
            clone = BeautifulSoup(str(button), "lxml")
            for hidden in clone.select(".a11y_hidden"):
                hidden.decompose()
            file_name = clean_text(clone.get_text(" ", strip=True)) or f"attachment_{match.group('seq')}"
            attachments.append(
                {
                    "notice_type": kind,
                    "notice_sequence": notice_sequence,
                    "file_sequence": match.group("seq"),
                    "download_token": match.group("token"),
                    "category": category or "첨부파일",
                    "file_name": file_name,
                    "download_url": f"{BASE_URL}/file/download/{match.group('seq')}/{match.group('token')}",
                }
            )
    return attachments


SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS nlc_week_crawl_history (
    run_id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_type TEXT NOT NULL DEFAULT 'ISO_WEEK' CHECK (period_type IN ('ISO_WEEK', 'DATE_RANGE')),
    iso_year INTEGER NOT NULL,
    iso_week INTEGER NOT NULL,
    week_start_date TEXT NOT NULL,
    week_end_date TEXT NOT NULL,
    requested_notices TEXT NOT NULL,
    requested_ministries TEXT,
    download_files INTEGER NOT NULL DEFAULT 1,
    delay_seconds REAL NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED')),
    legislation_discovered INTEGER NOT NULL DEFAULT 0,
    legislation_completed INTEGER NOT NULL DEFAULT 0,
    administrative_discovered INTEGER NOT NULL DEFAULT 0,
    administrative_completed INTEGER NOT NULL DEFAULT 0,
    attachment_discovered INTEGER NOT NULL DEFAULT 0,
    attachment_downloaded INTEGER NOT NULL DEFAULT 0,
    attachment_reused INTEGER NOT NULL DEFAULT 0,
    attachment_failed INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    error_summary TEXT,
    program_version TEXT NOT NULL DEFAULT '3.0.0',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nlc_history_week ON nlc_week_crawl_history (iso_year, iso_week, started_at DESC);

CREATE TABLE IF NOT EXISTS nlc_ministry_legislation_notice (
    notice_sequence TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    title TEXT,
    department TEXT,
    law_type TEXT,
    law_field TEXT,
    target_audience TEXT,
    notice_number TEXT,
    announcement_date TEXT,
    start_date TEXT,
    end_date TEXT,
    view_count INTEGER,
    detail_info_json TEXT NOT NULL DEFAULT '{}',
    body_html TEXT,
    body_text TEXT,
    body_sha256 TEXT,
    first_collected_at TEXT NOT NULL,
    last_collected_at TEXT NOT NULL,
    last_run_id INTEGER,
    FOREIGN KEY(last_run_id) REFERENCES nlc_week_crawl_history(run_id)
);

CREATE INDEX IF NOT EXISTS idx_nlc_legislation_dates ON nlc_ministry_legislation_notice (start_date, end_date);

CREATE TABLE IF NOT EXISTS nlc_ministry_administrative_notice (
    notice_sequence TEXT PRIMARY KEY,
    source_url TEXT NOT NULL,
    title TEXT,
    rule_type TEXT,
    institution TEXT,
    notice_number TEXT,
    announcement_date TEXT,
    start_date TEXT,
    end_date TEXT,
    phone TEXT,
    fax TEXT,
    email TEXT,
    view_count INTEGER,
    detail_info_json TEXT NOT NULL DEFAULT '{}',
    body_html TEXT,
    body_text TEXT,
    body_sha256 TEXT,
    first_collected_at TEXT NOT NULL,
    last_collected_at TEXT NOT NULL,
    last_run_id INTEGER,
    FOREIGN KEY(last_run_id) REFERENCES nlc_week_crawl_history(run_id)
);

CREATE INDEX IF NOT EXISTS idx_nlc_administrative_dates ON nlc_ministry_administrative_notice (start_date, end_date);

CREATE TABLE IF NOT EXISTS nlc_notice_attachment (
    attachment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_type TEXT NOT NULL CHECK (notice_type IN ('legislation', 'administrative')),
    notice_sequence TEXT NOT NULL,
    file_sequence TEXT NOT NULL,
    category TEXT,
    file_name TEXT NOT NULL,
    download_url TEXT NOT NULL,
    local_path TEXT,
    file_size INTEGER,
    checksum_sha256 TEXT,
    download_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (download_status IN ('PENDING', 'SUCCESS', 'FAILED')),
    download_error TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    downloaded_at TEXT,
    last_run_id INTEGER,
    UNIQUE (notice_type, notice_sequence, file_sequence),
    FOREIGN KEY(last_run_id) REFERENCES nlc_week_crawl_history(run_id)
);

CREATE INDEX IF NOT EXISTS idx_nlc_attachment_notice ON nlc_notice_attachment (notice_type, notice_sequence);

CREATE TABLE IF NOT EXISTS nlc_crawl_error (
    error_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    notice_type TEXT,
    notice_sequence TEXT,
    stage TEXT NOT NULL,
    source_url TEXT,
    error_message TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    FOREIGN KEY(run_id) REFERENCES nlc_week_crawl_history(run_id)
);
"""


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA busy_timeout = 5000")
        self.connection.executescript(SCHEMA_SQL)
        self._migrate_history_schema()
        self.connection.commit()

    def _migrate_history_schema(self) -> None:
        """기존 DB를 보존하며 기간 유형과 부처 선택 이력 컬럼을 추가한다."""
        columns = {row[1] for row in self.connection.execute("PRAGMA table_info(nlc_week_crawl_history)")}
        if "period_type" not in columns:
            self.connection.execute(
                "ALTER TABLE nlc_week_crawl_history ADD COLUMN period_type TEXT NOT NULL DEFAULT 'ISO_WEEK'"
            )
        if "requested_ministries" not in columns:
            self.connection.execute("ALTER TABLE nlc_week_crawl_history ADD COLUMN requested_ministries TEXT")

    def close(self) -> None:
        self.connection.close()

    def start_run(self, week: WeekRange, notices: list[str], download_files: bool, delay_seconds: float) -> int:
        selection = institution_filters(notices)
        cursor = self.connection.execute(
            """INSERT INTO nlc_week_crawl_history
               (period_type, iso_year, iso_week, week_start_date, week_end_date, requested_notices, requested_ministries, download_files, delay_seconds, started_at, status, program_version)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RUNNING', ?)""",
            (
                week.period_type,
                week.iso_year,
                week.iso_week,
                week.start_date.isoformat(),
                week.end_date.isoformat(),
                json.dumps(notices, ensure_ascii=False),
                json.dumps(selection, ensure_ascii=False),
                int(download_files),
                delay_seconds,
                now_text(),
                PROGRAM_VERSION,
            ),
        )
        self.connection.commit()
        return int(cursor.lastrowid)

    def finish_run(self, run_id: int, counters: Counter[str], status: str, errors: list[str]) -> None:
        summary = "\n".join(errors[:10]) if errors else None
        self.connection.execute(
            """UPDATE nlc_week_crawl_history
               SET ended_at=?, status=?, legislation_discovered=?, legislation_completed=?,
                   administrative_discovered=?, administrative_completed=?, attachment_discovered=?,
                   attachment_downloaded=?, attachment_reused=?, attachment_failed=?, error_count=?, error_summary=?
               WHERE run_id=?""",
            (
                now_text(),
                status,
                counters.get("legislation_discovered", 0),
                counters.get("legislation_completed", 0),
                counters.get("administrative_discovered", 0),
                counters.get("administrative_completed", 0),
                counters.get("attachment_discovered", 0),
                counters.get("attachment_downloaded", 0),
                counters.get("attachment_reused", 0),
                counters.get("attachment_failed", 0),
                counters.get("error_count", 0),
                summary,
                run_id,
            ),
        )
        self.connection.commit()

    def log_error(self, run_id: int, kind: str | None, sequence: str | None, stage: str, source_url: str | None, error: Exception | str) -> None:
        self.connection.execute(
            """INSERT INTO nlc_crawl_error
               (run_id, notice_type, notice_sequence, stage, source_url, error_message, occurred_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (run_id, kind, sequence, stage, source_url, str(error)[:4000], now_text()),
        )
        self.connection.commit()

    def upsert_notice(self, kind: str, record: dict[str, Any], run_id: int) -> None:
        now = now_text()
        info = record["detail_info"]
        body_text = record.get("body_text")
        body_hash = hashlib.sha256((body_text or "").encode("utf-8")).hexdigest() if body_text else None
        view_count = to_int(record.get("list_view_count"))
        start_date = record.get("start_date") or record.get("list_start_date")
        end_date = record.get("end_date") or record.get("list_end_date")
        if kind == "legislation":
            self.connection.execute(
                """INSERT INTO nlc_ministry_legislation_notice (
                    notice_sequence, source_url, title, department, law_type, law_field, target_audience,
                    notice_number, announcement_date, start_date, end_date, view_count, detail_info_json,
                    body_html, body_text, body_sha256, first_collected_at, last_collected_at, last_run_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(notice_sequence) DO UPDATE SET
                    source_url=excluded.source_url, title=excluded.title, department=excluded.department,
                    law_type=excluded.law_type, law_field=excluded.law_field, target_audience=excluded.target_audience,
                    notice_number=excluded.notice_number, announcement_date=excluded.announcement_date,
                    start_date=excluded.start_date, end_date=excluded.end_date, view_count=excluded.view_count,
                    detail_info_json=excluded.detail_info_json, body_html=excluded.body_html, body_text=excluded.body_text,
                    body_sha256=excluded.body_sha256, last_collected_at=excluded.last_collected_at, last_run_id=excluded.last_run_id""",
                (
                    record["notice_sequence"], record["source_url"], record.get("title"), record.get("department"),
                    info.get("법령종류") or record.get("law_type"), info.get("법령분야") or record.get("law_field"),
                    info.get("적용대상"), info.get("공고번호"), parse_korean_date(info.get("공고일자")), start_date, end_date,
                    view_count, json.dumps(info, ensure_ascii=False), record.get("body_html"), body_text, body_hash,
                    now, now, run_id,
                ),
            )
        else:
            self.connection.execute(
                """INSERT INTO nlc_ministry_administrative_notice (
                    notice_sequence, source_url, title, rule_type, institution, notice_number, announcement_date,
                    start_date, end_date, phone, fax, email, view_count, detail_info_json, body_html, body_text,
                    body_sha256, first_collected_at, last_collected_at, last_run_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(notice_sequence) DO UPDATE SET
                    source_url=excluded.source_url, title=excluded.title, rule_type=excluded.rule_type,
                    institution=excluded.institution, notice_number=excluded.notice_number,
                    announcement_date=excluded.announcement_date, start_date=excluded.start_date, end_date=excluded.end_date,
                    phone=excluded.phone, fax=excluded.fax, email=excluded.email, view_count=excluded.view_count,
                    detail_info_json=excluded.detail_info_json, body_html=excluded.body_html, body_text=excluded.body_text,
                    body_sha256=excluded.body_sha256, last_collected_at=excluded.last_collected_at, last_run_id=excluded.last_run_id""",
                (
                    record["notice_sequence"], record["source_url"], record.get("title"),
                    info.get("행정규칙") or record.get("rule_type"), info.get("기관") or record.get("institution"),
                    info.get("공고번호") or record.get("notice_number"), parse_korean_date(info.get("공고일자")),
                    start_date, end_date, info.get("전화번호"), info.get("팩스번호"), info.get("전자메일"), view_count,
                    json.dumps(info, ensure_ascii=False), record.get("body_html"), body_text, body_hash, now, now, run_id,
                ),
            )
        self.connection.commit()

    def attachment_success_exists(self, attachment: dict[str, str]) -> tuple[bool, str | None]:
        row = self.connection.execute(
            """SELECT local_path FROM nlc_notice_attachment
               WHERE notice_type=? AND notice_sequence=? AND file_sequence=? AND download_status='SUCCESS'""",
            (attachment["notice_type"], attachment["notice_sequence"], attachment["file_sequence"]),
        ).fetchone()
        if not row or not row["local_path"]:
            return False, None
        path = Path(row["local_path"])
        return path.is_file() and path.stat().st_size > 0, row["local_path"]

    def upsert_attachment(self, attachment: dict[str, str], run_id: int, *, status: str, local_path: str | None = None, file_size: int | None = None, checksum: str | None = None, error: str | None = None) -> None:
        now = now_text()
        self.connection.execute(
            """INSERT INTO nlc_notice_attachment (
                notice_type, notice_sequence, file_sequence, category, file_name, download_url,
                local_path, file_size, checksum_sha256, download_status, download_error,
                first_seen_at, last_seen_at, downloaded_at, last_run_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(notice_type, notice_sequence, file_sequence) DO UPDATE SET
                category=excluded.category, file_name=excluded.file_name, download_url=excluded.download_url,
                local_path=COALESCE(excluded.local_path, nlc_notice_attachment.local_path),
                file_size=COALESCE(excluded.file_size, nlc_notice_attachment.file_size),
                checksum_sha256=COALESCE(excluded.checksum_sha256, nlc_notice_attachment.checksum_sha256),
                download_status=CASE WHEN excluded.download_status='PENDING' AND nlc_notice_attachment.download_status='SUCCESS'
                                     THEN 'SUCCESS' ELSE excluded.download_status END,
                download_error=excluded.download_error, last_seen_at=excluded.last_seen_at,
                downloaded_at=CASE WHEN excluded.download_status='SUCCESS' THEN excluded.downloaded_at ELSE nlc_notice_attachment.downloaded_at END,
                last_run_id=excluded.last_run_id""",
            (
                attachment["notice_type"], attachment["notice_sequence"], attachment["file_sequence"], attachment["category"],
                attachment["file_name"], attachment["download_url"], local_path, file_size, checksum, status, error,
                now, now, now if status == "SUCCESS" else None, run_id,
            ),
        )
        self.connection.commit()

    def history_rows(self, limit: int = 30) -> list[sqlite3.Row]:
        return self.connection.execute(
            """SELECT run_id, period_type, iso_year, iso_week, week_start_date, week_end_date, requested_notices, requested_ministries,
                      status, legislation_completed, administrative_completed, attachment_downloaded,
                      attachment_reused, attachment_failed, error_count, started_at, ended_at
               FROM nlc_week_crawl_history ORDER BY run_id DESC LIMIT ?""",
            (limit,),
        ).fetchall()


def now_text() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def to_int(value: str | None) -> int | None:
    if not value:
        return None
    digits = re.sub(r"[^0-9]", "", value)
    return int(digits) if digits else None


@dataclass
class CrawlOptions:
    week: WeekRange
    notice_kinds: list[str]
    db_path: Path
    download_root: Path
    download_files: bool = True
    force_download: bool = False
    max_items: int = 0
    delay_seconds: float = 0.35


class NoticeCrawler:
    def __init__(self, options: CrawlOptions) -> None:
        self.options = options
        self.database = Database(options.db_path)
        self.client = RateLimitedClient(options.delay_seconds)
        self.counters: Counter[str] = Counter()
        self.errors: list[str] = []
        self.run_id: int | None = None

    def crawl(self) -> dict[str, Any]:
        self.run_id = self.database.start_run(
            self.options.week, self.options.notice_kinds, self.options.download_files, self.options.delay_seconds
        )
        try:
            for kind in self.options.notice_kinds:
                try:
                    self._crawl_kind(kind)
                except Exception as exc:
                    self._record_error(kind, None, "list", urljoin(BASE_URL, LIST_URLS[kind]), exc)
                    LOGGER.exception("%s 목록 수집 실패", KIND_LABELS[kind])
            status = "SUCCESS" if not self.errors else "PARTIAL"
        except Exception as exc:  # run-level 오류도 이력에 남긴다.
            self._record_error(None, None, "run", None, exc)
            status = "FAILED"
            raise
        finally:
            self.database.finish_run(self.run_id, self.counters, status, self.errors)
            self.database.close()
        return self.summary(status)

    def _crawl_kind(self, kind: str) -> None:
        records = self._list_all(kind)
        self.counters[f"{kind}_discovered"] += len(records)
        LOGGER.info("%s: 목록 %s건 발견", KIND_LABELS[kind], len(records))
        for index, listed in enumerate(records, start=1):
            if self.options.max_items and index > self.options.max_items:
                break
            sequence = listed["notice_sequence"]
            try:
                response = self.client.get(listed["source_url"])
                detail = parse_detail_page(response.text, kind, listed["source_url"])
                if not detail.get("title") or not detail.get("body_html") or not detail.get("body_text"):
                    raise ValueError("상세 제목 또는 본문을 확인하지 못했습니다. 기존 데이터를 덮어쓰지 않습니다.")
                record = {**listed, **detail, "notice_sequence": sequence}
                self.database.upsert_notice(kind, record, self._run_id())
                self.counters[f"{kind}_completed"] += 1
                for attachment in detail["attachments"]:
                    self.counters["attachment_discovered"] += 1
                    self._handle_attachment(attachment)
            except Exception as exc:
                self._record_error(kind, sequence, "detail", listed["source_url"], exc)
                LOGGER.exception("%s 상세 수집 실패: %s", KIND_LABELS[kind], sequence)

    def _list_all(self, kind: str) -> list[dict[str, Any]]:
        params: dict[str, str] = {
            "stYd": self.options.week.start_compact,
            "edYd": self.options.week.end_compact,
            "pageIndex": "1",
            "blockStartPage": "1",
        }
        if kind == "legislation":
            params.update({"finishIncludeYn": "Y", "isOgYn": "Y"})
        # 검색 화면의 부처 콤보박스/기관명 입력은 사용하지 않는다.
        # 전체 목록을 모두 읽고 목록 행의 기관명이 허용 목록에 정확히 일치할 때만 반환한다.
        records = self._list_query(kind, params)
        column = "department" if kind == "legislation" else "institution"
        allowed = set(LEGISLATION_MINISTRIES if kind == "legislation" else ADMINISTRATIVE_MINISTRIES)
        if any(not item.get(column) for item in records):
            raise ValueError(f"{KIND_LABELS[kind]} 목록의 소관부처/기관을 확인하지 못한 행이 있습니다.")
        matched = [item for item in records if clean_text(item[column]) in allowed]
        self.counters[f"{kind}_listed"] += len(records)
        self.counters[f"{kind}_excluded"] += len(records) - len(matched)
        LOGGER.info("%s 목록 필터: 전체 %s건 / 대상 %s건 / 제외 %s건", KIND_LABELS[kind], len(records), len(matched), len(records) - len(matched))
        return matched

    def _list_query(self, kind: str, params: dict[str, str]) -> list[dict[str, Any]]:
        """기간 조건의 전체 목록을 끝 페이지까지 순회한다. 대상 없는 페이지도 건너뛰지 않는다."""
        params = dict(params)
        first = self.client.get(urljoin(BASE_URL, LIST_URLS[kind]), params=params)
        total = validate_list_response(first.text, kind, params)
        pages = max(page_count(first.text), (total + 19) // 20, 1)
        combined: dict[str, dict[str, Any]] = {}
        for index in range(1, pages + 1):
            if index == 1:
                html = first.text
            else:
                params["pageIndex"] = str(index)
                params["blockStartPage"] = str(((index - 1) // 10) * 10 + 1)
                html = self.client.get(urljoin(BASE_URL, LIST_URLS[kind]), params=params).text
                if validate_list_response(html, kind, params) != total:
                    raise ValueError("수집 중 전체 건수가 변경되었습니다. 같은 기간을 재실행하세요.")
            records = parse_list_page(html, kind)
            if total and not records:
                raise ValueError(f"목록 {index}쪽의 항목을 파싱하지 못했습니다.")
            for item in records:
                if item["notice_sequence"] in combined:
                    raise ValueError("페이지 항목이 반복되었습니다. 페이지 순회 조건을 확인하세요.")
                combined[item["notice_sequence"]] = item
            LOGGER.info("%s 전체 목록: %s/%s쪽 (%s건)", KIND_LABELS[kind], index, pages, len(combined))
        if len(combined) != total:
            raise ValueError(f"목록 수집 건수 불일치: 화면 {total}건 / 파싱 {len(combined)}건")
        return list(combined.values())

    def _handle_attachment(self, attachment: dict[str, str]) -> None:
        if not self.options.download_files:
            self.database.upsert_attachment(attachment, self._run_id(), status="PENDING")
            return
        exists, previous_path = self.database.attachment_success_exists(attachment)
        if exists and not self.options.force_download:
            self.database.upsert_attachment(attachment, self._run_id(), status="SUCCESS", local_path=previous_path)
            self.counters["attachment_reused"] += 1
            return
        target = self._attachment_path(attachment)
        try:
            response = self.client.get(attachment["download_url"], stream=True)
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + ".part")
            with temporary.open("wb") as handle:
                for chunk in response.iter_content(chunk_size=1024 * 128):
                    if chunk:
                        handle.write(chunk)
            if not temporary.exists() or temporary.stat().st_size == 0:
                raise IOError("다운로드한 첨부파일의 크기가 0바이트입니다.")
            temporary.replace(target)
            self.database.upsert_attachment(
                attachment,
                self._run_id(),
                status="SUCCESS",
                local_path=str(target.resolve()),
                file_size=target.stat().st_size,
                checksum=sha256_file(target),
            )
            self.counters["attachment_downloaded"] += 1
        except Exception as exc:
            target.with_name(target.name + ".part").unlink(missing_ok=True)
            self.database.upsert_attachment(attachment, self._run_id(), status="FAILED", error=str(exc)[:4000])
            self.counters["attachment_failed"] += 1
            self._record_error(attachment["notice_type"], attachment["notice_sequence"], "attachment", attachment["download_url"], exc)
            LOGGER.exception("첨부파일 수집 실패: %s", attachment["file_name"])

    def _attachment_path(self, attachment: dict[str, str]) -> Path:
        # 고정 저장 루트 하위의 화면·공고별 경로: C:\SQLiteDB\downloads\(부처)입법예고 또는 (부처)행정예고
        screen_directory = sanitize_filename(KIND_LABELS[attachment["notice_type"]])
        filename = sanitize_filename(f"{attachment['file_sequence']}_{attachment['file_name']}")
        return self.options.download_root / screen_directory / attachment["notice_sequence"] / filename

    def _record_error(self, kind: str | None, sequence: str | None, stage: str, source_url: str | None, error: Exception | str) -> None:
        self.counters["error_count"] += 1
        rendered = f"[{stage}] {kind or '-'} {sequence or '-'}: {error}"
        self.errors.append(rendered)
        if self.run_id:
            self.database.log_error(self.run_id, kind, sequence, stage, source_url, error)

    def _run_id(self) -> int:
        if self.run_id is None:
            raise RuntimeError("수집 이력이 시작되지 않았습니다.")
        return self.run_id

    def summary(self, status: str) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "period_type": self.options.week.period_type,
            "week": self.options.week.key,
            "institution_filters": institution_filters(self.options.notice_kinds),
            "date_range": f"{self.options.week.start_date.isoformat()} ~ {self.options.week.end_date.isoformat()}",
            "status": status,
            "counts": dict(self.counters),
            "database": str(self.options.db_path.resolve()),
            "download_root": str(self.options.download_root.resolve()),
            "errors": self.errors,
        }


def show_history(db_path: Path, limit: int) -> None:
    db = Database(db_path)
    try:
        rows = db.history_rows(limit)
    finally:
        db.close()
    if not rows:
        print("수집 이력이 없습니다.")
        return
    columns = ["run_id", "period", "institution_filters", "status", "legislation", "administrative", "downloaded", "reused", "failed", "errors", "started_at"]
    print("\t".join(columns))
    for row in rows:
        selection = json.loads(row["requested_ministries"]) if row["requested_ministries"] else None
        if selection is None:
            ministries_label = "이전 버전(기관 필터 이력 없음)"
        else:
            def label(value: Any) -> str:
                if value is None or value == "ALL":
                    return "전체(이전 방식)"
                return ','.join(value) or '미수집'
            ministries_label = f"입법:{label(selection['legislation'])} / 행정:{label(selection['administrative'])}"
        print(
            "\t".join(
                [
                    str(row["run_id"]),
                    (
                        f"{row['iso_year']}-W{row['iso_week']:02d} ({row['week_start_date']}~{row['week_end_date']})"
                        if row["period_type"] == "ISO_WEEK"
                        else f"DATE_RANGE ({row['week_start_date']}~{row['week_end_date']})"
                    ),
                    ministries_label,
                    row["status"],
                    str(row["legislation_completed"]),
                    str(row["administrative_completed"]),
                    str(row["attachment_downloaded"]),
                    str(row["attachment_reused"]),
                    str(row["attachment_failed"]),
                    str(row["error_count"]),
                    row["started_at"],
                ]
            )
        )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="국민참여입법센터의 부처 입법예고·행정예고를 ISO 연도·주차 또는 직접 날짜 범위로 수집합니다. 검색 키워드는 사용하지 않습니다."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    crawl = subparsers.add_parser("crawl", help="지정한 연도·주차 또는 직접 날짜 범위를 수집")
    period_group = crawl.add_argument_group("기간 입력 (두 방식 중 하나만 선택)")
    period_group.add_argument("--year", type=int, help="ISO 연도. --week와 함께 사용 (예: 2026)")
    period_group.add_argument("--week", type=int, help="ISO 주차. --year와 함께 사용 (예: 38)")
    period_group.add_argument("--start-date", metavar="YYYYMMDD", help="직접 입력 시작일. --end-date와 함께 사용 (예: 20260301)")
    period_group.add_argument("--end-date", metavar="YYYYMMDD", help="직접 입력 종료일. --start-date와 함께 사용 (예: 20260918)")
    crawl.add_argument("--notices", choices=("all", "legislation", "administrative"), default="all", help="수집 화면 (기본값: all)")
    crawl.add_argument("--skip-downloads", action="store_true", help="첨부파일 메타데이터만 적재하고 파일은 내려받지 않음")
    crawl.add_argument("--force-download", action="store_true", help="기존 성공 첨부파일도 다시 내려받음")
    crawl.add_argument("--max-items", type=int, default=0, help="화면별 처리 최대 건수. 0은 전체(기본값)")
    crawl.add_argument("--delay", type=float, default=0.35, help="요청 사이 최소 대기 초(기본값: 0.35)")
    crawl.add_argument("--log-level", choices=("DEBUG", "INFO", "WARNING", "ERROR"), default="INFO")

    history = subparsers.add_parser("history", help="주차별 수집 이력 조회")
    history.add_argument("--limit", type=int, default=30, help="표시할 최근 이력 수")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=getattr(logging, getattr(args, "log_level", "INFO")), format="%(asctime)s %(levelname)s %(message)s")
    if args.command == "history":
        show_history(DEFAULT_DB_PATH, args.limit)
        return 0
    try:
        week = selected_period(args)
    except ValueError as exc:
        raise SystemExit(f"입력 오류: {exc}") from exc
    kinds = ["legislation", "administrative"] if args.notices == "all" else [args.notices]
    options = CrawlOptions(
        week=week,
        notice_kinds=kinds,
        db_path=DEFAULT_DB_PATH,
        download_root=DEFAULT_DOWNLOAD_ROOT,
        download_files=not args.skip_downloads,
        force_download=args.force_download,
        max_items=max(0, args.max_items),
        delay_seconds=max(0.0, args.delay),
    )
    period_label = "수집 주차" if week.period_type == "ISO_WEEK" else "수집 기간"
    print(f"{period_label}: {week.key} ({week.start_date.isoformat()} ~ {week.end_date.isoformat()})")
    if "legislation" in kinds:
        print(f"입법예고 목록 필터: {', '.join(LEGISLATION_MINISTRIES)}")
    if "administrative" in kinds:
        print(f"행정예고 목록 필터: {', '.join(ADMINISTRATIVE_MINISTRIES)}")
    crawler = NoticeCrawler(options)
    try:
        result = crawler.crawl()
    except Exception as exc:
        LOGGER.exception("수집 실행 실패")
        print(json.dumps({"status": "FAILED", "error": str(exc)}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["status"] == "SUCCESS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
