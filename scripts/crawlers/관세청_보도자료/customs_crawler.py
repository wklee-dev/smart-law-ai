#!/usr/bin/env python3
"""Korea Customs Service press releases: list, details and attachments."""
from __future__ import annotations

import argparse
import configparser
import hashlib
import logging
import os
import re
import sqlite3
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

try:
    import requests
    from bs4 import BeautifulSoup, NavigableString, Tag
except ImportError as exc:
    print("Required packages missing. Run setup.bat or: python -m pip install -r requirements.txt", file=sys.stderr)
    raise SystemExit(2) from exc

BASE = "https://www.customs.go.kr"
LIST_URL = BASE + "/kcs/na/ntt/selectNttList.do"
DETAIL_URL = BASE + "/kcs/na/ntt/selectNttInfo.do"
MI = "2891"
BBS = "1362"
HERE = Path(__file__).resolve().parent
LOG = logging.getLogger("customs_crawler")

POST_DDL = """CREATE TABLE kcs_press_release_v1 (
    ntt_sn TEXT PRIMARY KEY,
    bbs_id TEXT NOT NULL,
    ntt_sn_url TEXT NOT NULL,
    list_number TEXT,
    category TEXT,
    title TEXT NOT NULL,
    writer TEXT,
    published_date TEXT,
    view_count INTEGER,
    detail_url TEXT NOT NULL,
    source_page INTEGER NOT NULL,
    body_text TEXT,
    body_html TEXT,
    list_collected_at TEXT NOT NULL,
    detail_collected_at TEXT,
    detail_status TEXT NOT NULL DEFAULT 'pending',
    detail_error TEXT
)"""
FILE_DDL = """CREATE TABLE kcs_press_attachment_v1 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ntt_sn TEXT NOT NULL,
    file_key TEXT NOT NULL,
    original_name TEXT NOT NULL,
    download_url TEXT NOT NULL,
    expected_bytes INTEGER,
    relative_path TEXT,
    size_bytes INTEGER,
    sha256 TEXT,
    download_status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    downloaded_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(ntt_sn, file_key),
    FOREIGN KEY(ntt_sn) REFERENCES kcs_press_release_v1(ntt_sn)
)"""
POST_COLS = {'ntt_sn','bbs_id','ntt_sn_url','list_number','category','title','writer',
             'published_date','view_count','detail_url','source_page','body_text','body_html',
             'list_collected_at','detail_collected_at','detail_status','detail_error'}
FILE_COLS = {'id','ntt_sn','file_key','original_name','download_url','expected_bytes',
             'relative_path','size_bytes','sha256','download_status','error_message',
             'downloaded_at','is_active'}


def now():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def init_logging():
    log_dir = HERE / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    if LOG.handlers:
        return
    LOG.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
    fh = logging.FileHandler(log_dir / (datetime.now().strftime("%Y-%m-%d") + ".log"), encoding="utf-8")
    sh = logging.StreamHandler()
    fh.setFormatter(fmt)
    sh.setFormatter(fmt)
    LOG.addHandler(fh)
    LOG.addHandler(sh)


def text(tag):
    return tag.get_text(" ", strip=True) if tag else ""


def as_int(value):
    value = str(value).strip().replace(",", "")
    return int(value) if value.isdigit() else None


def detail_url(ntt_sn, token):
    return DETAIL_URL + "?" + urlencode({"mi": MI, "bbsId": BBS, "nttSn": ntt_sn, "nttSnUrl": token})


def same_site(url):
    p = urlparse(url)
    return p.scheme == "https" and p.hostname == "www.customs.go.kr" and p.port in (None, 443)


def parse_list(html, requested_page):
    soup = BeautifulSoup(html, "html.parser")
    table = soup.select_one("table.bbsList")
    page_info = soup.select_one(".page_num")
    if not table or not page_info:
        raise ValueError("목록 구조를 찾을 수 없습니다. 사이트 구조 변경 또는 오류 응답을 확인하세요.")
    m = re.search(r"([\d,]+)\s*/\s*([\d,]+)", text(page_info))
    if not m:
        raise ValueError("현재 페이지/전체 페이지 수를 확인할 수 없습니다.")
    current, total = int(m.group(1).replace(",", "")), int(m.group(2).replace(",", ""))
    if current != requested_page:
        raise ValueError(f"요청한 페이지({requested_page})와 응답 페이지({current})가 다릅니다.")
    posts = []
    rows = table.select("tbody > tr")
    for row in rows:
        a = row.select_one("a.nttInfoBtn")
        if not a:
            if row.select_one("td") and ("없습니다" in text(row) or "없음" in text(row)):
                continue
            raise ValueError("게시물 링크를 찾을 수 없는 목록 행이 있습니다.")
        cells = row.find_all("td", recursive=False)
        if len(cells) < 6:
            raise ValueError("목록 행의 필드가 6개 미만입니다.")
        post_id = str(a.get("data-id", "")).strip()
        token = str(a.get("data-url", "")).strip()
        if not post_id.isdigit() or not re.fullmatch(r"[A-Za-z0-9]+", token):
            raise ValueError(f"목록의 게시물 식별자/토큰이 유효하지 않습니다: {post_id!r}")
        if str(a.get("data-bbs", BBS)) != BBS:
            raise ValueError("목록에 예상하지 못한 게시판 ID가 있습니다.")
        title = str(a.get("title") or text(a)).strip()
        if not title:
            raise ValueError(f"제목이 비어 있습니다: {post_id}")
        posts.append(dict(ntt_sn=post_id, bbs_id=BBS, ntt_sn_url=token,
                          list_number=text(cells[0]), category=text(cells[1]), title=title,
                          writer=text(cells[3]), published_date=text(cells[4]),
                          view_count=as_int(text(cells[5])), detail_url=detail_url(post_id, token),
                          source_page=requested_page, list_collected_at=now()))
    if not posts and re.search(r"전체\s*[1-9][\d,]*\s*건", text(page_info)):
        raise ValueError("게시물이 존재하지만 목록에서 추출하지 못했습니다.")
    return posts, total


def body_to_text(body):
    # Keep words split across inline spans together; insert breaks only for block elements.
    parts = []
    blocks = {'p','div','tr','table','ul','ol','li','h1','h2','h3','h4','h5','h6'}
    def visit(node):
        if isinstance(node, NavigableString):
            parts.append(str(node))
        elif isinstance(node, Tag):
            if node.name in ('script', 'style'):
                return
            if node.name in blocks or node.name == 'br':
                parts.append('\n')
            for child in node.children:
                visit(child)
            if node.name in ('td', 'th'):
                parts.append('\t')
            if node.name in blocks:
                parts.append('\n')
    visit(body)
    lines = [re.sub(r'[ \t\u00a0]+', ' ', line).strip() for line in ''.join(parts).splitlines()]
    return '\n'.join(line for line in lines if line)


def parse_detail(html, expected_id):
    soup = BeautifulSoup(html, "html.parser")
    form = soup.select_one("form#nttViewForm")
    if not form:
        raise ValueError("상세 페이지를 찾을 수 없습니다. 게시물 삭제 또는 사이트 구조를 확인하세요.")
    id_input = form.select_one('input[name="nttSn"]')
    if id_input and str(id_input.get('value', '')) != expected_id:
        raise ValueError("응답의 게시물 ID가 요청한 ID와 다릅니다.")
    title = text(form.select_one("h3.bbsTitle"))
    body = form.select_one("table.bbsView td.conts > div.conts")
    if not title or body is None:
        raise ValueError("상세 제목 또는 본문 영역을 찾을 수 없습니다.")
    fields = {}
    for th in form.select('table.bbsView > tbody > tr > th'):
        td = th.find_next_sibling('td')
        if td:
            fields[text(th)] = text(td)
    files = []
    for ul in form.select('ul.list_file'):
        for li in ul.find_all('li', recursive=False):
            a = li.select_one('a[href*="nttFileDownload.do"]')
            if not a:
                raise ValueError("첨부파일 행의 다운로드 링크를 찾을 수 없습니다.")
            url = urljoin(BASE, a.get('href', ''))
            key = parse_qs(urlparse(url).query).get('fileKey', [''])[0]
            if not same_site(url) or not re.fullmatch(r'[A-Za-z0-9_-]+', key):
                raise ValueError("안전하지 않거나 식별자가 없는 첨부파일 URL입니다.")
            title_attr = str(a.get('title', '')).strip()
            name = title_attr[:-len(' 다운로드')].strip() if title_attr.endswith(' 다운로드') else ''
            if not name:
                name = ''.join(str(n) for n in a.contents if isinstance(n, NavigableString)).strip()
            if not name:
                raise ValueError("첨부파일 원본 이름을 찾을 수 없습니다.")
            size = as_int(text(a.select_one('span')))
            files.append(dict(file_key=key, original_name=name, download_url=url, expected_bytes=size))
    if len({f['file_key'] for f in files}) != len(files):
        raise ValueError("상세 페이지에 중복 첨부파일 식별자가 있습니다.")
    return dict(title=title, writer=fields.get('작성자'), published_date=fields.get('등록일'),
                category=fields.get('구분'), body_text=body_to_text(body),
                body_html=str(body), files=files)


def safe_filename(name):
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', name).strip(' .')
    if not name:
        name = 'attachment'
    stem, ext = os.path.splitext(name)
    if re.fullmatch(r'(?i)(con|prn|aux|nul|com[1-9]|lpt[1-9])', stem):
        stem = '_' + stem
    ext = ext[:20]
    stem = stem[:100]
    while len((stem + ext).encode('utf-8')) > 180 and stem:
        stem = stem[:-1]
    return (stem or 'attachment').rstrip(' .') + ext


def connect_db(path, create_db=False):
    if not path.exists():
        if not create_db:
            raise FileNotFoundError(f"기존 DB가 없습니다: {path}. 위치를 확인하거나 새 DB를 원할 때만 --create-db를 사용하세요.")
        path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(path), timeout=30)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys=ON')
    try:
        with con:
            con.execute('BEGIN IMMEDIATE')
            for name, ddl, required, primary in [
                ('kcs_press_release_v1', POST_DDL, POST_COLS, 'ntt_sn'),
                ('kcs_press_attachment_v1', FILE_DDL, FILE_COLS, 'id')]:
                obj = con.execute("SELECT type, sql FROM sqlite_master WHERE name=?", (name,)).fetchone()
                if obj:
                    cols = con.execute(f'PRAGMA table_info({name})').fetchall() if obj['type'] == 'table' else []
                    actual_sql = re.sub(r'\s+', ' ', obj['sql'] or '').strip()
                    expected_sql = re.sub(r'\s+', ' ', ddl).strip()
                    if (actual_sql != expected_sql or {x['name'] for x in cols} != required
                            or not any(x['name'] == primary and x['pk'] == 1 for x in cols)):
                        raise RuntimeError(f"기존 객체 {name}의 구조가 달라 안전을 위해 중단합니다. 기존 DB 백업 및 이름 충돌을 확인하세요.")
                else:
                    con.execute(ddl)
            unique_indexes = con.execute('PRAGMA index_list(kcs_press_attachment_v1)').fetchall()
            unique_keys = []
            for idx in unique_indexes:
                if idx['unique'] and not idx['partial']:
                    safe_index = idx['name'].replace('"', '""')
                    unique_keys.append([x['name'] for x in con.execute(f'PRAGMA index_info("{safe_index}")')])
            if ['ntt_sn', 'file_key'] not in unique_keys:
                raise RuntimeError("기존 첨부 테이블에 필요한 고유 제약조건이 없어 중단합니다.")
            foreign_keys = con.execute('PRAGMA foreign_key_list(kcs_press_attachment_v1)').fetchall()
            if not any(row['table'] == 'kcs_press_release_v1' and row['from'] == 'ntt_sn' and row['to'] == 'ntt_sn' for row in foreign_keys):
                raise RuntimeError("기존 첨부 테이블에 필요한 외래키가 없어 중단합니다.")
    except Exception:
        con.close()
        raise
    return con


def save_posts(con, posts):
    sql = """INSERT INTO kcs_press_release_v1
      (ntt_sn,bbs_id,ntt_sn_url,list_number,category,title,writer,published_date,view_count,detail_url,source_page,list_collected_at)
      VALUES (:ntt_sn,:bbs_id,:ntt_sn_url,:list_number,:category,:title,:writer,:published_date,:view_count,:detail_url,:source_page,:list_collected_at)
      ON CONFLICT(ntt_sn) DO UPDATE SET bbs_id=excluded.bbs_id,ntt_sn_url=excluded.ntt_sn_url,
        list_number=excluded.list_number,category=excluded.category,title=excluded.title,writer=excluded.writer,
        published_date=excluded.published_date,view_count=excluded.view_count,detail_url=excluded.detail_url,
        source_page=excluded.source_page,list_collected_at=excluded.list_collected_at"""
    with con:
        con.executemany(sql, posts)


def save_detail(con, post_id, detail):
    with con:
        con.execute("""UPDATE kcs_press_release_v1 SET title=?,writer=COALESCE(?,writer),
            published_date=COALESCE(?,published_date),category=COALESCE(?,category),body_text=?,body_html=?,
            detail_collected_at=?,detail_status='pending',detail_error=NULL WHERE ntt_sn=?""",
            (detail['title'],detail['writer'],detail['published_date'],detail['category'],detail['body_text'],
             detail['body_html'],now(),post_id))
        con.execute("UPDATE kcs_press_attachment_v1 SET is_active=0 WHERE ntt_sn=?", (post_id,))
        for f in detail['files']:
            con.execute("""INSERT INTO kcs_press_attachment_v1
                (ntt_sn,file_key,original_name,download_url,expected_bytes,is_active)
                VALUES (?,?,?,?,?,1) ON CONFLICT(ntt_sn,file_key) DO UPDATE SET
                original_name=excluded.original_name,download_url=excluded.download_url,
                expected_bytes=excluded.expected_bytes,is_active=1""",
                (post_id,f['file_key'],f['original_name'],f['download_url'],f['expected_bytes']))


class HttpClient:
    def __init__(self, delay, connect_timeout, read_timeout, retries):
        self.delay = delay
        self.timeout = (connect_timeout, read_timeout)
        self.retries = retries
        self.last_request = 0.0
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "Mozilla/5.0 (compatible; KCS-Press-Crawler/1.0)",
                                     "Referer": LIST_URL + "?mi=2891&bbsId=1362"})

    def _throttle(self):
        wait = self.delay - (time.monotonic() - self.last_request)
        if wait > 0:
            time.sleep(wait)
        self.last_request = time.monotonic()

    def _get(self, url, **kwargs):
        if not same_site(url):
            raise ValueError("공식 도메인 외 URL 요청을 차단했습니다: " + url)
        self._throttle()
        # Redirects must stay on the official host; inspect every hop before following it.
        for _ in range(6):
            r = self.session.get(url, timeout=self.timeout, allow_redirects=False, **kwargs)
            if r.is_redirect:
                next_url = urljoin(url, r.headers.get('Location', ''))
                r.close()
                if not same_site(next_url):
                    raise ValueError("공식 도메인 외 리다이렉트를 차단했습니다: " + next_url)
                url = next_url
                kwargs.pop('params', None)
                self._throttle()
                continue
            r.raise_for_status()
            return r
        raise ValueError("리다이렉트 횟수 초과")

    def html(self, url, params=None):
        for attempt in range(1, self.retries + 1):
            try:
                r = self._get(url, params=params)
                try:
                    r.encoding = 'utf-8'
                    return r.text
                finally:
                    r.close()
            except (requests.RequestException, OSError) as e:
                if attempt == self.retries:
                    raise
                LOG.warning("요청 재시도 %s/%s: %s", attempt, self.retries, e)
                time.sleep(min(2 ** (attempt - 1), 10))

    def download(self, url, target, expected_bytes):
        target.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(1, self.retries + 1):
            temp_path = None
            try:
                r = self._get(url, stream=True)
                try:
                    ct = r.headers.get('Content-Type', '').lower()
                    if 'text/html' in ct or 'application/json' in ct:
                        raise ValueError("첨부파일 대신 HTML/JSON 응답을 받았습니다.")
                    h = hashlib.sha256()
                    size = 0
                    with tempfile.NamedTemporaryFile(prefix='.kcs_', suffix='.part', dir=target.parent, delete=False) as f:
                        temp_path = Path(f.name)
                        for chunk in r.iter_content(65536):
                            if chunk:
                                f.write(chunk)
                                h.update(chunk)
                                size += len(chunk)
                    os.replace(temp_path, target)
                    return size, h.hexdigest()
                finally:
                    r.close()
            except (requests.RequestException, OSError, ValueError) as e:
                if temp_path:
                    temp_path.unlink(missing_ok=True)
                if attempt == self.retries:
                    raise
                LOG.warning("첨부 다운로드 재시도 %s/%s: %s", attempt, self.retries, e)
                time.sleep(min(2 ** (attempt - 1), 10))


def get_list(client, page):
    html = client.html(LIST_URL, {'mi': MI, 'bbsId': BBS, 'currPage': page, 'listCo': 10})
    return parse_list(html, page)


def process_post(con, client, post_id, download_root):
    post = con.execute('SELECT * FROM kcs_press_release_v1 WHERE ntt_sn=?', (post_id,)).fetchone()
    try:
        detail = parse_detail(client.html(post['detail_url']), post_id)
        save_detail(con, post_id, detail)
        errors = []
        for f in detail['files']:
            key_prefix = hashlib.sha256(f['file_key'].encode('utf-8')).hexdigest()
            relative = Path('관세청') / '보도자료' / post_id / (key_prefix + '_' + safe_filename(f['original_name']))
            target = download_root / relative
            try:
                size, digest = client.download(f['download_url'], target, f['expected_bytes'])
                mismatch = f['expected_bytes'] is not None and size != f['expected_bytes']
                warning = (f"게시판 표시 크기 {f['expected_bytes']}바이트와 실제 수신 크기 {size}바이트가 다릅니다. 파일을 확인하세요."
                           if mismatch else None)
                with con:
                    con.execute("""UPDATE kcs_press_attachment_v1 SET relative_path=?,size_bytes=?,sha256=?,
                        download_status=?,error_message=?,downloaded_at=? WHERE ntt_sn=? AND file_key=?""",
                        (str(relative),size,digest,'size_mismatch' if mismatch else 'complete',warning,now(),post_id,f['file_key']))
                if warning:
                    errors.append(f"{f['original_name']}: {warning}")
                    LOG.warning("첨부 저장 후 확인 필요 %s / %s: %s", post_id, f['original_name'], warning)
                else:
                    LOG.info("첨부 완료 %s / %s (%s bytes)", post_id, f['original_name'], size)
            except Exception as e:
                msg = f'{type(e).__name__}: {e}'
                errors.append(f"{f['original_name']}: {msg}")
                with con:
                    con.execute("UPDATE kcs_press_attachment_v1 SET download_status='failed',error_message=? WHERE ntt_sn=? AND file_key=?", (msg,post_id,f['file_key']))
                LOG.error("첨부 실패 %s / %s: %s", post_id, f['original_name'], msg)
        status = 'partial' if errors else 'complete'
        with con:
            con.execute('UPDATE kcs_press_release_v1 SET detail_status=?,detail_error=? WHERE ntt_sn=?',
                        (status, '\n'.join(errors) if errors else None, post_id))
        LOG.info("상세 %s: %s (첨부 %s개)", status, post_id, len(detail['files']))
        return not errors
    except Exception as e:
        msg = f'{type(e).__name__}: {e}'
        with con:
            con.execute("UPDATE kcs_press_release_v1 SET detail_status='failed',detail_error=? WHERE ntt_sn=?", (msg,post_id))
        LOG.error("상세 실패 %s: %s", post_id, msg)
        return False


def load_config(path):
    cfg = configparser.ConfigParser(interpolation=None)
    if not path.is_file():
        raise FileNotFoundError(f'설정 파일이 없습니다: {path}')
    cfg.read(path, encoding='utf-8-sig')
    if 'crawler' not in cfg:
        raise ValueError('config.ini에 [crawler] 섹션이 없습니다.')
    return cfg['crawler']


def validate_path(raw):
    if os.name != 'nt' and re.match(r'^[A-Za-z]:[\\/]', raw):
        raise ValueError('Windows 기본 경로입니다. 이 OS에서는 --db 및 --download-dir에 실제 경로를 지정하세요.')
    return Path(raw).expanduser().resolve()


def parse_args(argv=None):
    p = argparse.ArgumentParser(description='관세청 보도자료 크롤러 (가상환경 불필요)')
    p.add_argument('pages', nargs='*', help='페이지 1개, 시작 끝, 또는 all')
    p.add_argument('--from', dest='from_page', type=int, help='시작 페이지(포함)')
    p.add_argument('--to', dest='to_page', type=int, help='끝 페이지(포함)')
    p.add_argument('--stage', choices=['all','list','detail'], default='all', help='all=목록+상세+첨부, list=목록만, detail=저장된 목록의 상세+첨부')
    p.add_argument('--config', default=str(HERE / 'config.ini'), help='설정 파일 경로')
    p.add_argument('--db', help='SQLite DB 경로 덮어쓰기')
    p.add_argument('--download-dir', help='첨부파일 기본 저장 디렉터리 덮어쓰기')
    p.add_argument('--create-db', action='store_true', help='DB가 없을 경우에만 새로 생성')
    args = p.parse_args(argv)
    cfg = load_config(Path(args.config))
    if args.pages and (args.from_page is not None or args.to_page is not None):
        p.error('위치 페이지 인자와 --from/--to는 함께 사용할 수 없습니다.')
    all_pages = False
    if args.pages:
        if args.pages == ['all']:
            all_pages, start, end = True, 1, None
        elif len(args.pages) in (1, 2) and all(x.isdigit() for x in args.pages):
            start = int(args.pages[0]); end = int(args.pages[-1])
        else:
            p.error('페이지는 숫자 1개, 시작/끝 숫자 2개, 또는 all을 지정하세요.')
    elif args.from_page is not None or args.to_page is not None:
        if args.from_page is None or args.to_page is None:
            p.error('--from과 --to를 함께 지정하세요.')
        start, end = args.from_page, args.to_page
    else:
        start = cfg.getint('start_page', fallback=1)
        end = cfg.getint('end_page', fallback=1)
    if start < 1 or (end is not None and end < start):
        p.error('페이지 범위는 1 이상이며 시작 페이지가 끝 페이지보다 작거나 같아야 합니다.')
    args.start, args.end, args.all_pages = start, end, all_pages
    args.db_path = validate_path(args.db or cfg.get('db_path', 'D:\\SQLiteDB\\smart_law_ai.db'))
    args.download_root = validate_path(args.download_dir or cfg.get('download_dir', 'C:\\SQLiteDB\\downloads'))
    args.delay = cfg.getfloat('delay_seconds', fallback=0.5)
    args.connect_timeout = cfg.getfloat('connect_timeout_seconds', fallback=15)
    args.read_timeout = cfg.getfloat('read_timeout_seconds', fallback=60)
    args.retries = cfg.getint('retries', fallback=3)
    if args.delay < 0 or args.connect_timeout <= 0 or args.read_timeout <= 0 or args.retries < 1:
        p.error('delay는 0 이상, timeout과 retries는 0보다 커야 합니다.')
    return args


def main(argv=None):
    init_logging()
    con = None
    try:
        args = parse_args(argv)
        LOG.info('시작 stage=%s pages=%s DB=%s', args.stage,
                 'all' if args.all_pages else f'{args.start}-{args.end}', args.db_path)
        con = connect_db(args.db_path, args.create_db)
        client = HttpClient(args.delay, args.connect_timeout, args.read_timeout, args.retries)
        failures = 0
        seen = set()
        detail_ids = []
        list_count = 0
        detail_count = 0
        if args.stage in ('list', 'all'):
            # Read the first requested page to determine the actual last page, never a fixed constant.
            first_posts, total = get_list(client, args.start)
            if args.start > total:
                raise ValueError(f'시작 페이지 {args.start}가 마지막 페이지 {total}를 초과합니다.')
            end = total if args.all_pages else args.end
            if end > total:
                raise ValueError(f'끝 페이지 {end}가 마지막 페이지 {total}를 초과합니다.')
            LOG.info('수집 범위 %s-%s (시작 시 전체 %s페이지)', args.start, end, total)
            for page in range(args.start, end + 1):
                try:
                    posts, page_total = (first_posts, total) if page == args.start else get_list(client, page)
                    if page_total != total:
                        LOG.warning('수집 중 전체 페이지가 변경되었습니다: %s -> %s. 범위를 재수집해 누락을 확인하세요.', total, page_total)
                    save_posts(con, posts)
                    list_count += len(posts)
                    LOG.info('목록 %s페이지: %s건', page, len(posts))
                    if args.stage == 'all':
                        for post in posts:
                            post_id = post['ntt_sn']
                            if post_id in seen:
                                continue
                            seen.add(post_id)
                            detail_ids.append(post_id)
                except Exception as e:
                    failures += 1
                    LOG.error('목록/페이지 처리 실패 %s: %s: %s', page, type(e).__name__, e)
            if args.stage == 'all':
                LOG.info('목록 수집 종료. 상세 처리 대상 %s건', len(detail_ids))
                for post_id in detail_ids:
                    detail_count += 1
                    if not process_post(con, client, post_id, args.download_root):
                        failures += 1
        else:
            if args.all_pages:
                rows = con.execute('SELECT ntt_sn FROM kcs_press_release_v1 ORDER BY source_page,ntt_sn DESC').fetchall()
            else:
                rows = con.execute('SELECT ntt_sn FROM kcs_press_release_v1 WHERE source_page BETWEEN ? AND ? ORDER BY source_page,ntt_sn DESC', (args.start,args.end)).fetchall()
            if not rows:
                raise ValueError('선택한 범위에 저장된 목록이 없습니다. 먼저 같은 범위로 --stage list를 실행하세요.')
            LOG.info('저장된 목록의 상세 처리 대상 %s건', len(rows))
            for row in rows:
                detail_count += 1
                if not process_post(con, client, row['ntt_sn'], args.download_root):
                    failures += 1
        LOG.info('완료: 목록 %s건, 상세 시도 %s건, 실패 %s건', list_count, detail_count, failures)
        if failures:
            LOG.error('실패 또는 첨부 크기 불일치가 있습니다. 로그와 저장된 파일을 확인하고, 필요한 경우 같은 범위를 다시 실행하세요.')
        return 1 if failures else 0
    except (Exception, KeyboardInterrupt) as e:
        LOG.error('중단: %s: %s', type(e).__name__, e)
        return 1
    finally:
        if con is not None:
            con.close()


if __name__ == '__main__':
    sys.exit(main())
