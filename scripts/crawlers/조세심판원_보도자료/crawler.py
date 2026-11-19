#!/usr/bin/env python3
"""Tax Tribunal press-release crawler V1.4. Python 3.10+.
No title/date filters. Existing database tables outside tt_press_* are untouched.
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
from contextlib import contextmanager
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

import requests
from bs4 import BeautifulSoup

VERSION = "1.4"
LOG_PARAMETER_NAME = "TaxTribunalPress"
ALLOWED_HOSTS = {"www.tt.go.kr", "tt.go.kr"}
DEFAULTS = {
    "base_url": "https://www.tt.go.kr",
    "list_path": "/mUser/community/pressList.do",
    "db_path": r"D:\SQLiteDB\smart_law_ai.db",
    "download_root": r"C:\SQLiteDB\downloads",
    "category_subdir": ["조세심판원", "보도자료"],
    "log_dir": "LOG", "backup_before_run": True,
    "request_interval_seconds": 1.5, "connect_timeout_seconds": 15,
    "read_timeout_seconds": 60, "max_retries": 3,
    "max_attachment_bytes": 209715200,
    "user_agent": "TaxTribunalPressCrawler/1.3 (authorized archival collection)",
    "verify_ssl": True,
}


class CrawlError(RuntimeError):
    pass


class RobotsBlocked(CrawlError):
    pass


class ParseError(CrawlError):
    pass


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def daily_log_path(log_dir: Path) -> Path:
    """Return the local-date operational log path shared by all runs that day."""
    return log_dir / f"{datetime.now().strftime('%Y%m%d')}_{LOG_PARAMETER_NAME}.LOG"


def configure_logging(log_dir: Path) -> Path:
    """Configure append-only daily logging before configuration or crawling work."""
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = daily_log_path(log_dir)
    # run_console.py relays the stream to the console and one daily log writer.
    if os.environ.get("TAX_TRIBUNAL_LOG_REDIRECTED") == "1" and os.environ.get("TAX_TRIBUNAL_LOG_FILE"):
        log_file = Path(os.environ["TAX_TRIBUNAL_LOG_FILE"]).resolve()
    handlers = [logging.StreamHandler()] if os.environ.get("TAX_TRIBUNAL_LOG_REDIRECTED") == "1" else [
        logging.StreamHandler(), logging.FileHandler(log_file, encoding="utf-8")
    ]
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                        handlers=handlers, force=True)
    return log_file


def digest(value: str | bytes) -> str:
    return hashlib.sha256(value.encode("utf-8") if isinstance(value, str) else value).hexdigest()


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()


def clean_url(value: str, base: str) -> str:
    """Remove volatile servlet session IDs; preserve encoded filename query values."""
    p = urlsplit(urljoin(base, value))
    path = re.sub(r";jsessionid=[^/?;]*", "", p.path, flags=re.I)
    return urlunsplit((p.scheme, p.netloc, path, p.query, ""))


def canonical_download_url(value: str, base: str) -> str:
    p = urlsplit(clean_url(value, base))
    return urlunsplit((p.scheme, p.netloc, p.path, urlencode(sorted(parse_qsl(p.query, keep_blank_values=True))), ""))


def safe_filename(value: str, limit: int = 85) -> str:
    # Treat both separators as invalid regardless of the current operating system.
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value).strip(" .") or "attachment.bin"
    root, ext = os.path.splitext(value)
    if root.upper() in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}:
        root = "_" + root
    ext = ext[:15]
    if len(root + ext) > limit:
        root = root[:max(1, limit - len(ext) - 9)] + "_" + digest(value)[:8]
    return root + ext


def parse_pages(value: str) -> list[int]:
    """Accept single pages, inclusive ranges and comma-separated combinations."""
    pages = set()
    for part in value.split(","):
        part = part.strip()
        if not re.fullmatch(r"[0-9]+(?:\s*-\s*[0-9]+)?", part):
            raise argparse.ArgumentTypeError("페이지는 3, 2-4, 1,3,5 또는 1,3-5 형식으로 지정하세요.")
        limits = [int(x.strip()) for x in part.split("-")]
        start, end = limits[0], limits[-1]
        if start < 1 or end < start:
            raise argparse.ArgumentTypeError("페이지는 1 이상이어야 하며 범위의 끝은 시작 이상이어야 합니다.")
        if end - start + 1 > 10000:
            raise argparse.ArgumentTypeError("한 번에 지정하는 페이지 범위는 10,000페이지 이하로 입력하세요.")
        pages.update(range(start, end + 1))
        if len(pages) > 10000:
            raise argparse.ArgumentTypeError("한 번에 지정하는 페이지는 10,000개 이하로 입력하세요.")
    return sorted(pages)


@dataclass
class ListItem:
    post_key: str
    source_id: str
    source_id_type: str
    list_number: int | None
    title: str
    published_date: str | None
    source_url: str


@dataclass
class ListPage:
    items: list[ListItem]
    total_count: int | None
    page_count: int | None
    current_page: int | None
    linked_pages: list[int]


@dataclass
class Attachment:
    original_filename: str
    download_url: str
    ordinal: int


@dataclass
class Detail:
    title: str
    published_date: str | None
    list_number: int | None
    content_text: str
    content_html: str
    attachments: list[Attachment]


def parse_list(html: str, base_url: str) -> ListPage:
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("table.grid-list-a")
    total_el = soup.select_one(".result-total")
    total_text = clean_text(total_el.get_text()) if total_el else ""
    total = int(total_text.replace(",", "")) if re.fullmatch(r"[\d,]+", total_text) else None
    info = soup.select_one(".result-info")
    match = re.search(r"(\d+)\s*/\s*(\d+)\s*페이지", info.get_text(" ") if info else "")
    current, pages = (int(match[1]), int(match[2])) if match else (None, None)
    if table is None:
        raise ParseError("목록 테이블 table.grid-list-a를 찾지 못했습니다. 사이트 구조 또는 오류 화면을 확인하세요.")
    items = []
    for row in table.select("tbody tr"):
        link = row.select_one('a[href*="pressView.do"]')
        if link is None:
            if total != 0:
                raise ParseError("게시글 행에 상세 링크가 없습니다. 빈 목록/사이트 변경 여부를 확인하세요.")
            continue
        url = clean_url(link["href"], base_url)
        query = parse_qs(urlsplit(url).query)
        id_type = "ref_c" if query.get("ref_c", [""])[0] else "board_num"
        source_id = query.get(id_type, [""])[0]
        if not re.fullmatch(r"\d+", source_id):
            raise ParseError("상세 링크에 안정적인 ref_c 또는 board_num 식별자가 없습니다.")
        number_el = row.select_one('[data-header="번호"]')
        date_el = row.select_one('[data-header="등록일"]')
        cells = row.find_all("td", recursive=False)
        num = clean_text((number_el or (cells[0] if cells else row)).get_text())
        date = clean_text((date_el or (cells[-1] if cells else row)).get_text())
        title = clean_text(link.get_text(" "))
        if not title:
            raise ParseError("목록 제목이 비어 있습니다.")
        items.append(ListItem(f"tt:press:{id_type}:{source_id}", source_id, id_type,
                              int(num) if num.isdigit() else None, title,
                              date if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) else None, url))
    if not items and total != 0:
        raise ParseError("목록 게시글을 찾지 못했습니다. 0건으로 간주하지 않고 중단합니다.")
    linked = set()
    for a in soup.select('.pagination a[href*="pressList.do"]'):
        n = parse_qs(urlsplit(clean_url(a["href"], base_url)).query).get("pageNumber", [""])[0]
        if n.isdigit() and int(n) > 0:
            linked.add(int(n))
    return ListPage(items, total, pages, current, sorted(linked))


def parse_detail(html: str, base_url: str, item: ListItem) -> Detail:
    soup = BeautifulSoup(html, "html.parser")
    view = soup.select_one(".board-view-basic")
    body = soup.select_one("#contentBox, .board-view-basic-conbox")
    title_el = view.select_one("dd.title") if view else None
    if view is None or body is None or title_el is None:
        raise ParseError("상세 제목/본문 영역을 찾지 못했습니다. 오류 페이지는 정상 데이터로 저장하지 않습니다.")
    title = clean_text(title_el.get_text(" "))
    if not title:
        raise ParseError("상세 제목이 비어 있습니다.")
    date, number = item.published_date, item.list_number
    for dt in view.select("dt"):
        dd = dt.find_next_sibling("dd")
        if dd is None:
            continue
        label, value = clean_text(dt.get_text()), clean_text(dd.get_text())
        if label == "등록일" and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            date = value
        if label == "번호" and value.isdigit():
            number = int(value)
    # Reject a wrong article response instead of silently overwriting a different post.
    if clean_text(title) != clean_text(item.title):
        raise ParseError(f"목록/상세 제목 불일치: {item.title!r} / {title!r}; 목록 갱신 후 다시 실행하세요.")
    for tag in body.select("script, style"):
        tag.decompose()
    content_html = body.decode_contents()
    for br in body.find_all("br"):
        br.replace_with("\n")
    text = "\n".join(line for line in (clean_text(x) for x in body.get_text("\n").splitlines()) if line)
    found, seen = [], set()
    for a in view.select('a[href*="fileDown.do"]'):
        url = canonical_download_url(a["href"], base_url)
        if url in seen:
            continue
        seen.add(url)
        name = clean_text(a.get_text(" "))
        if not name:
            q = parse_qs(urlsplit(url).query)
            name = q.get("file_path", [""])[0] or "attachment.bin"
        found.append(Attachment(name, url, len(found) + 1))
    return Detail(title, date, number, text, content_html, found)


class RobotPolicy:
    """robots.txt matching with wildcard, end anchor, longest rule and Allow tie."""
    def __init__(self, text: str, agent: str):
        groups, agents, rules = [], [], []
        seen_rule = False
        for line in text.lstrip("\ufeff").splitlines():
            line = line.split("#", 1)[0].strip()
            if ":" not in line:
                continue
            key, value = (x.strip() for x in line.split(":", 1))
            key = key.lower()
            if key == "user-agent":
                if seen_rule:
                    groups.append((agents, rules)); agents, rules, seen_rule = [], [], False
                agents.append(value.lower())
            elif key in {"allow", "disallow"} and agents:
                seen_rule = True
                if value:
                    rules.append((key == "allow", value))
        if agents:
            groups.append((agents, rules))
        token = agent.split("/", 1)[0].lower()
        selected, best = [], -1
        for names, group_rules in groups:
            scores = [0 if a == "*" else len(a) for a in names if a == "*" or a in token]
            if not scores:
                continue
            score = max(scores)
            if score > best:
                selected, best = list(group_rules), score
            elif score == best:
                selected.extend(group_rules)
        self.rules = selected

    def allowed(self, url: str) -> bool:
        p = urlsplit(url)
        target = p.path + ("?" + p.query if p.query else "")
        best, answer = -1, True
        for allow, pattern in self.rules:
            anchored = pattern.endswith("$")
            raw = pattern[:-1] if anchored else pattern
            rx = "^" + re.escape(raw).replace(r"\*", ".*") + ("$" if anchored else "")
            if re.search(rx, target):
                length = len(raw.replace("*", ""))
                if length > best or (length == best and allow):
                    best, answer = length, allow
        return answer


class HTTPClient:
    def __init__(self, config: dict, allow_disallowed: bool = False):
        self.config = config
        self.allow_disallowed = allow_disallowed
        self.policy: RobotPolicy | None = None
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": config["user_agent"], "Accept-Language": "ko-KR,ko;q=0.9"})
        self.last_request = 0.0

    def validate_url(self, url: str):
        p = urlsplit(url)
        if p.scheme != "https" or p.hostname not in ALLOWED_HOSTS or p.username or p.password or p.port not in (None, 443):
            raise CrawlError(f"허용되지 않은 URL입니다: {url}")

    def request(self, url: str, *, stream: bool = False, referer: str | None = None,
                check_robots: bool = True) -> requests.Response:
        retries = self.config["max_retries"]
        for attempt in range(retries + 1):
            current = url
            response = None
            try:
                for _ in range(6):
                    self.validate_url(current)
                    if check_robots:
                        self.check_allowed(current)
                    wait = self.config["request_interval_seconds"] - (time.monotonic() - self.last_request)
                    if wait > 0:
                        time.sleep(wait)
                    self.last_request = time.monotonic()
                    logging.info("[요청] %s (시도 %s/%s)", current, attempt + 1, retries + 1)
                    response = self.session.get(current, stream=stream, allow_redirects=False,
                        headers={"Referer": referer} if referer else {},
                        timeout=(self.config["connect_timeout_seconds"], self.config["read_timeout_seconds"]),
                        verify=True)
                    if response.status_code in (301, 302, 303, 307, 308):
                        location = response.headers.get("Location")
                        if not location:
                            raise CrawlError("리디렉션 Location 헤더가 없습니다.")
                        current = clean_url(location, current)
                        response.close()
                        continue
                    break
                else:
                    raise CrawlError("리디렉션 횟수가 제한을 초과했습니다.")
                if response.status_code == 429 or 500 <= response.status_code <= 599:
                    retry_after = response.headers.get("Retry-After", "")
                    if attempt < retries:
                        response.close()
                        logging.warning("[재시도] HTTP %s; 잠시 대기 후 재요청", response.status_code)
                        time.sleep(min(120, int(retry_after)) if retry_after.isdigit() else min(30, 2 ** (attempt + 1)))
                        continue
                try:
                    response.raise_for_status()
                except requests.HTTPError:
                    response.close()
                    raise
                return response
            except (requests.ConnectionError, requests.Timeout):
                if response is not None:
                    response.close()
                if attempt >= retries:
                    raise
                logging.warning("[재시도] 통신 오류; 다음 시도 %s/%s", attempt + 2, retries + 1)
                time.sleep(min(30, 2 ** (attempt + 1)))
        raise CrawlError("HTTP 재시도 횟수를 초과했습니다.")

    def load_robots(self):
        url = urljoin(self.config["base_url"], "/robots.txt")
        try:
            r = self.request(url, check_robots=False)
            try:
                r.encoding = "utf-8"
                self.policy = RobotPolicy(r.text, self.config["user_agent"])
            finally:
                r.close()
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                self.policy = RobotPolicy("", self.config["user_agent"])
            else:
                raise RobotsBlocked(f"robots.txt를 확인할 수 없어 수집을 중단합니다: {exc}") from exc
        except requests.RequestException as exc:
            raise RobotsBlocked(f"robots.txt 통신 실패로 수집을 중단합니다: {exc}") from exc

    def check_allowed(self, url: str):
        if self.policy is None:
            raise RobotsBlocked("robots 정책을 먼저 확인해야 합니다.")
        if not self.policy.allowed(url) and not self.allow_disallowed:
            raise RobotsBlocked("robots.txt에서 게시판 자동 수집을 제한합니다. 운영기관 허가를 받은 경우에만 --allow-disallowed 옵션을 사용하세요.")

    def text(self, url: str, referer: str | None = None) -> str:
        with self.request(url, referer=referer) as r:
            r.encoding = "utf-8"
            return r.text

    def download(self, attachment: Attachment, target: Path, referer: str) -> dict:
        target.parent.mkdir(parents=True, exist_ok=True)
        temp = target.with_name(target.name + ".part")
        # Stream failures are retried as a whole; incomplete files never replace the old file.
        for attempt in range(self.config["max_retries"] + 1):
            try:
                logging.info("[다운로드 시작] %s (시도 %s/%s)", attachment.original_filename,
                             attempt + 1, self.config["max_retries"] + 1)
                with self.request(attachment.download_url, stream=True, referer=referer) as r:
                    kind = r.headers.get("Content-Type", "").split(";", 1)[0].lower()
                    expected = r.headers.get("Content-Length")
                    html_name = attachment.original_filename.lower().endswith((".html", ".htm"))
                    if kind in {"text/html", "application/xhtml+xml"} and not html_name:
                        raise CrawlError("첨부파일 대신 HTML 오류 화면이 반환되었습니다.")
                    size, sha, prefix = 0, hashlib.sha256(), b""
                    progress_at = time.monotonic()
                    with temp.open("wb") as f:
                        for chunk in r.iter_content(64 * 1024):
                            if not chunk:
                                continue
                            size += len(chunk)
                            if size > self.config["max_attachment_bytes"]:
                                raise CrawlError("첨부파일이 max_attachment_bytes를 초과했습니다. 설정을 조정하여 재시도하세요.")
                            if len(prefix) < 512:
                                prefix += chunk[:512 - len(prefix)]
                            f.write(chunk); sha.update(chunk)
                            current = time.monotonic()
                            if current - progress_at >= 2:
                                logging.info("[다운로드 진행] %s: %s / %s bytes", attachment.original_filename,
                                             size, expected if expected and expected.isdigit() else "총용량 미확인")
                                progress_at = current
                    if size == 0:
                        raise CrawlError("첨부파일이 0바이트입니다.")
                    if not html_name and re.match(br"\s*(?:<!doctype\s+html|<html|<head|<body)", prefix, re.I):
                        raise CrawlError("첨부파일 내용에서 HTML 오류 화면을 감지했습니다.")
                    if expected and expected.isdigit() and not r.headers.get("Content-Encoding") and size != int(expected):
                        raise CrawlError(f"첨부파일 크기 불일치: 기대 {expected}, 실제 {size}")
                    os.replace(temp, target)
                    logging.info("[다운로드 완료] %s: %s bytes", attachment.original_filename, size)
                    return {"local_path": str(target.resolve()), "size_bytes": size, "sha256": sha.hexdigest(), "content_type": kind}
            except (requests.RequestException, CrawlError):
                temp.unlink(missing_ok=True)
                if attempt >= self.config["max_retries"]:
                    raise
                logging.warning("[첨부 재시도] %s; 다음 시도 %s/%s", attachment.original_filename,
                                attempt + 2, self.config["max_retries"] + 1)
                time.sleep(min(30, 2 ** (attempt + 1)))
            except BaseException:
                temp.unlink(missing_ok=True)
                raise
        raise CrawlError("첨부파일 재시도 실패")

    def close(self):
        self.session.close()


# These signatures prevent accidental reuse of an unrelated table with the same name.
TABLE_COLUMNS = {
    "tt_press_schema": "component version installed_at",
    "tt_press_posts": "post_key source_host board_code category source_id source_id_type list_number title published_date source_url content_text content_html source_html content_sha256 attachment_count status first_seen_at last_seen_at last_attempt_at last_success_at last_run_id last_error",
    "tt_press_attachments": "attachment_key post_key ordinal original_filename download_url local_path size_bytes sha256 content_type status active first_seen_at last_seen_at last_attempt_at downloaded_at last_run_id last_error",
    "tt_press_runs": "run_id started_at finished_at mode status expected_posts scanned_pages discovered_posts succeeded_posts failed_posts attachments_downloaded attachments_failed db_path download_root backup_path notes",
    "tt_press_errors": "error_id run_id post_key stage url error_type message occurred_at",
}


def initialize_schema(conn: sqlite3.Connection, schema_path: Path):
    schema_text = schema_path.read_text(encoding="utf-8")
    reference = sqlite3.connect(":memory:")
    try:
        reference.executescript(schema_text)
        for table in TABLE_COLUMNS:
            obj = conn.execute("SELECT type FROM sqlite_master WHERE name=?", (table,)).fetchone()
            if obj is None:
                continue
            cols = [tuple(r)[1:] for r in conn.execute(f'PRAGMA table_info("{table}")')]
            expected = [tuple(r)[1:] for r in reference.execute(f'PRAGMA table_info("{table}")')]
            foreign = [tuple(r)[2:] for r in conn.execute(f'PRAGMA foreign_key_list("{table}")')]
            expected_foreign = [tuple(r)[2:] for r in reference.execute(f'PRAGMA foreign_key_list("{table}")')]
            if obj[0] != "table" or cols != expected or foreign != expected_foreign:
                raise CrawlError(f"기존 {table} 테이블 구조가 V1.0과 다릅니다. 자동 변경하지 않습니다.")
    finally:
        reference.close()
    if conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='tt_press_schema'").fetchone():
        row = conn.execute("SELECT version FROM tt_press_schema WHERE component='tax_tribunal_press'").fetchone()
        if row is None or row[0] != 1:
            raise CrawlError("전용 스키마 버전이 다릅니다. 자동 마이그레이션하지 않습니다.")
    elif any(conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,)).fetchone()
             for t in TABLE_COLUMNS if t != "tt_press_schema"):
        raise CrawlError("전용 버전 표시 없이 같은 이름의 테이블이 존재합니다. 기존 DB 보호를 위해 중단합니다.")
    # Controlled schema has no semicolons within strings/comments.
    with conn:
        if not conn.in_transaction:
            conn.execute("BEGIN IMMEDIATE")
        for sql in schema_text.split(";"):
            if sql.strip():
                conn.execute(sql)
        conn.execute("INSERT OR IGNORE INTO tt_press_schema VALUES(?,?,?)", ("tax_tribunal_press", 1, now()))


def connect_db(path: Path, create: bool = False) -> sqlite3.Connection:
    if not path.exists() and not create:
        raise CrawlError(f"기존 DB가 없습니다: {path}. 경로를 확인하거나 새 DB 생성 시에만 --create-db를 사용하세요.")
    if create:
        path.parent.mkdir(parents=True, exist_ok=True)
    uri = path.resolve().as_uri() + ("?mode=rwc" if create else "?mode=rw")
    conn = sqlite3.connect(uri, uri=True, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def backup_db(conn: sqlite3.Connection, db_path: Path) -> Path:
    folder = db_path.parent / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = folder / f"{db_path.stem}_tt_press_{stamp}_{uuid.uuid4().hex[:8]}.db"
    with sqlite3.connect(target) as dest:
        conn.backup(dest, pages=128, sleep=0.1)
    return target


@contextmanager
def database_lock(path: Path):
    lock = path.with_name(path.name + ".tt_press.lock")
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as exc:
        raise CrawlError(f"동시 실행 잠금 파일이 있습니다: {lock}. 실행 중인지 확인하세요. 비정상 종료된 경우에만 수동 삭제하세요.") from exc
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"pid": os.getpid(), "started_at": now()}, f)
        yield
    finally:
        lock.unlink(missing_ok=True)


class Crawler:
    def __init__(self, conn: sqlite3.Connection, client: HTTPClient, config: dict, args, run_id: str):
        self.conn, self.client, self.config, self.args, self.run_id = conn, client, config, args, run_id
        self.stats = {"expected_posts": None, "scanned_pages": 0, "discovered_posts": 0,
                      "succeeded_posts": 0, "failed_posts": 0,
                      "attachments_downloaded": 0, "attachments_failed": 0}
        self.errors = 0
        self.notes = []
        self.folder = Path(config["download_root"]).joinpath(*config["category_subdir"])

    def error(self, stage: str, url: str | None, exc: Exception, post_key: str | None = None):
        self.errors += 1
        logging.error("%s %s: %s", stage, post_key or url or "", exc)
        with self.conn:
            self.conn.execute("INSERT INTO tt_press_errors(run_id,post_key,stage,url,error_type,message,occurred_at) VALUES(?,?,?,?,?,?,?)",
                              (self.run_id, post_key, stage, url, type(exc).__name__, str(exc), now()))

    def discover(self) -> list[ListItem]:
        base = self.config["base_url"]
        selected = getattr(self.args, "pages", None)
        queue, visited, items, fingerprints = list(selected) if selected else [1], set(), {}, set()
        first_total = None
        selected_count = 0
        while queue:
            page = min(queue); queue.remove(page)
            if page in visited or (self.args.max_pages and page > self.args.max_pages):
                continue
            visited.add(page)
            url = urljoin(base, self.config["list_path"]) + "?" + urlencode({"pageNumber": page, "cbSearchOption": "all", "txtKeyword": ""})
            try:
                logging.info("[목록 요청] %s페이지", page)
                result = parse_list(self.client.text(url), base)
                if result.current_page is not None and result.current_page != page:
                    raise ParseError(f"요청한 페이지 {page} 대신 {result.current_page} 페이지가 반환되었습니다.")
                if selected and result.page_count is not None and page > max(1, result.page_count):
                    raise ParseError(f"지정한 페이지 {page}가 전체 {result.page_count}페이지 범위를 벗어났습니다.")
                fingerprint = tuple(i.post_key for i in result.items)
                if fingerprint and fingerprint in fingerprints:
                    raise ParseError("다른 페이지에서 같은 목록이 반복 반환되었습니다.")
                fingerprints.add(fingerprint)
                self.stats["scanned_pages"] += 1
                selected_count += len(result.items)
                if page == 1 or (selected and self.stats["scanned_pages"] == 1):
                    first_total = result.total_count
                    if not selected:
                        self.stats["expected_posts"] = first_total
                elif first_total is not None and result.total_count != first_total:
                    self.error("list", url, ParseError("수집 도중 전체 건수가 변경되었습니다. 재실행이 필요합니다."))
                if not selected:
                    candidates = set(result.linked_pages)
                    if result.page_count:
                        candidates.update(range(1, result.page_count + 1))
                    for candidate in sorted(candidates - visited - set(queue)):
                        if not self.args.max_pages or candidate <= self.args.max_pages:
                            queue.append(candidate)
                for item in result.items:
                    if item.post_key in items:
                        self.error("list", url, ParseError("페이지 간 게시글 중복으로 목록 변동이 감지되었습니다."), item.post_key)
                    items[item.post_key] = item
                logging.info("목록 %s 페이지: %s건 / 전체 표시 %s건", page, len(result.items), result.total_count)
            except Exception as exc:
                self.error("list", url, exc)
        self.stats["discovered_posts"] = len(items)
        if selected:
            self.stats["expected_posts"] = selected_count if self.stats["scanned_pages"] == len(selected) else None
            self.notes.append(f"페이지 지정: {','.join(map(str, selected))}; 선택 범위만 처리하며 전체 게시판 수집 완료가 아님")
            if first_total is not None:
                self.notes.append(f"사이트 전체 표시 건수: {first_total}; expected_posts는 선택 페이지 범위의 건수")
        elif not self.args.max_pages:
            if first_total is None:
                self.error("list", None, ParseError("전체 건수를 확인하지 못해 완전 수집으로 판단할 수 없습니다."))
            elif first_total != len(items):
                self.error("list", None, ParseError(f"전체 건수 불일치: 화면 {first_total}건, 발견 {len(items)}건"))
        else:
            self.notes.append(f"진단 제한: 최대 {self.args.max_pages} 페이지; 전체 수집 완료가 아님")
        logging.info("[목록 완료] 성공 %s페이지 / 발견 %s건", self.stats["scanned_pages"], len(items))
        return list(items.values())

    def retry_items(self) -> list[ListItem]:
        rows = self.conn.execute("""SELECT p.* FROM tt_press_posts p WHERE p.status IN ('pending','failed','partial','no_download')
            OR EXISTS(SELECT 1 FROM tt_press_attachments a WHERE a.post_key=p.post_key AND a.active=1 AND a.status!='downloaded')
            ORDER BY p.published_date DESC,p.post_key""").fetchall()
        items = [ListItem(r["post_key"], r["source_id"], r["source_id_type"], r["list_number"], r["title"], r["published_date"], r["source_url"]) for r in rows]
        self.stats["discovered_posts"] = len(items)
        self.notes.append("이전 실패/미다운로드 게시글만 처리; 누락 목록 페이지는 전체 실행으로 재수집해야 함")
        logging.info("[재처리 대상] %s건", len(items))
        return items

    def remember(self, item: ListItem):
        stamp = now()
        with self.conn:
            self.conn.execute("""INSERT INTO tt_press_posts(post_key,source_host,board_code,category,source_id,source_id_type,
                list_number,title,published_date,source_url,first_seen_at,last_seen_at,last_run_id)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(post_key) DO UPDATE SET
                list_number=excluded.list_number,source_url=excluded.source_url,last_seen_at=excluded.last_seen_at,last_run_id=excluded.last_run_id""",
                (item.post_key, "www.tt.go.kr", "press", "소식 및 소통/보도자료", item.source_id, item.source_id_type,
                 item.list_number, item.title, item.published_date, item.source_url, stamp, stamp, self.run_id))

    def process(self, item: ListItem):
        stamp = now()
        with self.conn:
            self.conn.execute("UPDATE tt_press_posts SET status='pending',last_attempt_at=?,last_error=NULL,last_run_id=? WHERE post_key=?",
                              (stamp, self.run_id, item.post_key))
        try:
            logging.info("[상세 요청] 게시글 %s: %s", item.source_id, item.title)
            html = self.client.text(item.source_url, urljoin(self.config["base_url"], self.config["list_path"]))
            detail = parse_detail(html, self.config["base_url"], item)
            logging.info("[본문 확인] 게시글 %s / 첨부 %s개", item.source_id, len(detail.attachments))
            content_hash = digest(json.dumps({"title": detail.title, "date": detail.published_date, "body": detail.content_html,
                                              "attachments": [asdict(a) for a in detail.attachments]}, ensure_ascii=False, sort_keys=True))
            with self.conn:
                self.conn.execute("""UPDATE tt_press_posts SET title=?,published_date=?,list_number=?,content_text=?,content_html=?,
                    source_html=?,content_sha256=?,attachment_count=? WHERE post_key=?""",
                    (detail.title, detail.published_date, detail.list_number, detail.content_text, detail.content_html,
                     html, content_hash, len(detail.attachments), item.post_key))
                self.conn.execute("UPDATE tt_press_attachments SET active=0 WHERE post_key=?", (item.post_key,))
                for a in detail.attachments:
                    key = digest(item.post_key + "|" + a.download_url)
                    self.conn.execute("""INSERT INTO tt_press_attachments(attachment_key,post_key,ordinal,original_filename,
                        download_url,first_seen_at,last_seen_at,last_run_id) VALUES(?,?,?,?,?,?,?,?)
                        ON CONFLICT(attachment_key) DO UPDATE SET ordinal=excluded.ordinal,original_filename=excluded.original_filename,
                        active=1,last_seen_at=excluded.last_seen_at,last_run_id=excluded.last_run_id""",
                        (key, item.post_key, a.ordinal, a.original_filename, a.download_url, stamp, stamp, self.run_id))
            failed = 0
            for a in detail.attachments:
                key = digest(item.post_key + "|" + a.download_url)
                logging.info("[첨부 %s/%s] %s", a.ordinal, len(detail.attachments), a.original_filename)
                if self.args.no_download:
                    logging.info("[첨부 생략] --no-download 옵션: %s", a.original_filename)
                    with self.conn:
                        self.conn.execute("UPDATE tt_press_attachments SET status='skipped',last_error='--no-download diagnostic mode' WHERE attachment_key=?", (key,))
                    continue
                with self.conn:
                    self.conn.execute("UPDATE tt_press_attachments SET status='pending',last_attempt_at=?,last_error=NULL WHERE attachment_key=?", (now(), key))
                # URL hash avoids collisions when names are identical or an attachment is replaced.
                filename = f"press_{item.source_id_type}_{item.source_id}_{a.ordinal:02d}_{key[:8]}_{safe_filename(a.original_filename)}"
                try:
                    result = self.client.download(a, self.folder / filename, item.source_url)
                    with self.conn:
                        self.conn.execute("""UPDATE tt_press_attachments SET local_path=?,size_bytes=?,sha256=?,content_type=?,
                            status='downloaded',downloaded_at=?,last_error=NULL WHERE attachment_key=?""",
                            (result["local_path"], result["size_bytes"], result["sha256"], result["content_type"], now(), key))
                    self.stats["attachments_downloaded"] += 1
                    logging.info("첨부파일 저장: %s (%s bytes)", filename, result["size_bytes"])
                except Exception as exc:
                    failed += 1; self.stats["attachments_failed"] += 1
                    with self.conn:
                        self.conn.execute("UPDATE tt_press_attachments SET status='failed',last_error=? WHERE attachment_key=?", (str(exc), key))
                    self.error("attachment", a.download_url, exc, item.post_key)
            state = "partial" if failed else ("no_download" if self.args.no_download and detail.attachments else "success")
            message = f"첨부파일 {failed}개 실패" if failed else None
            with self.conn:
                self.conn.execute("UPDATE tt_press_posts SET status=?,last_error=?,last_success_at=CASE WHEN ?='success' THEN ? ELSE last_success_at END WHERE post_key=?",
                                  (state, message, state, now(), item.post_key))
            self.stats["failed_posts" if failed else "succeeded_posts"] += 1
            logging.info("게시글 %s 처리: %s", item.source_id, state)
        except Exception as exc:
            with self.conn:
                self.conn.execute("UPDATE tt_press_posts SET status='failed',last_error=? WHERE post_key=?", (str(exc), item.post_key))
            self.stats["failed_posts"] += 1
            self.error("detail", item.source_url, exc, item.post_key)

    def run(self):
        items = self.retry_items() if self.args.retry_failed else self.discover()
        logging.info("[처리 대상] %s건; 진행률은 이번 실행 대상 기준", len(items))
        # Persist every discovered ID before detail work, allowing interrupted runs to resume.
        for item in items:
            self.remember(item)
        for index, item in enumerate(items, 1):
            logging.info("[게시글 %s/%s 시작] %s", index, len(items), item.title)
            self.process(item)
            logging.info("[진행 완료] %s/%s (%.1f%%) / 성공 %s건 / 실패 %s건 / 첨부 저장 %s개 / 첨부 실패 %s개",
                         index, len(items), index * 100 / len(items), self.stats["succeeded_posts"],
                         self.stats["failed_posts"], self.stats["attachments_downloaded"], self.stats["attachments_failed"])
        if self.args.no_download:
            self.notes.append("--no-download: 첨부파일 수집을 생략한 진단 실행")
        logging.info("[처리 종료] 성공 %s건 / 실패 %s건 / 오류 %s건", self.stats["succeeded_posts"],
                     self.stats["failed_posts"], self.errors)
        return "partial" if self.errors else "success"


def load_config(path: Path) -> dict:
    with path.open(encoding="utf-8-sig") as f:
        custom = json.load(f)
    if not isinstance(custom, dict):
        raise CrawlError("config.json은 JSON 객체여야 합니다.")
    unknown = set(custom) - set(DEFAULTS)
    if unknown:
        raise CrawlError(f"알 수 없는 설정 항목: {sorted(unknown)}")
    cfg = DEFAULTS | custom
    if cfg["verify_ssl"] is not True:
        raise CrawlError("TLS 인증서 검증은 해제할 수 없습니다. verify_ssl=true를 사용하세요.")
    base = urlsplit(cfg["base_url"])
    if base.scheme != "https" or base.hostname not in ALLOWED_HOSTS or base.path not in ("", "/") or base.query or base.fragment:
        raise CrawlError("base_url은 https://www.tt.go.kr 또는 https://tt.go.kr 이어야 합니다.")
    if cfg["list_path"] != "/mUser/community/pressList.do":
        raise CrawlError("이 프로그램은 보도자료 게시판 전용입니다. list_path를 변경하지 마세요.")
    cfg["base_url"] = cfg["base_url"].rstrip("/")
    if not isinstance(cfg["category_subdir"], list) or not cfg["category_subdir"]:
        raise CrawlError("category_subdir는 비어 있지 않은 폴더명 배열이어야 합니다.")
    for part in cfg["category_subdir"]:
        if not isinstance(part, str) or part in ("", ".", "..") or safe_filename(part) != part:
            raise CrawlError("category_subdir에는 안전한 단일 폴더명만 지정할 수 있습니다.")
    for key in ("db_path", "download_root", "log_dir"):
        value = cfg[key]
        if not isinstance(value, str) or not value.strip():
            raise CrawlError(f"{key}는 비어 있지 않은 문자열이어야 합니다.")
        if os.name != "nt" and (re.match(r"^[A-Za-z]:[\\/]", value) or value.startswith("\\\\")):
            raise CrawlError(f"{key}가 Windows 경로입니다. Linux/macOS에서는 config.json에 실제 경로를 설정하세요.")
        p = Path(value).expanduser()
        cfg[key] = str((p if p.is_absolute() else path.resolve().parent / p).resolve())
    for key in ("request_interval_seconds", "connect_timeout_seconds", "read_timeout_seconds"):
        if isinstance(cfg[key], bool) or not isinstance(cfg[key], (int, float)) or cfg[key] <= 0:
            raise CrawlError(f"{key}는 0보다 큰 숫자여야 합니다.")
    cfg["request_interval_seconds"] = max(1.0, cfg["request_interval_seconds"])
    for key in ("max_retries", "max_attachment_bytes"):
        if type(cfg[key]) is not int or cfg[key] < (0 if key == "max_retries" else 1):
            raise CrawlError(f"{key}는 유효한 정수여야 합니다.")
    if cfg["max_retries"] > 10:
        raise CrawlError("max_retries는 10 이하로 설정하세요.")
    if type(cfg["backup_before_run"]) is not bool or not isinstance(cfg["user_agent"], str) or not cfg["user_agent"].strip():
        raise CrawlError("backup_before_run 또는 user_agent 설정이 잘못되었습니다.")
    return cfg


def make_parser():
    parser = argparse.ArgumentParser(description=f"조세심판원 소식 및 소통 > 보도자료 수집 V{VERSION}; 페이지 미지정 시 전체")
    parser.add_argument("--config", type=Path, default=Path(__file__).with_name("config.json"))
    parser.add_argument("--allow-disallowed", action="store_true", help="운영기관 수집 허가를 확인한 경우에만 robots 제한 경로 수집")
    parser.add_argument("--retry-failed", action="store_true", help="DB에 기록된 실패/미완료 게시글만 재수집")
    parser.add_argument("--pages", "--page", type=parse_pages, metavar="SPEC", help="선택 페이지: 3 / 2-4 / 1,3,5 / 1,3-5. 생략하면 전체 페이지")
    parser.add_argument("--max-pages", type=int, help="진단용 최대 페이지 수. 생략하면 전체 페이지")
    parser.add_argument("--no-download", action="store_true", help="진단용 첨부파일 생략")
    parser.add_argument("--create-db", action="store_true", help="DB가 없을 때 새로 생성하는 것을 명시적으로 허용")
    parser.add_argument("--backup-db", action="store_true", help="설정과 무관하게 실행 전 SQLite online backup 수행")
    parser.add_argument("--version", action="version", version=VERSION)
    return parser


def main(argv=None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    parser = make_parser()
    args = parser.parse_args(argv)
    if args.max_pages is not None and args.max_pages < 1:
        parser.error("--max-pages는 1 이상이어야 합니다.")
    if args.retry_failed and args.max_pages:
        parser.error("--retry-failed와 --max-pages를 함께 사용할 수 없습니다.")
    if args.pages and (args.retry_failed or args.max_pages is not None):
        parser.error("--pages는 --retry-failed 또는 --max-pages와 함께 사용할 수 없습니다.")
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "_" + uuid.uuid4().hex[:8]
    summary = {"version": VERSION, "run_id": run_id, "started_at": now(), "status": "failed"}
    cfg, client, conn, crawler = None, None, None, None
    bootstrap_log_dir = args.config.expanduser().resolve().parent / "LOG"
    log_file = None
    exit_code = 2
    try:
        log_file = configure_logging(bootstrap_log_dir)
        logging.info("Run started: run_id=%s version=%s config=%s log_file=%s", run_id, VERSION, args.config, log_file)
        logging.info("[준비] 설정 파일 읽는 중: %s", args.config)
        cfg = load_config(args.config)
        log_dir = Path(cfg["log_dir"]); log_dir.mkdir(parents=True, exist_ok=True)
        if log_dir.resolve() != bootstrap_log_dir.resolve():
            log_file = configure_logging(log_dir)
            logging.info("Configured log directory: %s", log_dir)
        summary.update({"db_path": cfg["db_path"], "download_root": cfg["download_root"],
                        "mode": "selected_pages" if args.pages else ("retry_failed" if args.retry_failed else ("limited" if args.max_pages or args.no_download else "full")),
                        "requested_pages": args.pages,
                        "allow_disallowed": args.allow_disallowed,
                        "log_file": str(log_file)})
        scope = ",".join(map(str, args.pages)) + "페이지" if args.pages else (
            "실패/미완료 재처리" if args.retry_failed else (f"최대 {args.max_pages}페이지" if args.max_pages else "전체 페이지"))
        logging.info("[수집 범위] %s / 실행 모드 %s", scope, summary["mode"])
        client = HTTPClient(cfg, args.allow_disallowed)
        logging.info("[정책 확인] robots.txt 확인 중")
        client.load_robots()
        client.check_allowed(urljoin(cfg["base_url"], cfg["list_path"]))
        logging.info("[정책 확인 완료] 게시판 요청 단계로 진행")
        if args.allow_disallowed:
            logging.warning("수집 허가를 확인했다는 명시 옵션이 사용되었습니다. 접근권한·차단 우회 기능은 제공하지 않습니다.")
        db_path = Path(cfg["db_path"])
        if not db_path.exists() and not args.create_db:
            raise CrawlError(f"기존 DB가 없습니다: {db_path}; 새 DB는 --create-db로 생성하세요.")
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with database_lock(db_path):
            existed = db_path.exists()
            logging.info("[DB 준비] %s / 필요 시 기존 DB 백업", db_path)
            conn = connect_db(db_path, args.create_db)
            backup = backup_db(conn, db_path) if existed and (cfg["backup_before_run"] or args.backup_db) else None
            summary["backup_path"] = str(backup) if backup else None
            initialize_schema(conn, Path(__file__).with_name("schema.sql"))
            logging.info("[DB 준비 완료] 스키마 확인 완료 / 백업 %s", backup or "없음")
            with conn:
                conn.execute("INSERT INTO tt_press_runs(run_id,started_at,mode,status,db_path,download_root,backup_path) VALUES(?,?,?,'running',?,?,?)",
                             (run_id, summary["started_at"], summary["mode"], cfg["db_path"], cfg["download_root"], summary["backup_path"]))
            crawler = Crawler(conn, client, cfg, args, run_id)
            try:
                summary["status"] = crawler.run()
                exit_code = 0 if summary["status"] == "success" else 1
            except KeyboardInterrupt:
                summary["status"] = "interrupted"; exit_code = 130
                crawler.notes.append("사용자 중단. 실패 재실행 또는 전체 재실행 가능")
            except Exception as exc:
                crawler.error("system", None, exc)
                summary["status"] = "failed"; exit_code = 2
            finally:
                summary.update(crawler.stats)
                summary["notes"] = crawler.notes
                summary["finished_at"] = now()
                with conn:
                    conn.execute("""UPDATE tt_press_runs SET finished_at=?,status=?,expected_posts=?,scanned_pages=?,discovered_posts=?,
                        succeeded_posts=?,failed_posts=?,attachments_downloaded=?,attachments_failed=?,notes=? WHERE run_id=?""",
                        (summary["finished_at"], summary["status"], *(summary[k] for k in crawler.stats),
                         json.dumps(crawler.notes, ensure_ascii=False), run_id))
                conn.close(); conn = None
    except RobotsBlocked as exc:
        summary["status"] = "blocked"; summary["error"] = str(exc); exit_code = 3
        logging.error("%s", exc)
    except KeyboardInterrupt:
        summary["status"] = "interrupted"; exit_code = 130
    except Exception as exc:
        summary["error"] = f"{type(exc).__name__}: {exc}"
        logging.error("실행 실패: %s", exc)
    finally:
        if conn is not None:
            conn.close()
        if client is not None:
            client.close()
        summary["finished_at"] = now(); summary["exit_code"] = exit_code
        if cfg:
            target = Path(cfg["log_dir"]) / f"{run_id}_summary.json"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            logging.info("실행 요약: %s", target)
        if log_file:
            logging.info("Run finished: run_id=%s status=%s exit_code=%s", run_id, summary["status"], exit_code)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
