#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""식약처 보도자료 원문과 첨부파일 수집. Python 3.8+ 표준 라이브러리만 사용."""
import argparse
import configparser
import contextlib
import datetime as dt
import hashlib
import html
import http.client
from html.parser import HTMLParser
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent
LIST_URL = 'https://www.mfds.go.kr/brd/m_99/list.do'
DEFAULT_DB = r'D:\SQLiteDB\smart_law_ai.db'
DEFAULT_DOWNLOAD = r'C:\SQLiteDB\downloads\식약처\보도자료'
VOID = frozenset('area base br col embed hr img input link meta param source track wbr'.split())
BLOCK = frozenset('p div li br tr h1 h2 h3 h4 h5 h6 section article'.split())


class CrawlError(Exception):
    pass


class Node:
    def __init__(self, tag='', attrs=None, raw=''):
        self.tag, self.attrs, self.raw = tag, dict(attrs or []), raw
        self.children = []
        self.end = ''

    def walk(self):
        yield self
        for c in self.children:
            if isinstance(c, Node):
                yield from c.walk()

    def cls(self, name):
        return name in (self.attrs.get('class') or '').split()

    def find(self, cls=None, tag=None):
        return next((n for n in self.walk() if (cls is None or n.cls(cls)) and
                     (tag is None or n.tag == tag)), None)

    def inner_html(self):
        return ''.join(c.outer_html() if isinstance(c, Node) else c for c in self.children)

    def outer_html(self):
        return self.raw + self.inner_html() + self.end

    def text(self):
        out = []
        def append(n):
            if isinstance(n, str):
                if not n.startswith('<!--'):
                    out.append(html.unescape(n))
            elif n.tag not in ('script', 'style'):
                if n.tag in BLOCK:
                    out.append('\n')
                for child in n.children:
                    append(child)
                if n.tag in BLOCK:
                    out.append('\n')
        append(self)
        text = ''.join(out).replace('\xa0', ' ')
        lines = [re.sub(r'[\t\r\f\v ]+', ' ', line).strip() for line in text.split('\n')]
        return '\n'.join(line for line in lines if line).strip()


class TreeParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.root = Node()
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.get_starttag_text())
        self.stack[-1].children.append(n)
        if tag not in VOID:
            self.stack.append(n)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, attrs, self.get_starttag_text()))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack[i].end = '</' + tag + '>'
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)

    def handle_entityref(self, name):
        self.stack[-1].children.append('&' + name + ';')

    def handle_charref(self, name):
        self.stack[-1].children.append('&#' + name + ';')

    def handle_comment(self, data):
        self.stack[-1].children.append('<!--' + data + '-->')


def tree(s):
    p = TreeParser()
    p.feed(s)
    p.close()
    return p.root


def qint(url, name):
    value = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get(name, [''])[0]
    if not re.fullmatch(r'\d+', value) or int(value) < 1:
        raise CrawlError('URL에서 올바른 %s를 찾지 못함: %s' % (name, url))
    return int(value)


def parse_list(source, url, requested_page):
    root = tree(source)
    info, box = root.find(cls='bbs_data_info'), root.find(cls='bbs_list01')
    if not info or not box:
        raise CrawlError('목록 구조(bbs_data_info/bbs_list01)를 찾지 못함')
    m = re.search(r'전체\s*([\d,]+)\s*건\s*,?\s*현재페이지\s*(\d+)\s*/\s*(\d+)', info.text())
    if not m:
        raise CrawlError('전체 건수/현재 페이지/마지막 페이지를 확인할 수 없음')
    total, current, last = (int(m.group(1).replace(',', '')), int(m.group(2)), int(m.group(3)))
    if current != requested_page:
        raise CrawlError('요청한 페이지 %s와 응답 페이지 %s가 다름' % (requested_page, current))
    if total < 1 or last < 1 or current > last:
        raise CrawlError('빈 목록 또는 범위를 벗어난 페이지: %s/%s, 총 %s건' % (current, last, total))
    ul = next((n for n in box.children if isinstance(n, Node) and n.tag == 'ul'), None)
    if ul is None:
        raise CrawlError('목록 행을 찾지 못함')
    rows = [n for n in ul.children if isinstance(n, Node) and n.tag == 'li']
    if not rows:
        raise CrawlError('목록이 비어 있음 (사이트 구조 변경 가능)')
    items, seen = [], set()
    for row in rows:
        a = row.find(cls='title', tag='a')
        if not a or 'view.do' not in (a.attrs.get('href') or ''):
            raise CrawlError('게시물 행에서 상세 링크를 찾지 못함')
        link = urllib.parse.urljoin(url, a.attrs['href'])
        seq = qint(link, 'seq')
        title = a.text()
        if not title or seq in seen:
            raise CrawlError('비어 있는 제목 또는 중복 게시물 seq=%s' % seq)
        seen.add(seq)
        number = row.find(cls='num')
        number_text = number.text() if number else ''
        date = row.find(cls='right_column')
        number_markup = number.outer_html() if number else ''
        is_notice = bool(re.search(r'공지|notice', number_text + ' ' + number_markup + ' ' +
                                   (row.attrs.get('class') or ''), re.I))
        listed_files = []
        file_box = row.find(cls='bbs_file_list')
        if file_box:
            for file_row in (n for n in file_box.children if isinstance(n, Node) and n.tag == 'li'):
                header = file_row.find(cls='bbs_file_list_header')
                name = header.find(tag='span') if header else None
                links = [n for n in file_row.walk() if n.tag == 'a' and 'down.do' in (n.attrs.get('href') or '')]
                if not name or not name.text() or len(links) != 1:
                    raise CrawlError('목록 첨부파일명 또는 링크 누락 seq=%s' % seq)
                file_url = urllib.parse.urljoin(url, links[0].attrs['href'])
                file_seq = qint(file_url, 'file_seq')
                if qint(file_url, 'seq') != seq:
                    raise CrawlError('목록 첨부파일 seq 불일치')
                listed_files.append({'file_seq': file_seq, 'original_name': name.text(), 'url': file_url})
        items.append({'seq': seq, 'title': title, 'url': link, 'is_notice': int(is_notice),
                      'list_number': number_text, 'list_date': date.text() if date else '',
                      'listed_files': listed_files})
    # 공지가 있으면 전체 건수에 공지가 포함되는지 불명확하므로 수량을 추정하지 않는다.
    # 일반 게시물만 있고 숫자 번호가 분명한 현재 템플릿에서만 누락을 검출한다.
    if not any(i['is_notice'] for i in items) and all(i['list_number'].replace(',', '').isdigit() for i in items):
        expected = min(10, total - 10 * (current - 1))
        if expected > 0 and len(items) < expected:
            raise CrawlError('목록의 일반 게시물 수가 예상보다 적음: %s < %s' %
                             (len(items), expected))
    return {'total': total, 'current': current, 'last': last, 'items': items}


def parse_detail(source, url, seq):
    root = tree(source)
    view = root.find(cls='bbs_view01')
    if not view:
        raise CrawlError('상세 페이지 구조(bbs_view01)를 찾지 못함')
    title, body, meta = view.find(cls='bv_title'), view.find(cls='bv_cont'), view.find(cls='bv_txt01')
    if not title or not title.text() or not body or not meta:
        raise CrawlError('상세 제목, 본문 또는 메타데이터 영역 누락')
    found_seq = re.search(r'\bbrd_seq\s*:\s*[\'\"](\d+)[\'\"]', source)
    if found_seq and int(found_seq.group(1)) != seq:
        raise CrawlError('상세 seq가 요청과 다름')
    metadata = {}
    for n in meta.walk():
        if n.tag == 'li':
            span = n.find(tag='span')
            if span:
                key, value = span.text(), n.text()
                if key:
                    metadata[key] = value[len(key):].strip() if value.startswith(key) else value
    satisfaction = view.find(cls='bbs_sat_header')
    if satisfaction:
        for p in (n for n in satisfaction.walk() if n.tag == 'p'):
            strong = p.find(tag='strong')
            if strong:
                key = strong.text()
                value = p.text()
                metadata[key] = value[len(key):].strip() if value.startswith(key) else value
            elif '전화' in p.text():
                metadata['전화'] = p.text().replace('전화', '', 1).strip()
    attachments = []
    box = view.find(cls='bv_file_box')
    if box:
        file_list = box.find(cls='bbs_file_view_list')
        if not file_list:
            raise CrawlError('첨부파일 영역의 목록을 찾지 못함')
        rows = [x for x in file_list.children if isinstance(x, Node) and x.tag == 'li']
        found = set()
        for row in rows:
            cont = row.find(cls='bbs_file_cont')
            if not cont:
                raise CrawlError('첨부파일 행 구조를 찾지 못함')
            name = cont.find(tag='strong')
            links = [n for n in cont.walk() if n.tag == 'a' and 'down.do' in (n.attrs.get('href') or '')]
            if not name or not name.text() or len(links) != 1:
                raise CrawlError('첨부파일명 또는 다운로드 링크 누락')
            link = urllib.parse.urljoin(url, links[0].attrs['href'])
            file_seq = qint(link, 'file_seq')
            if qint(link, 'seq') != seq or file_seq in found:
                raise CrawlError('첨부파일 seq 불일치 또는 중복')
            found.add(file_seq)
            attachments.append({'file_seq': file_seq, 'original_name': name.text(), 'url': link})
        # An empty file box with no rows may indicate a changed template.
        if not rows:
            raise CrawlError('첨부파일 영역은 있으나 파일 행이 없음')
    else:
        # A download link outside the expected box must not be silently ignored.
        if any(n.tag == 'a' and 'down.do' in (n.attrs.get('href') or '') for n in view.walk()):
            raise CrawlError('알 수 없는 위치에 첨부파일 링크가 있음')
    expected_ids = {a['file_seq'] for a in attachments}
    for n in view.walk():
        if n.tag == 'a' and 'down.do' in (n.attrs.get('href') or ''):
            linked = urllib.parse.urljoin(url, n.attrs['href'])
            if qint(linked, 'seq') != seq or qint(linked, 'file_seq') not in expected_ids:
                raise CrawlError('상세 첨부 목록 외에 별도의 다운로드 링크가 있음')
    return {'title': title.text(), 'body_html': body.inner_html(), 'body_text': body.text(),
            'published_date': metadata.get('등록일', ''), 'view_count': metadata.get('조회수', ''),
            'department': metadata.get('부서', ''), 'contact': metadata.get('담당자', ''),
            'phone': metadata.get('전화', ''), 'metadata': metadata, 'attachments': attachments}


def safe_filename(name):
    name = re.sub(r'[\x00-\x1f\x7f<>:"/\\|?*]', '_', name).strip(' .') or 'unnamed'
    if re.match(r'^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)', name, re.I):
        name = '_' + name
    stem, ext = os.path.splitext(name)
    # Limit UTF-8 bytes as well as Windows UTF-16 length; retain the extension where practical.
    if len(ext.encode('utf-8')) > 30:
        stem, ext = name, ''
    budget = 150 - len(ext.encode('utf-8'))
    while len(stem.encode('utf-8')) > budget:
        stem = stem[:-1]
    return (stem.rstrip(' .') or 'file') + ext


def native_path(path):
    p = os.path.abspath(str(path))
    if os.name == 'nt' and not p.startswith('\\\\?\\'):
        return '\\\\?\\UNC\\' + p[2:] if p.startswith('\\\\') else '\\\\?\\' + p
    return p


def digest(path):
    h = hashlib.sha256()
    with open(native_path(path), 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def is_allowed(url):
    p = urllib.parse.urlsplit(url)
    return p.scheme == 'https' and (p.hostname or '').lower() in ('mfds.go.kr', 'www.mfds.go.kr')


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not is_allowed(newurl):
            raise CrawlError('허용되지 않은 주소로 리디렉션: ' + newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Client:
    def __init__(self, timeout=30, retries=3, delay=0.5):
        self.timeout, self.retries, self.delay = timeout, retries, delay
        self.last_request = 0.0
        self.opener = urllib.request.build_opener(SafeRedirect())

    def open(self, url):
        if not is_allowed(url):
            raise CrawlError('허용되지 않은 URL: ' + url)
        wait = self.delay - (time.monotonic() - self.last_request)
        if wait > 0:
            time.sleep(wait)
        self.last_request = time.monotonic()
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; MFDS-press-archive/1.0)',
                    'Accept': '*/*', 'Cache-Control': 'no-cache', 'Referer': LIST_URL})
        r = self.opener.open(req, timeout=self.timeout)
        if r.status != 200 or not is_allowed(r.url):
            r.close()
            raise CrawlError('잘못된 HTTP 응답 또는 인증 리디렉션')
        if urllib.parse.urlsplit(r.url).path != urllib.parse.urlsplit(url).path:
            r.close()
            raise CrawlError('다른 페이지로 리디렉션됨: ' + r.url)
        return r

    def attempt(self, func):
        for i in range(self.retries + 1):
            try:
                return func()
            except (OSError, urllib.error.URLError, http.client.HTTPException, CrawlError, ValueError) as e:
                if isinstance(e, urllib.error.HTTPError) and e.code in (401, 403, 404, 410):
                    raise CrawlError('HTTP %s: %s' % (e.code, e.url)) from e
                if i >= self.retries:
                    raise CrawlError(str(e)) from e
                logging.warning('요청 실패, 재시도 %s/%s: %s', i + 1, self.retries, e)
                time.sleep(min(2 ** i, 8))

    def page(self, url):
        def run():
            with self.open(url) as r:
                b = r.read()
                length = r.headers.get('Content-Length')
                if length and len(b) != int(length):
                    raise CrawlError('HTML 응답 길이 불일치')
                charset = r.headers.get_content_charset() or 'utf-8'
                try:
                    return b.decode(charset, errors='strict')
                except (UnicodeError, LookupError):
                    try:
                        return b.decode('cp949', errors='strict')
                    except UnicodeError as e:
                        raise CrawlError('HTML 문자 인코딩 오류') from e
        return self.attempt(run)

    def download(self, url, target, original_name):
        directory = os.path.dirname(native_path(target))
        os.makedirs(directory, exist_ok=True)
        def run():
            tmp = None
            try:
                with self.open(url) as r:
                    content_type = r.headers.get_content_type().lower()
                    disposition = r.headers.get('Content-Disposition', '').lower()
                    expected = r.headers.get('Content-Length')
                    fd, tmp = tempfile.mkstemp(prefix='.mfds-', suffix='.part', dir=directory)
                    h, size, head = hashlib.sha256(), 0, b''
                    with os.fdopen(fd, 'wb') as f:
                        while True:
                            chunk = r.read(1024 * 128)
                            if not chunk:
                                break
                            if len(head) < 8192:
                                head += chunk[:8192 - len(head)]
                            f.write(chunk)
                            h.update(chunk)
                            size += len(chunk)
                        f.flush()
                        os.fsync(f.fileno())
                    if expected and size != int(expected):
                        raise CrawlError('첨부파일 길이 불일치: %s/%s' % (size, expected))
                    if not size:
                        raise CrawlError('빈 첨부파일 응답')
                    sample = head.lstrip(b'\xef\xbb\xbf\x00\t\r\n ').lower()
                    looks_html = content_type in ('text/html', 'application/xhtml+xml') or bool(
                        re.match(br'(?is)^(?:<!--.*?-->\s*)*(?:<!doctype\s+html|<html\b|<head\b|<body\b|<script\b|<title\b)', sample))
                    if looks_html:
                        html_file = original_name.lower().endswith(('.html', '.htm', '.xhtml'))
                        error_words = (b'login', b'log-in', b'error', b'access denied', b'forbidden',
                                       '로그인'.encode(), '접근이 거부'.encode(), '오류'.encode())
                        if not html_file or 'attachment' not in disposition or any(w in sample for w in error_words):
                            raise CrawlError('첨부 대신 HTML 오류/인증 페이지 응답')
                    os.replace(tmp, native_path(target))
                    tmp = None
                    return size, h.hexdigest(), content_type
            finally:
                if tmp and os.path.exists(tmp):
                    os.unlink(tmp)
        return self.attempt(run)


SCHEMA = '''
CREATE TABLE IF NOT EXISTS mfds_press_articles (
 seq INTEGER PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL,
 is_notice INTEGER NOT NULL DEFAULT 0, list_number TEXT, list_date TEXT,
 published_date TEXT, view_count TEXT, department TEXT, contact TEXT, phone TEXT,
 body_text TEXT, body_html TEXT, metadata_json TEXT,
 crawl_status TEXT NOT NULL, last_error TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mfds_press_attachments (
 seq INTEGER NOT NULL, file_seq INTEGER NOT NULL, original_name TEXT NOT NULL,
 url TEXT NOT NULL, saved_path TEXT, status TEXT NOT NULL, size_bytes INTEGER,
 sha256 TEXT, content_type TEXT, last_error TEXT, updated_at TEXT NOT NULL,
 PRIMARY KEY (seq, file_seq),
 FOREIGN KEY (seq) REFERENCES mfds_press_articles(seq)
);
'''


def now():
    return dt.datetime.now().astimezone().isoformat(timespec='seconds')


def initialize(db):
    db.execute('PRAGMA foreign_keys=ON')
    db.executescript(SCHEMA)
    # Fail early on a conflicting pre-existing table rather than modifying it.
    for table, columns in [('mfds_press_articles', ['seq', 'title', 'url', 'is_notice', 'list_number', 'list_date',
                      'published_date', 'view_count', 'department', 'contact', 'phone', 'body_text', 'body_html',
                      'metadata_json', 'crawl_status', 'last_error', 'updated_at']),
                     ('mfds_press_attachments', ['seq', 'file_seq', 'original_name', 'url', 'saved_path', 'status',
                      'size_bytes', 'sha256', 'content_type', 'last_error', 'updated_at'])]:
        actual = {r[1] for r in db.execute('PRAGMA table_info(%s)' % table)}
        if not set(columns).issubset(actual):
            raise CrawlError('기존 %s 테이블의 구조가 예상과 달라 중단합니다' % table)


def upsert_article(db, item, detail=None, error=None):
    if detail is None:
        # Existing complete article is retained in full; only its error history is updated.
        db.execute('''INSERT INTO mfds_press_articles(seq,title,url,is_notice,list_number,list_date,crawl_status,last_error,updated_at)
          VALUES(?,?,?,?,?,?,'failed',?,?) ON CONFLICT(seq) DO UPDATE SET
          last_error=excluded.last_error, updated_at=excluded.updated_at''',
          (item['seq'], item['title'], item['url'], item['is_notice'], item['list_number'], item['list_date'], str(error), now()))
    else:
        db.execute('''INSERT INTO mfds_press_articles(seq,title,url,is_notice,list_number,list_date,published_date,
          view_count,department,contact,phone,body_text,body_html,metadata_json,crawl_status,last_error,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'complete',NULL,?) ON CONFLICT(seq) DO UPDATE SET
          title=excluded.title,url=excluded.url,is_notice=excluded.is_notice,list_number=excluded.list_number,
          list_date=excluded.list_date,published_date=excluded.published_date,view_count=excluded.view_count,
          department=excluded.department,contact=excluded.contact,phone=excluded.phone,body_text=excluded.body_text,
          body_html=excluded.body_html,metadata_json=excluded.metadata_json,crawl_status='complete',last_error=NULL,
          updated_at=excluded.updated_at''', (item['seq'], detail['title'], item['url'], item['is_notice'],
          item['list_number'], item['list_date'], detail['published_date'], detail['view_count'], detail['department'],
          detail['contact'], detail['phone'], detail['body_text'], detail['body_html'],
          json.dumps(detail['metadata'], ensure_ascii=False), now()))
    db.commit()


def valid_existing(row):
    if not row or row['status'] != 'downloaded':
        return False
    try:
        return (bool(row['saved_path'] and row['sha256']) and
                os.path.getsize(native_path(row['saved_path'])) == row['size_bytes'] and
                digest(row['saved_path']) == row['sha256'])
    except OSError:
        return False


def save_attachment(db, client, seq, att, download_dir, redownload=False):
    row = db.execute('SELECT * FROM mfds_press_attachments WHERE seq=? AND file_seq=?', (seq, att['file_seq'])).fetchone()
    intact = valid_existing(row)
    same = intact and row['original_name'] == att['original_name'] and row['url'] == att['url']
    if same and not redownload:
        db.execute('UPDATE mfds_press_attachments SET last_error=NULL, updated_at=? WHERE seq=? AND file_seq=?',
                   (now(), seq, att['file_seq']))
        db.commit()
        logging.info('첨부 기존 파일 검증 완료 seq=%s file_seq=%s', seq, att['file_seq'])
        return True
    target = os.path.abspath(os.path.join(str(download_dir), '%s_%s_%s' % (seq, att['file_seq'], safe_filename(att['original_name']))))
    if os.path.exists(native_path(target)):
        # Never overwrite a previously saved file; even a later DB failure cannot damage it.
        target = os.path.abspath(os.path.join(str(download_dir), '%s_%s_%s_%s' %
                  (seq, att['file_seq'], uuid.uuid4().hex[:12], safe_filename(att['original_name']))))
    try:
        logging.info('첨부 다운로드 시작 seq=%s file_seq=%s %s', seq, att['file_seq'], att['original_name'])
        size, sha, ctype = client.download(att['url'], target, att['original_name'])
        db.execute('''INSERT INTO mfds_press_attachments(seq,file_seq,original_name,url,saved_path,status,size_bytes,sha256,content_type,last_error,updated_at)
           VALUES(?,?,?,?,?,'downloaded',?,?,?,NULL,?) ON CONFLICT(seq,file_seq) DO UPDATE SET
           original_name=excluded.original_name,url=excluded.url,saved_path=excluded.saved_path,status='downloaded',
           size_bytes=excluded.size_bytes,sha256=excluded.sha256,content_type=excluded.content_type,last_error=NULL,updated_at=excluded.updated_at''',
           (seq, att['file_seq'], att['original_name'], att['url'], target, size, sha, ctype, now()))
        db.commit()
        logging.info('첨부 다운로드 완료 seq=%s file_seq=%s bytes=%s', seq, att['file_seq'], size)
        return True
    except (OSError, CrawlError) as e:
        logging.error('첨부 실패 seq=%s file_seq=%s %s: %s', seq, att['file_seq'], att['original_name'], e)
        # Never replace stored successful metadata on an unsuccessful refresh, even if the local file disappeared.
        db.execute('''INSERT INTO mfds_press_attachments(seq,file_seq,original_name,url,saved_path,status,last_error,updated_at)
          VALUES(?,?,?,?,?,'failed',?,?) ON CONFLICT(seq,file_seq) DO UPDATE SET
          status=CASE WHEN mfds_press_attachments.status='downloaded' AND ? THEN 'downloaded' ELSE 'failed' END,
          last_error=excluded.last_error, updated_at=excluded.updated_at''',
          (seq, att['file_seq'], att['original_name'], att['url'], target, str(e), now(), int(intact)))
        db.commit()
        return False


def list_url(page):
    return LIST_URL + '?' + urllib.parse.urlencode({'page': page})


def crawl(db, client, start, end, download_dir, redownload=False):
    failures, done, seen_regular = 0, set(), set()
    first = parse_list(client.page(list_url(start)), list_url(start), start)
    if end is None:
        end = first['last']
    if end > first['last']:
        raise CrawlError('요청 마지막 페이지 %s가 현재 마지막 페이지 %s를 초과함' % (end, first['last']))
    logging.info('수집 범위 %s~%s, 현재 총 %s건 / %s페이지', start, end, first['total'], first['last'])
    for page_no in range(start, end + 1):
        try:
            page = first if page_no == start else parse_list(client.page(list_url(page_no)), list_url(page_no), page_no)
        except (CrawlError, OSError) as e:
            failures += 1
            logging.error('목록 페이지 %s 실패: %s', page_no, e)
            continue
        if page['total'] != first['total'] or page['last'] != first['last']:
            failures += 1
            logging.error('수집 중 전체 건수/페이지 수가 바뀜: 누락 가능, 전체 범위 재실행 필요 (%s/%s -> %s/%s)',
                          first['total'], first['last'], page['total'], page['last'])
        logging.info('페이지 %s: 게시물 %s개', page_no, len(page['items']))
        for item in page['items']:
            seq = item['seq']
            if seq in done:
                if not item['is_notice'] and seq in seen_regular:
                    failures += 1
                    logging.error('일반 게시물이 페이지 사이 중복됨(seq=%s): 정렬 변동으로 누락 가능', seq)
                continue
            done.add(seq)
            if not item['is_notice']:
                seen_regular.add(seq)
            try:
                detail = parse_detail(client.page(item['url']), item['url'], seq)
                upsert_article(db, item, detail)
            except (CrawlError, OSError) as e:
                failures += 1
                logging.error('상세 실패 seq=%s: %s', seq, e)
                upsert_article(db, item, error=e)
                for listed in item['listed_files']:
                    if not save_attachment(db, client, seq, listed, download_dir, redownload):
                        failures += 1
                continue
            detail_ids = {a['file_seq'] for a in detail['attachments']}
            for listed in item['listed_files']:
                if listed['file_seq'] not in detail_ids:
                    failures += 1
                    logging.error('상세에 없는 목록 첨부 seq=%s file_seq=%s: 목록 링크로 수집 시도',
                                  seq, listed['file_seq'])
                    detail['attachments'].append(listed)
                    detail_ids.add(listed['file_seq'])
            logging.info('게시물 seq=%s 첨부=%s %s', seq, len(detail['attachments']), detail['title'])
            for att in detail['attachments']:
                if not save_attachment(db, client, seq, att, download_dir, redownload):
                    failures += 1
    logging.info('완료: 게시물 %s개, 실패 %s건', len(done), failures)
    return failures


def parse_options(argv=None):
    p = argparse.ArgumentParser(description='식약처 보도자료 수집기')
    p.add_argument('pages', nargs='*', help='시작 [끝] 또는 all')
    p.add_argument('--from', dest='start', type=int, help='시작 페이지')
    p.add_argument('--to', dest='end', type=int, help='끝 페이지 (포함)')
    p.add_argument('--db', help='SQLite DB 경로')
    p.add_argument('--download-dir', help='첨부파일 저장 폴더')
    p.add_argument('--log-dir', help='로그 폴더')
    p.add_argument('--config', default=str(ROOT / 'config.ini'), help='설정 파일 (기본: 프로그램 루트 config.ini)')
    p.add_argument('--delay', type=float, help='요청 간 최소 대기 초')
    p.add_argument('--timeout', type=float, help='네트워크 시간 제한 초')
    p.add_argument('--retries', type=int, help='초기 시도 이후 추가 재시도 횟수')
    p.add_argument('--redownload', action='store_true', help='기존 성공 첨부파일도 다시 받기')
    a = p.parse_args(argv)
    config = configparser.ConfigParser(interpolation=None)
    if os.path.exists(a.config):
        try:
            with open(a.config, encoding='utf-8-sig') as f:
                config.read_file(f)
        except (OSError, configparser.Error) as e:
            p.error('config.ini 읽기 실패: ' + str(e))
    elif a.config != str(ROOT / 'config.ini'):
        p.error('지정한 config.ini가 없습니다: ' + a.config)
    c = config['crawler'] if config.has_section('crawler') else {}
    def get(key, fallback):
        return c.get(key, fallback)
    try:
        if a.pages and (a.start is not None or a.end is not None):
            p.error('위치 인수와 --from/--to는 함께 사용할 수 없습니다')
        if a.pages == ['all']:
            start, end = 1, None
        elif a.pages:
            if len(a.pages) > 2 or any(not x.isdigit() for x in a.pages):
                p.error('사용법: [시작 [끝] | all]')
            start = int(a.pages[0])
            end = int(a.pages[1]) if len(a.pages) == 2 else start
        elif a.start is not None or a.end is not None:
            if a.start is None:
                p.error('--to에는 --from이 필요합니다')
            start, end = a.start, a.end if a.end is not None else a.start
        else:
            start = int(get('start_page', get('from_page', '1')))
            end = int(get('end_page', get('to_page', str(start))))
        a.db = a.db or get('db', DEFAULT_DB)
        a.download_dir = a.download_dir or get('download_dir', DEFAULT_DOWNLOAD)
        a.log_dir = a.log_dir or get('log_dir', str(ROOT / 'logs'))
        a.delay = a.delay if a.delay is not None else float(get('delay', '0.5'))
        a.timeout = a.timeout if a.timeout is not None else float(get('timeout', '30'))
        a.retries = a.retries if a.retries is not None else int(get('retries', '3'))
    except ValueError as e:
        p.error('설정값 오류: ' + str(e))
    if start < 1 or (end is not None and end < start):
        p.error('페이지는 1 이상이고 끝 페이지는 시작 페이지 이상이어야 합니다')
    if not (0 <= a.delay <= 3600 and 0 < a.timeout <= 3600 and 0 <= a.retries <= 20):
        p.error('delay, timeout 또는 retries 범위가 올바르지 않습니다')
    if os.name != 'nt' and (a.db == DEFAULT_DB or a.download_dir == DEFAULT_DOWNLOAD):
        p.error('Windows가 아닌 환경에서는 --db와 --download-dir을 지정하세요')
    a.start, a.end = start, end
    return a


def configure_logging(directory):
    os.makedirs(native_path(directory), exist_ok=True)
    path = os.path.join(native_path(directory), dt.date.today().isoformat() + '.log')
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s',
                        handlers=[logging.FileHandler(path, encoding='utf-8'), logging.StreamHandler()])


def main(argv=None):
    a = parse_options(argv)
    try:
        configure_logging(a.log_dir)
        if a.db == DEFAULT_DB and not os.path.isfile(native_path(a.db)):
            raise CrawlError('기본 SQLite DB가 없습니다. 기존 DB 경로를 확인하세요: ' + a.db)
        if not os.path.isdir(os.path.dirname(native_path(a.db))):
            raise CrawlError('DB 상위 폴더가 없습니다: ' + a.db)
        with contextlib.closing(sqlite3.connect(native_path(a.db), timeout=30)) as db:
            db.row_factory = sqlite3.Row
            with db:
                initialize(db)
                result = crawl(db, Client(a.timeout, a.retries, a.delay), a.start, a.end, a.download_dir, a.redownload)
        return 1 if result else 0
    except (CrawlError, sqlite3.Error, OSError, ValueError) as e:
        logging.error('수집 중단: %s', e, exc_info=True)
        return 1
    except KeyboardInterrupt:
        logging.error('사용자에 의해 중단됨')
        return 130


if __name__ == '__main__':
    sys.exit(main())
