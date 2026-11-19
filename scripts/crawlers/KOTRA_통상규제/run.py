#!/usr/bin/env python3
"""KOTRA trade-regulation news crawler. Python 3.9+, no virtualenv required."""
from __future__ import annotations

import argparse
import configparser
import datetime as dt
import hashlib
import html as html_lib
import json
import logging
import math
import os
from pathlib import Path
import re
import sys
import time
from urllib.parse import urlencode, urlsplit

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError as exc:
    print('Missing packages. Run: python -m pip install --user -r requirements.txt', file=sys.stderr)
    raise SystemExit(1) from exc

from kotra_parser import parse_detail
from storage import init_db, save_article, save_attachment

BASE = 'https://dream.kotra.or.kr'
LIST_URL = BASE + '/ajaxf/frNews/getKotraBoardList.do'
DETAIL_URL = BASE + '/kotranews/cms/news/actionKotraBoardDetail.do'
REFERER = BASE + '/kotranews/cms/com/index.do?MENU_ID=90'
HERE = Path(__file__).resolve().parent
LOG = logging.getLogger('kotra')
DEFAULTS = {
    'db': r'D:\SQLiteDB\smart_law_ai.db',
    'downloads': r'C:\SQLiteDB\downloads\KOTRA\통상규제',
    'log_dir': 'logs', 'start_page': '1', 'end_page': '1',
    'page_size': '10', 'delay_seconds': '0.5', 'timeout_seconds': '45', 'retries': '3',
}


def winfs(path: str | Path) -> str:
    """Return an extended-length absolute Windows path, avoiding MAX_PATH failures."""
    p = os.path.abspath(os.fspath(path))
    if os.name == 'nt' and not p.startswith('\\\\?\\'):
        if p.startswith('\\\\'):
            return '\\\\?\\UNC\\' + p[2:]
        return '\\\\?\\' + p
    return p


def resolve_path(value: str) -> str:
    if os.name != 'nt' and re.match(r'^[A-Za-z]:[\\/]', value):
        raise ValueError('Windows default path cannot be used on this OS; supply --db and --downloads.')
    return os.path.abspath(value if os.path.isabs(value) else os.path.join(HERE, value))


def safe_filename(name: str, limit: int = 100) -> str:
    """Prevent path traversal, reserved Windows names, and excessively long names."""
    name = html_lib.unescape(str(name or '')).replace('\\', '/').rsplit('/', 1)[-1]
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f\x7f]', '_', name).strip(' .')
    if not name:
        name = 'attachment'
    stem, ext = os.path.splitext(name)
    ext = ext[:20]
    stem = stem[:max(1, limit - len(ext))].rstrip(' .') or 'attachment'
    device_name = stem.split('.', 1)[0].rstrip(' .')
    if re.fullmatch(r'(?i)CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³]', device_name):
        stem = '_' + stem
    return (stem + ext).rstrip(' .')


def parse_date(value: str) -> dt.date:
    for fmt in ('%Y%m%d', '%Y-%m-%d', '%Y/%m/%d'):
        try:
            return dt.datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    raise argparse.ArgumentTypeError(f'Invalid date: {value}; use YYYYMMDD or YYYY-MM-DD.')


def positive(value: str) -> int:
    try:
        n = int(value)
        if n < 1:
            raise ValueError
        return n
    except ValueError:
        raise argparse.ArgumentTypeError('Page numbers must be positive integers.')


def create_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Collect KOTRA trade-regulation news into SQLite.')
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('crawl', help='Crawl news and attachments')
    p.add_argument('pages', nargs='*', help='One page, two page numbers, or all')
    p.add_argument('--year', type=int, help='ISO week-based year')
    p.add_argument('--week', type=int, help='ISO week number, Monday to Sunday')
    p.add_argument('--start-date', type=parse_date, help='Inclusive date, YYYYMMDD')
    p.add_argument('--end-date', type=parse_date, help='Inclusive date, YYYYMMDD')
    p.add_argument('--page', type=positive, help='One page')
    p.add_argument('--from', dest='from_page', type=positive, help='First page, inclusive')
    p.add_argument('--to', dest='to_page', type=positive, help='Last page, inclusive')
    p.add_argument('--db', help='SQLite file path')
    p.add_argument('--downloads', help='Attachment directory (category folder itself)')
    p.add_argument('--log-dir', help='Log directory')
    p.add_argument('--delay', type=float, help='Seconds between HTTP requests, default 0.5')
    p.add_argument('--config', default=str(HERE / 'config.ini'), help='Configuration file')
    return parser


def read_config(path: str) -> dict:
    cfg = configparser.ConfigParser(interpolation=None)
    if not os.path.isfile(path):
        raise ValueError(f'Configuration file not found: {path}')
    cfg.read(path, encoding='utf-8-sig')
    if not cfg.has_section('crawler'):
        raise ValueError('config.ini has no [crawler] section')
    result = DEFAULTS.copy()
    result.update(dict(cfg['crawler']))
    return result


def settings(args: argparse.Namespace, cfg: dict) -> dict:
    has_week = args.year is not None or args.week is not None
    has_dates = args.start_date is not None or args.end_date is not None
    if has_week and has_dates:
        raise ValueError('Use either --year/--week or --start-date/--end-date, not both.')
    start = end = None
    if has_week:
        if args.year is None or args.week is None:
            raise ValueError('--year and --week are both required.')
        try:
            start = dt.date.fromisocalendar(args.year, args.week, 1)
            end = dt.date.fromisocalendar(args.year, args.week, 7)
        except ValueError as exc:
            raise ValueError(f'Invalid ISO year/week: {exc}') from exc
    elif has_dates:
        if not args.start_date or not args.end_date:
            raise ValueError('--start-date and --end-date are both required.')
        start, end = args.start_date, args.end_date
        if start > end:
            raise ValueError('Start date must not be later than end date.')

    explicit_page = bool(args.pages or args.page is not None or args.from_page is not None or args.to_page is not None)
    modes = int(bool(args.pages)) + int(args.page is not None) + int(args.from_page is not None or args.to_page is not None)
    if modes > 1:
        raise ValueError('Do not mix positional pages, --page and --from/--to.')
    if args.pages:
        if args.pages == ['all']:
            first, last = 1, None
        elif len(args.pages) in (1, 2):
            try:
                numbers = [int(x) for x in args.pages]
            except ValueError as exc:
                raise ValueError('Pages must be positive integers or the word all.') from exc
            first, last = numbers[0], numbers[-1]
        else:
            raise ValueError('Specify one page, two pages, or all.')
    elif args.page is not None:
        first = last = args.page
    elif args.from_page is not None or args.to_page is not None:
        if args.from_page is None or args.to_page is None:
            raise ValueError('--from and --to must be used together.')
        first, last = args.from_page, args.to_page
    elif has_week or has_dates:
        first, last = 1, None
    else:
        first, last = int(cfg['start_page']), int(cfg['end_page'])
    if first < 1 or (last is not None and (last < first or last < 1)):
        raise ValueError('Page range must be positive and first must not exceed last.')
    size = int(cfg['page_size'])
    if size not in (10, 20, 50, 100):
        raise ValueError('page_size must be one of 10, 20, 50, 100.')
    delay = args.delay if args.delay is not None else float(cfg['delay_seconds'])
    timeout = float(cfg['timeout_seconds'])
    retries = int(cfg['retries'])
    if not math.isfinite(delay) or delay < 0 or not math.isfinite(timeout) or timeout <= 0 or retries < 0:
        raise ValueError('Invalid delay, timeout, or retries in configuration.')
    return {'start': start, 'end': end, 'first': first, 'last': last, 'size': size,
            'db': resolve_path(args.db or cfg['db']),
            'downloads': resolve_path(args.downloads or cfg['downloads']),
            'log_dir': resolve_path(args.log_dir or cfg['log_dir']),
            'delay': delay, 'timeout': timeout, 'retries': retries, 'explicit_page': explicit_page}


def setup_logging(log_dir: str) -> None:
    os.makedirs(winfs(log_dir), exist_ok=True)
    target = os.path.join(log_dir, dt.date.today().isoformat() + '.log')
    LOG.setLevel(logging.INFO)
    LOG.handlers.clear()
    formatter = logging.Formatter('%(asctime)s %(levelname)s %(message)s')
    file_handler = logging.FileHandler(winfs(target), encoding='utf-8')
    file_handler.setFormatter(formatter)
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    LOG.addHandler(file_handler)
    LOG.addHandler(console)


def make_session(retries: int) -> requests.Session:
    session = requests.Session()
    session.headers.update({'User-Agent': 'KOTRA-Trade-News-Crawler/1.0 (contact: local user)',
                            'Referer': REFERER})
    retry = Retry(total=retries, connect=retries, read=retries, status=retries,
                  backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504],
                  allowed_methods=frozenset(['GET', 'POST']), respect_retry_after_header=True)
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('https://', adapter)
    return session


class Client:
    def __init__(self, opts: dict):
        self.session = make_session(opts['retries'])
        self.timeout = opts['timeout']
        self.delay = opts['delay']
        self.last_request = 0.0

    def request(self, method: str, url: str, **kwargs):
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or (parsed.hostname or '').lower() != 'dream.kotra.or.kr':
            raise ValueError(f'Refusing non-KOTRA or insecure URL: {url}')
        elapsed = time.monotonic() - self.last_request
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)
        self.last_request = time.monotonic()
        r = self.session.request(method, url, timeout=self.timeout, **kwargs)
        try:
            r.raise_for_status()
        except Exception:
            r.close()
            raise
        return r

    def get_list(self, page: int, opts: dict):
        params = {'pageNo': page, 'pagePerCnt': 10, 'SITE_NO': 3, 'MENU_ID': 90,
                  'CONTENTS_NO': 1, 'bbsGbn': 244, 'bbsSn': 244, 'pNttSn': '',
                  'recordCountPerPage': opts['size'], 'viewType': '',
                  'pStartDt': opts['start'].strftime('%Y/%m/%d') if opts['start'] else '',
                  'pEndDt': opts['end'].strftime('%Y/%m/%d') if opts['end'] else '',
                  'sSearchVal': '', 'pRegnCd': '', 'pNatCd': '', 'pKbcCd': '', 'pIndustCd': ''}
        with self.request('POST', LIST_URL, data=params, headers={'X-Requested-With': 'XMLHttpRequest'}) as response:
            try:
                body = response.json()
                data = body['data']
                rows, total = data['list'], int(data['totalRecordCount'])
                actual_page = int(data['currentPageNo'])
                actual_size = int(data['recordCountPerPage'])
                if not isinstance(rows, list) or actual_page != page or actual_size != opts['size'] or total < 0:
                    raise ValueError('unexpected list/pagination values')
                return rows, total
            except (ValueError, TypeError, KeyError) as exc:
                raise RuntimeError(f'Invalid list API response on page {page}: {exc}') from exc

    def detail(self, source_id: str, page: int, opts: dict):
        query = {'pageNo': page, 'SITE_NO': 3, 'MENU_ID': 90, 'CONTENTS_NO': 1,
                 'bbsGbn': 244, 'bbsSn': 244, 'pNttSn': source_id}
        url = DETAIL_URL + '?' + urlencode(query)
        with self.request('GET', url) as response:
            response.encoding = response.apparent_encoding if not response.encoding else response.encoding
            return parse_detail(response.text, url, source_id), url

    def download(self, item: dict, source_id: str, root: str) -> tuple[str, int, str]:
        file_id = str(item['file_id'])
        if not re.fullmatch(r'[A-Za-z0-9_-]+', file_id):
            raise ValueError(f'Unsafe attachment ID: {file_id!r}')
        directory = os.path.join(root, source_id)
        os.makedirs(winfs(directory), exist_ok=True)
        name = safe_filename(item.get('original_name') or 'attachment')
        target = os.path.join(directory, file_id[:50] + '_' + name)
        temp = target + '.part'
        digest = hashlib.sha256()
        size = 0
        try:
            with self.request('GET', item['download_url'], stream=True) as response:
                ctype = response.headers.get('Content-Type', '').lower()
                dispo = response.headers.get('Content-Disposition', '').lower()
                if ('text/html' in ctype or 'application/json' in ctype) and 'attachment' not in dispo:
                    raise RuntimeError(f'Expected a file but received {ctype}; site may require login or returned an error.')
                with open(winfs(temp), 'wb') as out:
                    for chunk in response.iter_content(chunk_size=128 * 1024):
                        if chunk:
                            out.write(chunk)
                            digest.update(chunk)
                            size += len(chunk)
                length = response.headers.get('Content-Length')
                if length and length.isdigit() and not response.headers.get('Content-Encoding') and size != int(length):
                    raise IOError(f'Incomplete download: expected {length}, received {size} bytes')
            os.replace(winfs(temp), winfs(target))
        except Exception:
            try:
                os.remove(winfs(temp))
            except FileNotFoundError:
                pass
            raise
        return target, size, digest.hexdigest()


def row_date(row: dict) -> dt.date:
    value = str(row.get('OTHBC_DT_NM') or row.get('OTHBC_DT') or '')[:10]
    try:
        return parse_date(value)
    except argparse.ArgumentTypeError as exc:
        raise ValueError(f'Unrecognized publication date: {value!r}') from exc


def plain(value) -> str:
    return html_lib.unescape(str(value or '')).strip()


def crawl(opts: dict) -> int:
    conn = init_db(winfs(opts['db']))
    client = Client(opts)
    page, errors, saved, attachments = opts['first'], 0, 0, 0
    seen = set()
    previous_date = None
    ordered = True
    LOG.warning('KOTRA robots.txt disallows automated crawling as observed 2026-11-16. Obtain permission and check current terms before use.')
    LOG.info('Starting: dates=%s..%s, pages=%s..%s, page_size=%s',
             opts['start'] or 'all', opts['end'] or 'all', page,
             opts['last'] or 'all', opts['size'])
    try:
        while opts['last'] is None or page <= opts['last']:
            rows, total = client.get_list(page, opts)
            total_pages = math.ceil(total / opts['size'])
            LOG.info('Page %s; website reports %s records / %s pages; received %s items',
                     page, total, total_pages, len(rows))
            if not rows:
                if page <= total_pages:
                    raise RuntimeError(f'Unexpected empty page {page} before total {total}; crawl incomplete.')
                break
            found_older = False
            for row in rows:
                source_id = str(row.get('NTT_SN') or '')
                try:
                    if not re.fullmatch(r'\d+', source_id):
                        raise ValueError('Missing or invalid article ID')
                    published = row_date(row)
                    if previous_date is not None and published > previous_date:
                        ordered = False
                    previous_date = published
                    if opts['start'] and published < opts['start']:
                        found_older = True
                        continue
                    if opts['end'] and published > opts['end']:
                        continue
                    if source_id in seen:
                        LOG.warning('Duplicate article %s in current run; skipped', source_id)
                        continue
                    seen.add(source_id)
                    (detail, files), url = client.detail(source_id, page, opts)
                    article = {'source_id': source_id,
                               'title': detail.get('title') or plain(row.get('NTT_SJ')),
                               'category': detail.get('category') or plain(row.get('BBS_NAME')),
                               'country': detail.get('country') or plain(row.get('NAT')),
                               'office': detail.get('office') or plain(row.get('KBC')),
                               'published_date': published.isoformat(),
                               'source': detail.get('source') or '',
                               'keywords': detail.get('keywords') or '',
                               'summary': detail.get('summary') or plain(row.get('SMMAR_CN')),
                               'content_text': detail.get('content_text') or '',
                               'content_html': detail.get('content_html') or '',
                               'original_url': url,
                               'list_json': json.dumps(row, ensure_ascii=False)}
                    if not article['content_text'] and not article['content_html']:
                        raise ValueError('Article body is empty or the site layout has changed')
                    save_article(conn, article)
                    saved += 1
                    LOG.info('Saved article %s: %s', source_id, article['title'])
                    if str(row.get('ATTACH_YN') or '').upper() == 'Y' and not files:
                        raise ValueError('List indicates attachments but none were recognized; parser may need updating.')
                    for item in files:
                        file_id = str(item['file_id'])
                        record = {'source_id': source_id, 'file_id': file_id,
                                  'original_name': item.get('original_name', ''),
                                  'download_url': item.get('download_url', ''), 'local_path': '',
                                  'status': 'failed', 'size_bytes': None, 'sha256': '', 'error': ''}
                        try:
                            record['local_path'], record['size_bytes'], record['sha256'] = client.download(item, source_id, opts['downloads'])
                            record['status'] = 'downloaded'
                            attachments += 1
                            LOG.info('Downloaded %s / %s -> %s', source_id, file_id, record['local_path'])
                        except Exception as exc:
                            record['error'] = str(exc)[:2000]
                            errors += 1
                            LOG.exception('Attachment failed %s / %s', source_id, file_id)
                        save_attachment(conn, record)
                except Exception:
                    errors += 1
                    LOG.exception('Article failed: page=%s id=%s', page, source_id)
            if found_older and ordered:
                LOG.info('Encountered a date before the start date in a descending list; stopping.')
                break
            if found_older and not ordered:
                LOG.warning('Dates are not descending; skipping early-stop to avoid missing records.')
            if page >= total_pages:
                break
            page += 1
        LOG.info('Finished: %s articles saved, %s attachments downloaded, %s errors', saved, attachments, errors)
        return 2 if errors else 0
    finally:
        conn.close()
        client.session.close()


def main(argv=None) -> int:
    parser = create_parser()
    args = parser.parse_args(argv)
    try:
        cfg = read_config(args.config)
        opts = settings(args, cfg)
        setup_logging(opts['log_dir'])
        return crawl(opts)
    except (ValueError, OSError, RuntimeError, requests.RequestException) as exc:
        if LOG.handlers:
            LOG.exception('Crawl aborted: %s', exc)
        else:
            print(f'Error: {exc}', file=sys.stderr)
        return 1
    except Exception as exc:
        if LOG.handlers:
            LOG.exception('Unexpected error; crawl aborted: %s', exc)
        else:
            print(f'Unexpected error: {exc}', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        if LOG.handlers:
            LOG.warning('Interrupted by user; already saved records remain in the database.')
        return 130


if __name__ == '__main__':
    sys.exit(main())
