#!/usr/bin/env python3
"""관세법령정보포털 새소식 / 행정예고 크롤러 V1.3. Python 3.10+."""
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
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

VERSION = '1.3'
SCHEMA_VERSION = '1.0'  # Execution packaging changed; existing DB schema stays compatible.
ROOT = Path(__file__).resolve().parent
BASE = 'https://unipass.customs.go.kr/clip'
LIST_URL = BASE + '/convcfnct/admnrulmkplpnot/retrieveAdmnRulMkplPnotLst.do'
DETAIL_URL = BASE + '/convcfnct/admnrulmkplpnot/openULS0502002Q.do'
DOWNLOAD_URL = BASE + '/framework/filedownload/kcs4gDownload.do'
DEFAULTS = {
    'db_path': r'D:\SQLiteDB\smart_law_ai.db',
    'download_root': r'C:\SQLiteDB\downloads',
    'category': '행정예고', 'page_size': 100, 'pages': '', 'delay_seconds': 0.5,
    'timeout_seconds': 60, 'retry_count': 3, 'backup_before_run': True,
    'log_dir': 'logs',
}
TABLES = ['clip_admin_notices', 'clip_admin_attachments', 'clip_admin_crawl_runs',
          'clip_admin_crawl_state', 'clip_admin_crawl_errors']
LOG = logging.getLogger('clip_admin')


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def hash_json(obj):
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True,
                                    separators=(',', ':')).encode('utf-8')).hexdigest()


def parse_pages(value):
    """빈 문자열은 전체. 1,3,5-7 형식은 중복 제거 후 오름차순 페이지 목록."""
    if not isinstance(value, str):
        raise ValueError('pages는 문자열이어야 합니다. 예: "1,3,5-7" 또는 ""')
    value = value.strip()
    if not value:
        return None
    selected = set()
    for token in value.split(','):
        token = token.strip()
        match = re.fullmatch(r'([0-9]+)(?:\s*-\s*([0-9]+))?', token)
        if match is None:
            raise ValueError('페이지 형식 오류: 1,3,5-7처럼 입력하세요.')
        start = int(match.group(1))
        end = int(match.group(2) or start)
        if start < 1 or end < start or end > 100000:
            raise ValueError('페이지는 1~100000의 정수이며 범위 끝은 시작 이상이어야 합니다.')
        selected.update(range(start, end + 1))
    return sorted(selected)


def safe_name(value, max_length=90):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', str(value)).strip(' .')
    if not name:
        name = 'unnamed'
    if name.split('.')[0].upper() in {'CON', 'PRN', 'AUX', 'NUL'} or re.match(
            r'^(COM|LPT)[1-9](\.|$)', name, re.I):
        name = '_' + name
    if len(name) > max_length:
        ext = Path(name).suffix[:15]
        name = name[:max_length-len(ext)] + ext
    return name


def metadata(row, departments):
    notice_id = str(row.get('jdafCgePbanMtNo') or '').strip()
    title = str(row.get('jdafCgePbanTtle') or '').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]+', notice_id) or not title:
        raise ValueError('목록 게시글 식별자 또는 제목이 누락/비정상입니다.')
    raw_date = str(row.get('makeDt') or '').replace('-', '')
    written = ''
    if raw_date:
        written = datetime.strptime(raw_date, '%Y%m%d').date().isoformat()
    dept = str(row.get('makeDvsnCd') or '')
    # 게시일/유형/제정/폐지 여부로 필터링하지 않습니다.
    return {
        'notice_id': notice_id, 'title': title,
        'department_code': dept, 'department_name': departments.get(dept, ''),
        'written_date': written, 'publication_year': str(row.get('pbanYy') or ''),
        'publication_number': str(row.get('pbanNo') or ''),
        'notice_type_code': str(row.get('jdafCgePbanTpcd') or ''),
        'source_url': DETAIL_URL + '?jdafCgePbanMtNo=' + quote(notice_id),
    }


def parse_detail(html, notice_id):
    soup = BeautifulSoup(html, 'html.parser')
    layer = soup.select_one('#admnRulMkplPnotLayer')
    if layer is None:
        raise ValueError('상세 화면 식별자가 없습니다. 사이트 변경/오류 응답을 확인하세요.')
    hidden = layer.select_one('input[name="jdafCgePbanMtNo"]')
    if hidden is None or hidden.get('value') != notice_id:
        raise ValueError('요청한 게시글과 상세 응답의 식별자가 다릅니다.')
    table = layer.select_one('#ULS2102006Q_table01')
    if table is None:
        raise ValueError('상세 본문 테이블을 찾지 못했습니다.')
    fields = {}
    for tr in table.select(':scope > tbody > tr'):
        th = tr.find('th', recursive=False)
        td = tr.find('td', recursive=False)
        if th is not None and td is not None:
            fields[th.get_text(strip=True)] = td
    if '제목' not in fields or '내용' not in fields:
        raise ValueError('상세 제목/내용 항목을 찾지 못했습니다.')
    title = fields['제목'].get_text(' ', strip=True)
    if not title:
        raise ValueError('상세 제목이 비어 있습니다.')
    content = fields['내용']
    body_html = content.decode_contents().strip()
    # inline span 분리로 단어가 끊기지 않도록 블록/행에서만 줄바꿈을 넣습니다.
    text_soup = BeautifulSoup(body_html, 'html.parser')
    for tag in text_soup(['script', 'style']):
        tag.decompose()
    for br in text_soup.find_all('br'):
        br.replace_with('\n')
    for cell in text_soup.find_all(['td', 'th']):
        cell.append('\t')
    for block in text_soup.find_all(['p', 'div', 'tr', 'li']):
        block.append('\n')
    body_text = '\n'.join(line.strip() for line in text_soup.get_text().replace(
        '\xa0', ' ').splitlines() if line.strip())
    files, seen = [], set()
    area = fields.get('첨부파일')
    if area is not None:
        for button in area.select('[data-attchfileid]'):
            fid = str(button.get('data-attchfileid') or '').strip()
            name = button.get_text(' ', strip=True)
            if not fid or not name:
                raise ValueError('첨부파일 식별자/이름이 비어 있습니다.')
            if fid in seen:
                continue
            seen.add(fid)
            files.append({'file_id': fid, 'original_name': name,
                          'download_url': DOWNLOAD_URL + '?attchFileId=' + quote(fid)})
        if not files and area.get_text(strip=True) not in ('', '없음', '첨부파일 없음', '-'):
            raise ValueError('첨부파일 표시가 있으나 다운로드 식별자를 찾지 못했습니다.')
    content_hash = hash_json({'title': title, 'html': body_html, 'files': files})
    return title, body_html, body_text, files, content_hash


class Client:
    def __init__(self, config):
        self.delay = float(config['delay_seconds'])
        self.timeout = (15, int(config['timeout_seconds']))
        self.last_request = 0.0
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'CustomsAdministrativeNoticeCrawler/1.3 (Python requests)',
            'Referer': BASE + '/index.do', 'Accept-Language': 'ko-KR,ko;q=0.9',
            'isAjax': 'true', 'X-Requested-With': 'XMLHttpRequest',
        })
        retries = Retry(total=int(config['retry_count']), backoff_factor=1.0,
                        status_forcelist=[429, 500, 502, 503, 504],
                        allowed_methods=['GET', 'POST'], respect_retry_after_header=True)
        self.session.mount('https://', HTTPAdapter(max_retries=retries))

    def request(self, method, url, **kwargs):
        host = urlparse(url).hostname
        if host != 'unipass.customs.go.kr':
            raise ValueError('공식 관세법령정보포털 외 URL은 허용되지 않습니다.')
        wait = self.delay - (time.monotonic() - self.last_request)
        if wait > 0:
            time.sleep(wait)
        self.last_request = time.monotonic()
        response = self.session.request(method, url, timeout=self.timeout, **kwargs)
        try:
            response.raise_for_status()
            if urlparse(response.url).hostname != host:
                raise ValueError('공식 호스트 밖으로 리다이렉트되었습니다.')
        except Exception:
            response.close()
            raise
        return response

    def departments(self):
        with self.request('POST', BASE + '/com/bsopcomn/baseinfo/retrieveCdBnchResult.do',
                          data={'cdLst': 'DVSN_CD'}) as response:
            rows = response.json()['resultList']
        if not rows:
            raise ValueError('부서 코드 목록이 비어 있습니다.')
        return {str(r['val']): str(r['valNm']) for r in rows if r.get('label') == 'DVSN_CD'}

    def list_page(self, page, page_size):
        with self.request('POST', LIST_URL, data={
            'pageIndex': page, 'pageUnit': page_size, 'orderColumns': 'MAKE_DT DESC',
            'pbanCstmSgn': '', 'jdafCgePbanTtle': '',
        }) as response:
            result = response.json()
        rows = result.get('rAdmnRulMkplPnotLst')
        info = result.get('paginationInfo', {})
        if not isinstance(rows, list) or 'totalRecordCount' not in info:
            raise ValueError('목록 API 응답 구조가 변경되었거나 오류 응답입니다.')
        if int(info.get('currentPageNo', 0)) != page:
            raise ValueError('요청 페이지와 응답 페이지가 다릅니다.')
        return rows, info

    def detail(self, notice_id):
        with self.request('GET', DETAIL_URL, params={'jdafCgePbanMtNo': notice_id}) as response:
            response.encoding = 'utf-8'
            return parse_detail(response.text, notice_id)

    def download(self, item, target):
        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_name(target.name + '.part')
        try:
            with self.request('GET', item['download_url'], stream=True) as response:
                ctype = response.headers.get('Content-Type', '')
                disposition = response.headers.get('Content-Disposition', '')
                if 'html' in ctype.lower() or 'json' in ctype.lower():
                    raise ValueError('첨부파일 대신 HTML/JSON 오류 응답이 반환되었습니다.')
                if 'attachment' not in disposition.lower():
                    raise ValueError('다운로드 응답에 attachment 헤더가 없습니다.')
                digest, size, prefix = hashlib.sha256(), 0, b''
                with partial.open('wb') as output:
                    for chunk in response.iter_content(65536):
                        if not chunk:
                            continue
                        if not prefix:
                            prefix = chunk[:512].lstrip().lower()
                            if prefix.startswith((b'<!doctype html', b'<html', b'<script')):
                                raise ValueError('첨부파일 내용이 HTML 오류 페이지입니다.')
                        size += len(chunk)
                        digest.update(chunk)
                        output.write(chunk)
                if not size:
                    raise ValueError('빈 첨부파일입니다.')
                expected = response.headers.get('Content-Length')
                if expected and not response.headers.get('Content-Encoding') and int(expected) != size:
                    raise ValueError('첨부파일 실제 크기와 응답 크기가 다릅니다.')
                os.replace(partial, target)
                return size, digest.hexdigest(), ctype
        finally:
            partial.unlink(missing_ok=True)

    def close(self):
        self.session.close()


@contextmanager
def database_lock(path):
    """프로그램 중복 실행 방지. OS 잠금은 비정상 종료 때도 자동 해제됩니다."""
    lock_path = Path(str(path) + '.clip_admin.lock')
    handle = lock_path.open('a+b')
    handle.seek(0, os.SEEK_END)
    if handle.tell() == 0:
        handle.write(b'0')
        handle.flush()
    handle.seek(0)
    acquired = False
    try:
        if os.name == 'nt':
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        acquired = True
        yield
    except (BlockingIOError, PermissionError) as exc:
        if not acquired:
            raise RuntimeError('같은 DB를 대상으로 크롤러가 이미 실행 중이거나 잠금 권한이 없습니다.') from exc
        raise
    finally:
        if acquired:
            handle.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def initialize(db, schema):
    """동명 테이블/인덱스 충돌이 있으면 기존 객체를 변경하지 않고 중단합니다."""
    reference = sqlite3.connect(':memory:')
    reference.executescript(schema)
    expected = reference.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name LIKE 'clip_admin_%'"
    ).fetchall()
    for kind, name, owner, ddl in expected:
        actual = db.execute('SELECT type,tbl_name,sql FROM sqlite_master WHERE name=?', (name,)).fetchone()
        if actual:
            norm = lambda s: re.sub(r'\s+', '', (s or '').replace('IF NOT EXISTS', '')).lower()
            if actual[0] != kind or actual[1] != owner or norm(actual[2]) != norm(ddl):
                raise RuntimeError(f'기존 객체 {name}의 정의가 V1.0과 다릅니다. 기존 DB를 변경하지 않습니다.')
    reference.close()
    db.executescript(schema)
    db.commit()


def backup_database(db, db_path):
    folder = db_path.parent / 'backups'
    folder.mkdir(parents=True, exist_ok=True)
    name = db_path.stem + '_clip_admin_' + datetime.now().strftime('%Y%m%d_%H%M%S_%f') + '.db'
    target = folder / name
    with sqlite3.connect(target) as destination:
        db.backup(destination)
    return str(target.resolve())


class Crawler:
    def __init__(self, db, client, config, run_id):
        self.db, self.client, self.config, self.run_id = db, client, config, run_id
        self.root = Path(config['download_root']).expanduser().resolve()
        self.category = safe_name(config['category'])
        self.stats = {k: 0 for k in ['total_on_site', 'list_pages', 'seen_count', 'new_count',
                                    'updated_count', 'skipped_count', 'downloaded_count', 'error_count']}

    def error(self, stage, exc, notice_id=None, file_id=None):
        message = str(exc)[:4000]
        LOG.error('%s notice=%s file=%s: %s', stage, notice_id, file_id, message)
        self.db.execute('''INSERT INTO clip_admin_crawl_errors
            (run_id,notice_id,file_id,stage,error_message,occurred_at) VALUES (?,?,?,?,?,?)''',
                        (self.run_id, notice_id, file_id, stage, message, now()))
        self.db.commit()
        self.stats['error_count'] += 1

    def update_progress(self):
        keys = list(self.stats)
        self.db.execute('UPDATE clip_admin_crawl_runs SET ' + ','.join(k+'=?' for k in keys)
                        + ' WHERE run_id=?', [self.stats[k] for k in keys] + [self.run_id])
        self.db.commit()

    def save_detail(self, meta, raw_row, old):
        nid, stamp = meta['notice_id'], now()
        if old is None:
            keys = list(meta)
            self.db.execute('INSERT INTO clip_admin_notices (' + ','.join(keys) +
                            ',first_crawled_at,last_crawled_at,last_seen_at) VALUES (' +
                            ','.join('?' for _ in range(len(keys)+3)) + ')',
                            list(meta.values()) + [stamp, stamp, stamp])
            self.db.commit()
        try:
            title, html, text, files, digest = self.client.detail(nid)
            stored_meta = dict(meta, title=title)
            keys = list(stored_meta)
            self.db.execute('UPDATE clip_admin_notices SET ' + ','.join(k+'=?' for k in keys) +
                            ''',content_html=?,content_text=?,list_hash=?,content_hash=?,raw_list_json=?,
                            detail_status='ok',last_crawled_at=?,last_seen_at=? WHERE notice_id=?''',
                            list(stored_meta.values()) + [html, text, hash_json(meta), digest,
                            json.dumps(raw_row, ensure_ascii=False), stamp, stamp, nid])
            self.db.execute('UPDATE clip_admin_attachments SET is_current=0 WHERE notice_id=?', (nid,))
            for item in files:
                self.db.execute('''INSERT INTO clip_admin_attachments
                    (notice_id,file_id,original_name,download_url,last_seen_at) VALUES (?,?,?,?,?)
                    ON CONFLICT(notice_id,file_id) DO UPDATE SET original_name=excluded.original_name,
                    download_url=excluded.download_url,last_seen_at=excluded.last_seen_at,is_current=1''',
                    (nid, item['file_id'], item['original_name'], item['download_url'], stamp))
            self.db.commit()
            if old is None:
                self.stats['new_count'] += 1
            elif old['content_hash'] != digest or old['list_hash'] != hash_json(meta):
                self.stats['updated_count'] += 1
            else:
                self.stats['skipped_count'] += 1
            self.download_notice(nid)
        except Exception as exc:
            self.db.rollback()
            self.db.execute("UPDATE clip_admin_notices SET detail_status='failed' WHERE notice_id=?", (nid,))
            self.db.commit()
            self.error('detail', exc, nid)

    def download_notice(self, nid):
        rows = self.db.execute('''SELECT * FROM clip_admin_attachments
                                 WHERE notice_id=? AND is_current=1''', (nid,)).fetchall()
        for row in rows:
            # 성공 파일은 크기도 확인합니다. SHA256 재검증은 --verify-files에서 수행합니다.
            old_path = Path(row['local_path']) if row['local_path'] else None
            if row['download_status'] == 'ok' and old_path and old_path.is_file() and \
                    old_path.stat().st_size == row['file_size']:
                continue
            relative = Path(self.category) / safe_name(nid) / (
                safe_name(row['file_id'], 45) + '_' + safe_name(row['original_name']))
            target = self.root / relative
            try:
                size, sha, ctype = self.client.download(dict(row), target)
                self.db.execute('''UPDATE clip_admin_attachments SET local_path=?,relative_path=?,
                    file_size=?,sha256=?,content_type=?,download_status='ok',downloaded_at=?,
                    error_message='' WHERE attachment_pk=?''',
                    (str(target), relative.as_posix(), size, sha, ctype, now(), row['attachment_pk']))
                self.db.commit()
                self.stats['downloaded_count'] += 1
                LOG.info('Downloaded %s (%d bytes)', target.name, size)
            except Exception as exc:
                self.db.execute('''UPDATE clip_admin_attachments SET download_status='failed',
                    error_message=? WHERE attachment_pk=?''', (str(exc)[:4000], row['attachment_pk']))
                self.db.commit()
                self.error('attachment', exc, nid, row['file_id'])

    def run(self, mode='auto', max_notices=None, pages=None, verify=False):
        if pages is not None and (not pages or any(type(p) is not int or p < 1 for p in pages)):
            raise ValueError('선택 페이지가 비어 있거나 올바른 양의 정수가 아닙니다.')
        LOG.info('Loading department codes...')
        departments = self.client.departments()
        page_size = int(self.config['page_size'])
        # 1페이지는 전체 건수/끝 페이지 확인용. 선택 범위에 없으면 게시글은 처리하지 않습니다.
        LOG.info('Requesting list page 1 (scope metadata), page_size=%d...', page_size)
        first_rows, first_info = self.client.list_page(1, page_size)
        self.stats['list_pages'] += 1
        total = int(first_info['totalRecordCount'])
        last_page = int(first_info['totalPageCount'])
        self.stats['total_on_site'] = total
        if last_page != (total + page_size - 1) // page_size:
            raise ValueError('페이지당 건수와 사이트 전체 페이지 수가 일치하지 않습니다.')
        if pages is not None:
            selected_pages = sorted(set(pages))
            invalid = [p for p in selected_pages if p > last_page]
            if invalid:
                raise ValueError(f'존재하지 않는 페이지: {invalid}. page_size={page_size}, 마지막 페이지={last_page}')
        else:
            selected_pages = range(1, max(1, last_page) + 1)
        LOG.info('Scope: pages=%s, page_size=%d, total=%d, last_page=%d',
                 selected_pages if pages is not None else 'ALL', page_size, total, last_page)
        seen, candidates, expected_selected = set(), [], 0
        for page in selected_pages:
            if page == 1:
                rows, info = first_rows, first_info
            else:
                LOG.info('Requesting list page %d/%d...', page, last_page)
                rows, info = self.client.list_page(page, page_size)
                self.stats['list_pages'] += 1
            if int(info['totalRecordCount']) != total or int(info['totalPageCount']) != last_page:
                raise ValueError('수집 도중 전체 건수/페이지 수가 변경되었습니다. 재실행하세요.')
            expected_rows = min(page_size, max(0, total - (page - 1) * page_size))
            if len(rows) != expected_rows:
                raise ValueError(f'페이지 {page} 건수 검증 실패: 기대={expected_rows}, 응답={len(rows)}')
            expected_selected += expected_rows
            for raw in rows:
                meta = metadata(raw, departments)
                nid = meta['notice_id']
                if nid in seen:
                    raise ValueError('페이지 간 중복 게시글이 발견되었습니다. 목록 이동/정렬을 확인 후 재실행하세요.')
                seen.add(nid)
                old = self.db.execute('SELECT * FROM clip_admin_notices WHERE notice_id=?', (nid,)).fetchone()
                self.stats['seen_count'] += 1
                if mode == 'full' or old is None or old['detail_status'] != 'ok' or old['list_hash'] != hash_json(meta):
                    candidates.append((meta, raw, old))
                else:
                    self.stats['skipped_count'] += 1
                    self.db.execute('UPDATE clip_admin_notices SET last_seen_at=? WHERE notice_id=?', (now(), nid))
            self.update_progress()
            LOG.info('List page %d/%d: seen=%d, candidates=%d', page, last_page, len(seen), len(candidates))
        if len(seen) != expected_selected or (pages is None and len(seen) != total):
            raise ValueError(f'목록 건수 검증 실패: 범위 기대={expected_selected}, 수집={len(seen)}')
        # 선택 페이지 모드의 해시 검사/첨부 복구도 선택 게시글로 제한합니다.
        if verify:
            verify_files(self.db, seen if pages is not None else None)
        limited = max_notices is not None and len(candidates) > max_notices
        chosen = candidates[:max_notices] if max_notices is not None else candidates
        for index, (meta, raw, old) in enumerate(chosen, 1):
            LOG.info('Detail %d/%d: %s %s', index, len(chosen), meta['notice_id'], meta['title'])
            self.save_detail(meta, raw, old)
            self.update_progress()
        # 선택 밖의 기존 파일은 다운로드하지 않습니다. 전체 모드는 기존 복구 정책을 유지합니다.
        if not limited:
            retry_ids = self.db.execute('''SELECT DISTINCT notice_id FROM clip_admin_attachments
                WHERE is_current=1 AND notice_id IN (SELECT notice_id FROM clip_admin_notices WHERE detail_status='ok')''').fetchall()
            processed = {meta['notice_id'] for meta, _, _ in chosen}
            for row in retry_ids:
                nid = row['notice_id']
                if nid not in processed and (pages is None or nid in seen):
                    self.download_notice(nid)
        self.update_progress()
        return limited



def verify_files(db, notice_ids=None):
    failures = 0
    for row in db.execute("SELECT * FROM clip_admin_attachments WHERE is_current=1 AND download_status='ok'").fetchall():
        if notice_ids is not None and row['notice_id'] not in notice_ids:
            continue
        path = Path(row['local_path'])
        digest = hashlib.sha256()
        good = path.is_file()
        if good:
            with path.open('rb') as stream:
                for chunk in iter(lambda: stream.read(65536), b''):
                    digest.update(chunk)
            good = path.stat().st_size == row['file_size'] and digest.hexdigest() == row['sha256']
        if not good:
            failures += 1
            db.execute("UPDATE clip_admin_attachments SET download_status='pending',error_message=? WHERE attachment_pk=?",
                       ('파일 누락 또는 해시 불일치: 다음 수집에서 재다운로드', row['attachment_pk']))
    db.commit()
    LOG.info('File verification: %d missing/corrupt files marked for retry', failures)
    return failures


def load_config(args):
    config = DEFAULTS.copy()
    path = Path(args.config)
    if path.is_file():
        loaded = json.loads(path.read_text(encoding='utf-8-sig'))
        unknown = set(loaded) - set(DEFAULTS)
        if unknown:
            raise ValueError('알 수 없는 설정 키: ' + ', '.join(sorted(unknown)))
        config.update(loaded)
    elif args.config != str(ROOT / 'config.json'):
        raise FileNotFoundError(f'설정 파일 없음: {path}')
    for field in ('db_path', 'download_root'):
        override = getattr(args, field)
        if override:
            config[field] = override
        if os.name != 'nt' and re.match(r'^[A-Za-z]:[\\/]', config[field]):
            raise ValueError(f'비 Windows 환경에서는 --{field.replace("_", "-")}로 실제 경로를 지정하세요.')
    # Page selection is parameter-only; omitted --pages always means ALL.
    config['pages'] = args.pages if args.pages is not None else ''
    if args.page_size is not None:
        config['page_size'] = args.page_size
    parse_pages(config['pages'])
    if int(config['page_size']) not in (10, 20, 30, 50, 100):
        raise ValueError('page_size는 10/20/30/50/100 중 하나여야 합니다.')
    if float(config['delay_seconds']) < 0 or int(config['timeout_seconds']) < 1 or int(config['retry_count']) < 0:
        raise ValueError('요청 지연/타임아웃/재시도 설정이 잘못되었습니다.')
    if not isinstance(config['backup_before_run'], bool):
        raise ValueError('backup_before_run은 true/false여야 합니다.')
    return config


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', action='version', version='V' + VERSION)
    parser.add_argument('--config', default=str(ROOT / 'config.json'))
    parser.add_argument('--db-path')
    parser.add_argument('--download-root')
    parser.add_argument('--pages', help='선택 페이지: 1 또는 1,3,5-7. 미지정/빈 문자열이면 전체')
    parser.add_argument('--page-size', type=int, choices=[10,20,30,50,100], help='페이지당 건수. 미지정이면 config.json 값')
    parser.add_argument('--full', action='store_true', help='기존 게시글 본문까지 모두 재확인')
    parser.add_argument('--max-notices', type=int, help='시험용 상세 수집 제한. 전체 완료로 기록하지 않음')
    parser.add_argument('--verify-files', action='store_true', help='수집 전 저장 파일 SHA256 검증')
    args = parser.parse_args(argv)
    if args.max_notices is not None and args.max_notices < 1:
        parser.error('--max-notices는 1 이상이어야 합니다.')
    try:
        config = load_config(args)
        pages = parse_pages(config['pages'])
        log_dir = Path(config['log_dir'])
        if not log_dir.is_absolute():
            log_dir = ROOT / log_dir
        log_dir.mkdir(parents=True, exist_ok=True)
        logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s',
                            handlers=[logging.StreamHandler(), logging.FileHandler(
                                log_dir / ('crawl_' + datetime.now().strftime('%Y%m%d_%H%M%S') + '.log'), encoding='utf-8')])
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8')
        db_path = Path(config['db_path']).expanduser().resolve()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        existed = db_path.is_file() and db_path.stat().st_size > 0
        LOG.info('Preparing database: %s', db_path)
        with database_lock(db_path):
            db = sqlite3.connect(db_path, timeout=30)
            db.row_factory = sqlite3.Row
            client = None
            try:
                db.execute('PRAGMA foreign_keys=ON')
                if existed and config['backup_before_run']:
                    LOG.info('Backing up existing DB before crawl... Large DBs may take time.')
                backup = backup_database(db, db_path) if existed and config['backup_before_run'] else ''
                if backup:
                    LOG.info('Existing DB backup: %s', backup)
                initialize(db, (ROOT / 'schema.sql').read_text(encoding='utf-8'))
                db.execute('''INSERT INTO clip_admin_crawl_state VALUES ('schema_version',?,?)
                    ON CONFLICT(state_key) DO UPDATE SET state_value=excluded.state_value,updated_at=excluded.updated_at''', (SCHEMA_VERSION, now()))
                complete = db.execute("SELECT state_value FROM clip_admin_crawl_state WHERE state_key='initial_complete'").fetchone()
                effective = 'full' if args.full else ('incremental' if complete and complete[0] == '1' else 'initial')
                if pages is not None:
                    effective = 'selected_full' if args.full else 'selected'
                requested = 'full' if args.full else 'auto'
                cursor = db.execute('''INSERT INTO clip_admin_crawl_runs
                    (started_at,requested_mode,effective_mode,status,backup_path) VALUES (?,?,?,?,?)''',
                    (now(), requested, effective, 'running', backup))
                run_id = cursor.lastrowid
                db.commit()
                client = Client(config)
                worker = Crawler(db, client, config, run_id)
                try:
                    LOG.info('Crawler V%s mode=%s db=%s', VERSION, effective, db_path)
                    limited = worker.run('full' if args.full else 'auto', args.max_notices, pages, args.verify_files)
                    status = 'partial' if limited else ('completed_with_errors' if worker.stats['error_count'] else 'completed')
                    if status == 'completed' and pages is None:
                        for key, value in [('initial_complete', '1'), ('last_success_at', now())]:
                            db.execute('''INSERT INTO clip_admin_crawl_state VALUES (?,?,?)
                                ON CONFLICT(state_key) DO UPDATE SET state_value=excluded.state_value,updated_at=excluded.updated_at''', (key, value, now()))
                    message = json.dumps({'pages': pages if pages is not None else 'ALL',
                                          'page_size': int(config['page_size']), 'test_limit_applied': limited},
                                         ensure_ascii=False)
                    db.execute('UPDATE clip_admin_crawl_runs SET finished_at=?,status=?,message=? WHERE run_id=?',
                               (now(), status, message, run_id))
                    db.commit()
                    LOG.info('Result: %s %s', status, json.dumps(worker.stats, ensure_ascii=False))
                    return 0 if status == 'completed' else 2
                except (Exception, KeyboardInterrupt) as exc:
                    worker.error('run', exc if str(exc) else RuntimeError('사용자 중단'))
                    worker.update_progress()
                    db.execute('UPDATE clip_admin_crawl_runs SET finished_at=?,status=?,message=? WHERE run_id=?',
                               (now(), 'interrupted' if isinstance(exc, KeyboardInterrupt) else 'failed', str(exc), run_id))
                    db.commit()
                    LOG.exception('Run stopped; rerun to resume safely.')
                    return 130 if isinstance(exc, KeyboardInterrupt) else 1
            finally:
                if client:
                    client.close()
                db.close()
    except Exception as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
