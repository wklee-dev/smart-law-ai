#!/usr/bin/env python3
"""한국관세무역개발원 국내 관세무역동향 크롤러 (Python 3.9+)."""
from __future__ import annotations

import argparse
import hashlib
import logging
import os
import re
import sqlite3
import sys
import tempfile
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from site_parser import parse_detail, parse_list

BASE_URL = "https://www.kctdi.or.kr/kctdi/research/research11.do"
ALLOWED_HOSTS = {"kctdi.or.kr", "www.kctdi.or.kr"}
PAGE_SIZE = 10
DEFAULT_DB = r"D:\SQLiteDB\smart_law_ai.db"
DEFAULT_DOWNLOAD = r"C:\SQLiteDB\downloads"
PROGRAM_DIR = Path(__file__).resolve().parent
LOG = logging.getLogger("kctdi_crawler")
SCHEMA = """
CREATE TABLE IF NOT EXISTS kctdi_trade_articles (
 article_no TEXT PRIMARY KEY,
 board_number TEXT,
 title TEXT NOT NULL,
 writer TEXT,
 registered_date TEXT NOT NULL,
 detail_url TEXT NOT NULL,
 list_page INTEGER,
 content_text TEXT,
 content_html TEXT,
 detail_status TEXT NOT NULL DEFAULT 'pending' CHECK(detail_status IN ('pending','complete','error')),
 last_error TEXT,
 first_seen_at TEXT NOT NULL,
 last_listed_at TEXT NOT NULL,
 last_detail_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_kctdi_trade_articles_date ON kctdi_trade_articles(registered_date);
CREATE INDEX IF NOT EXISTS idx_kctdi_trade_articles_status ON kctdi_trade_articles(detail_status);
CREATE TABLE IF NOT EXISTS kctdi_trade_attachments (
 article_no TEXT NOT NULL,
 file_key TEXT NOT NULL,
 original_filename TEXT NOT NULL,
 download_url TEXT NOT NULL,
 saved_path TEXT NOT NULL,
 size_bytes INTEGER NOT NULL,
 sha256 TEXT NOT NULL,
 downloaded_at TEXT NOT NULL,
 PRIMARY KEY(article_no, file_key),
 FOREIGN KEY(article_no) REFERENCES kctdi_trade_articles(article_no)
);
"""


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def setup_logging() -> None:
    log_dir = PROGRAM_DIR / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    LOG.setLevel(logging.INFO)
    LOG.handlers.clear()
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    file_handler = logging.FileHandler(log_dir / (date.today().isoformat() + ".log"), encoding="utf-8")
    file_handler.setFormatter(fmt)
    console = logging.StreamHandler()
    console.setFormatter(fmt)
    LOG.addHandler(file_handler)
    LOG.addHandler(console)


def parse_date(value: str) -> date:
    for fmt in ("%Y%m%d", "%Y-%m-%d"):
        pattern = r"\d{8}" if fmt == "%Y%m%d" else r"\d{4}-\d{2}-\d{2}"
        if not re.fullmatch(pattern, value):
            continue
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    raise argparse.ArgumentTypeError("날짜는 YYYYMMDD 또는 YYYY-MM-DD 형식이어야 합니다.")


def positive_int(value: str) -> int:
    try:
        number = int(value)
        if number < 1:
            raise ValueError()
        return number
    except ValueError:
        raise argparse.ArgumentTypeError("1 이상의 정수를 입력하세요.")


def nonnegative_float(value: str) -> float:
    try:
        number = float(value)
        if not (0 <= number <= 3600):
            raise ValueError()
        return number
    except ValueError:
        raise argparse.ArgumentTypeError("요청 간격은 0~3600초여야 합니다.")


def get_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="국내 관세무역동향 목록·본문·첨부파일 수집")
    sub = parser.add_subparsers(dest="command", required=True)
    crawl = sub.add_parser("crawl", help="목록 또는 본문/첨부파일을 수집합니다.")
    crawl.add_argument("--stage", choices=("all", "list", "detail"), default="all", help="all: 목록+본문(기본), list: 목록, detail: 기존 목록의 본문")
    crawl.add_argument("--year", type=positive_int, help="ISO 주차의 연도")
    crawl.add_argument("--week", type=positive_int, help="ISO 주차: 월요일~일요일")
    crawl.add_argument("--start-date", type=parse_date, help="등록일 시작 YYYYMMDD")
    crawl.add_argument("--end-date", type=parse_date, help="등록일 종료 YYYYMMDD")
    crawl.add_argument("--page", type=positive_int, help="단일 페이지")
    crawl.add_argument("--from-page", type=positive_int, help="시작 페이지")
    crawl.add_argument("--to-page", type=positive_int, help="끝 페이지")
    crawl.add_argument("--all-pages", action="store_true", help="모든 페이지 수집(시간이 오래 걸림)")
    crawl.add_argument("--db-path", default=DEFAULT_DB, help="SQLite DB 경로")
    crawl.add_argument("--create-db", action="store_true", help="DB가 없으면 새 파일 생성")
    crawl.add_argument("--download-dir", default=DEFAULT_DOWNLOAD, help="첨부파일 저장 기본 폴더")
    crawl.add_argument("--delay", type=nonnegative_float, default=0.5, help="요청 간 최소 간격(초, 기본 0.5)")
    crawl.add_argument("--refresh", action="store_true", help="이미 완료된 게시글도 재수집")
    return parser


def validate_args(args: argparse.Namespace, parser: argparse.ArgumentParser) -> None:
    if bool(args.year) != bool(args.week):
        parser.error("--year와 --week를 함께 지정하세요.")
    if bool(args.start_date) != bool(args.end_date):
        parser.error("--start-date와 --end-date를 함께 지정하세요.")
    if args.year and args.start_date:
        parser.error("연도/주차와 시작일/종료일은 동시에 사용할 수 없습니다.")
    if args.year:
        try:
            args.start_date = date.fromisocalendar(args.year, args.week, 1)
            args.end_date = args.start_date + timedelta(days=6)
        except (ValueError, OverflowError):
            parser.error("해당 연도의 유효한 ISO 주차가 아닙니다.")
    if args.start_date and args.start_date > args.end_date:
        parser.error("시작일이 종료일보다 늦습니다.")
    if args.page is not None and (args.from_page is not None or args.to_page is not None):
        parser.error("--page와 --from-page/--to-page는 동시에 지정할 수 없습니다.")
    if (args.from_page is None) != (args.to_page is None):
        parser.error("--from-page와 --to-page를 함께 지정하세요.")
    if args.from_page is not None and args.from_page > args.to_page:
        parser.error("시작 페이지가 끝 페이지보다 큽니다.")
    if args.all_pages and (args.page is not None or args.from_page is not None):
        parser.error("--all-pages와 특정 페이지/페이지 구간은 동시에 지정할 수 없습니다.")
    if args.page is not None:
        args.from_page = args.to_page = args.page
    if args.stage != "detail" and not (args.start_date or args.from_page or args.all_pages):
        parser.error("목록 수집은 주차, 날짜, 페이지 또는 --all-pages를 지정하세요.")
    if os.name != "nt":
        if args.db_path == DEFAULT_DB or args.download_dir == DEFAULT_DOWNLOAD:
            parser.error("Windows가 아닌 환경에서는 --db-path와 --download-dir을 모두 지정하세요.")


def open_db(path: str, create: bool = False) -> sqlite3.Connection:
    target = Path(path).expanduser()
    if not target.exists():
        if not create:
            raise FileNotFoundError(f"기존 DB가 없습니다: {target} (새 DB는 --create-db 지정)")
        target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_dir():
        raise IsADirectoryError(f"DB 경로가 디렉터리입니다: {target}")
    db = sqlite3.connect(str(target), timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript(SCHEMA)
    return db


class SiteClient:
    def __init__(self, delay: float):
        self.delay = delay
        self.last_request = 0.0
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; KCTDITradeCrawler/1.0; research)", "Referer": BASE_URL})
        retry = Retry(total=3, connect=3, read=3, backoff_factor=1, status_forcelist=(429, 500, 502, 503, 504), allowed_methods=frozenset(["GET"]))
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("https://", adapter)

    def get(self, url: str, *, params=None, stream=False, redirect_count=0) -> requests.Response:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
            raise ValueError(f"허용되지 않는 사이트 URL: {url}")
        if redirect_count > 5:
            raise RuntimeError("리다이렉트 횟수 제한을 초과했습니다.")
        remaining = self.delay - (time.monotonic() - self.last_request)
        if remaining > 0:
            time.sleep(remaining)
        self.last_request = time.monotonic()
        response = self.session.get(url, params=params, timeout=(15, 60), stream=stream, allow_redirects=False)
        # 리다이렉트도 호스트를 검증하고 요청 간격을 적용한다.
        for _ in range(5):
            if not response.is_redirect:
                break
            from urllib.parse import urljoin
            next_url = urljoin(response.url, response.headers.get("Location", ""))
            response.close()
            return self.get(next_url, stream=stream, redirect_count=redirect_count + 1)
        response.raise_for_status()
        return response


def save_list_row(db: sqlite3.Connection, item: dict) -> None:
    timestamp = now()
    db.execute("""
        INSERT INTO kctdi_trade_articles
        (article_no,board_number,title,writer,registered_date,detail_url,list_page,first_seen_at,last_listed_at)
        VALUES (:article_no,:board_number,:title,:writer,:registered_date,:detail_url,:list_page,:timestamp,:timestamp)
        ON CONFLICT(article_no) DO UPDATE SET board_number=excluded.board_number,
            title=excluded.title,writer=excluded.writer,registered_date=excluded.registered_date,
            detail_url=excluded.detail_url,list_page=excluded.list_page,last_listed_at=excluded.last_listed_at
    """, dict(item, timestamp=timestamp))


def collect_list(db: sqlite3.Connection, client: SiteClient, args: argparse.Namespace) -> tuple[list[str], bool]:
    page = args.from_page or 1
    selected = []
    seen = set()
    had_error = False
    previous_oldest = None
    while args.to_page is None or page <= args.to_page:
        try:
            params = {"mode": "list", "articleLimit": PAGE_SIZE, "article.offset": (page - 1) * PAGE_SIZE}
            response = client.get(BASE_URL, params=params)
            items = parse_list(response.text, page, response.url)
            LOG.info("목록 %s페이지: %s건", page, len(items))
            if not items:
                LOG.info("목록 끝에 도달했습니다.")
                break
            ids = {item["article_no"] for item in items}
            if ids and ids.issubset(seen):
                raise RuntimeError("목록 페이지가 반복되어 무한 반복을 중단합니다.")
            seen.update(ids)
            dates = [date.fromisoformat(item["registered_date"]) for item in items]
            with db:
                for item, registered in zip(items, dates):
                    if args.start_date and not (args.start_date <= registered <= args.end_date):
                        continue
                    save_list_row(db, item)
                    selected.append(item["article_no"])
            # 조기 종료는 해당 페이지가 전부 시작일 이전이고 정렬이 확인될 때만 수행.
            ordered = dates == sorted(dates, reverse=True)
            cross_ordered = previous_oldest is None or previous_oldest >= max(dates)
            if args.start_date and all(d < args.start_date for d in dates) and ordered and cross_ordered:
                LOG.info("페이지가 모두 시작일 이전이어서 다음 페이지 조회를 중단합니다.")
                break
            if not ordered or not cross_ordered:
                LOG.warning("목록 등록일 내림차순이 아니어서 이 페이지에서 조기 종료하지 않습니다.")
            previous_oldest = min(dates)
            page += 1
        except Exception as exc:
            LOG.exception("목록 %s페이지 수집 실패: %s", page, exc)
            had_error = True
            break
    LOG.info("조건에 맞는 목록: %s건", len(set(selected)))
    return list(dict.fromkeys(selected)), had_error


def select_detail_rows(db: sqlite3.Connection, args: argparse.Namespace, selected: Optional[list[str]]) -> list[sqlite3.Row]:
    # all 단계는 바로 앞 목록 단계에서 선택된 ID만 처리한다. 긴 IN 절은 피한다.
    sql = "SELECT * FROM kctdi_trade_articles WHERE 1=1"
    params = []
    if not args.refresh:
        sql += " AND detail_status IN ('pending','error')"
    if args.start_date:
        sql += " AND registered_date BETWEEN ? AND ?"
        params.extend([args.start_date.isoformat(), args.end_date.isoformat()])
    if args.from_page is not None:
        sql += " AND list_page BETWEEN ? AND ?"
        params.extend([args.from_page, args.to_page])
    sql += " ORDER BY registered_date DESC, article_no DESC"
    rows = db.execute(sql, params).fetchall()
    if selected is not None:
        allowed = set(selected)
        rows = [row for row in rows if row["article_no"] in allowed]
    return rows


def safe_filename(value: str, max_length: int = 140) -> str:
    value = value.replace("\\", "/").split("/")[-1]
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value).strip(" .")
    if not value:
        value = "attachment"
    stem, ext = os.path.splitext(value)
    if stem.upper() in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}:
        stem = "_" + stem
    return stem[:max(1, max_length - len(ext))] + ext[:20]


def truncate_utf8(value: str, max_bytes: int) -> str:
    return value.encode("utf-8")[:max_bytes].decode("utf-8", errors="ignore")


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_attachment(client: SiteClient, folder: Path, article_no: str, item: dict, old: Optional[sqlite3.Row], refresh: bool = False) -> dict:
    filename = item.get("original_filename") or ("attachment_" + item["file_key"])
    if not refresh and old and old["download_url"] == item["url"] and Path(old["saved_path"]).is_file() and Path(old["saved_path"]).resolve().parent == folder.resolve():
        old_path = Path(old["saved_path"])
        if old_path.stat().st_size == old["size_bytes"] and hash_file(old_path) == old["sha256"]:
            return {"article_no": article_no, "file_key": item["file_key"], "original_filename": old["original_filename"], "download_url": item["url"], "saved_path": str(old_path), "size_bytes": old["size_bytes"], "sha256": old["sha256"], "downloaded_at": old["downloaded_at"]}
    folder.mkdir(parents=True, exist_ok=True)
    response = client.get(item["url"], stream=True)
    temp_path = None
    try:
        content_type = response.headers.get("Content-Type", "").lower()
        if "text/html" in content_type:
            raise RuntimeError("첨부파일 대신 HTML 응답을 받았습니다(권한 또는 사이트 구조 확인).")
        digest = hashlib.sha256()
        size = 0
        with tempfile.NamedTemporaryFile(mode="wb", prefix=".download_", suffix=".part", dir=str(folder), delete=False) as fh:
            temp_path = Path(fh.name)
            for chunk in response.iter_content(65536):
                if chunk:
                    size += len(chunk)
                    digest.update(chunk)
                    fh.write(chunk)
        expected_size = response.headers.get("Content-Length")
        if expected_size and expected_size.isdigit() and size != int(expected_size) and not response.headers.get("Content-Encoding"):
            raise IOError(f"첨부파일 크기 불일치: {size}/{expected_size}")
        # 컨텐츠 해시를 이름에 포함하면 재수집이 중간에 실패해도 이전 DB가
        # 가리키는 파일을 덮어쓰지 않는다. 키 해시는 정리 후 이름 충돌을 막는다.
        hexdigest = digest.hexdigest()
        keyhash = hashlib.sha256((article_no + "\0" + item["file_key"]).encode("utf-8")).hexdigest()[:16]
        prefix = (truncate_utf8(safe_filename(article_no), 18) + "_" +
                  truncate_utf8(safe_filename(item["file_key"]), 18) + "_" +
                  keyhash + "_" + hexdigest + "_")
        clean_name = safe_filename(filename)
        stem, ext = os.path.splitext(clean_name)
        ext = truncate_utf8(ext, 20)
        budget = max(1, 220 - len(prefix.encode("utf-8")) - len(ext.encode("utf-8")))
        component = prefix + (truncate_utf8(stem, budget) or "_") + ext
        final_path = folder / component
        os.replace(temp_path, final_path)
        LOG.info("첨부 저장: %s (%s bytes)", final_path, size)
        return {"article_no": article_no, "file_key": item["file_key"], "original_filename": filename, "download_url": item["url"], "saved_path": str(final_path), "size_bytes": size, "sha256": hexdigest, "downloaded_at": now()}
    finally:
        response.close()
        if temp_path is not None:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError as exc:
                LOG.warning("임시 파일 삭제 실패: %s (%s)", temp_path, exc)


def collect_details(db: sqlite3.Connection, client: SiteClient, args: argparse.Namespace, selected: Optional[list[str]]) -> bool:
    rows = select_detail_rows(db, args, selected)
    LOG.info("본문 수집 대상: %s건", len(rows))
    had_error = False
    folder = Path(args.download_dir).expanduser() / "관세무역개발원" / "무역동향"
    for number, row in enumerate(rows, 1):
        article_no = row["article_no"]
        try:
            response = client.get(row["detail_url"])
            detail = parse_detail(response.text, response.url)
            downloaded = []
            keys = set()
            for item in detail["attachments"]:
                if item["file_key"] in keys:
                    raise RuntimeError(f"첨부파일 식별자가 중복됩니다: {item['file_key']}")
                keys.add(item["file_key"])
                old = db.execute("SELECT * FROM kctdi_trade_attachments WHERE article_no=? AND file_key=?", (article_no, item["file_key"])).fetchone()
                downloaded.append(download_attachment(client, folder, article_no, item, old, args.refresh))
            with db:
                db.execute("UPDATE kctdi_trade_articles SET content_text=?,content_html=?,detail_status='complete',last_error=NULL,last_detail_at=? WHERE article_no=?", (detail["content_text"], detail["content_html"], now(), article_no))
                db.execute("DELETE FROM kctdi_trade_attachments WHERE article_no=?", (article_no,))
                db.executemany("""INSERT INTO kctdi_trade_attachments
                    (article_no,file_key,original_filename,download_url,saved_path,size_bytes,sha256,downloaded_at)
                    VALUES (:article_no,:file_key,:original_filename,:download_url,:saved_path,:size_bytes,:sha256,:downloaded_at)""", downloaded)
            LOG.info("[%s/%s] 본문 저장 완료: %s %s (첨부 %s개)", number, len(rows), article_no, row["title"], len(downloaded))
        except Exception as exc:
            had_error = True
            with db:
                db.execute("UPDATE kctdi_trade_articles SET detail_status='error',last_error=?,last_detail_at=? WHERE article_no=?", (str(exc)[:2000], now(), article_no))
            LOG.exception("[%s/%s] 본문 수집 실패: %s - %s", number, len(rows), article_no, exc)
    return had_error


def main(argv=None) -> int:
    parser = get_parser()
    args = parser.parse_args(argv)
    validate_args(args, parser)
    setup_logging()
    LOG.info("시작 stage=%s date=%s~%s page=%s~%s", args.stage, args.start_date, args.end_date, args.from_page, args.to_page)
    db = None
    try:
        db = open_db(args.db_path, args.create_db)
        client = SiteClient(args.delay)
        selected = None
        failed = False
        if args.stage in ("all", "list"):
            selected, failed = collect_list(db, client, args)
        if args.stage in ("all", "detail"):
            failed = collect_details(db, client, args, selected) or failed
        LOG.info("종료: %s", "오류 있음" if failed else "성공")
        return 1 if failed else 0
    except (OSError, sqlite3.Error, ValueError, requests.RequestException) as exc:
        LOG.exception("실행 실패: %s", exc)
        return 1
    finally:
        if db is not None:
            db.close()


if __name__ == "__main__":
    sys.exit(main())
