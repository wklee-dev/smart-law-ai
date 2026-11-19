#!/usr/bin/env python3
"""Network-free regression tests for customs_crawler.

Run from this directory with: python3 -B -m unittest -v test_customs_crawler
All HTTP responses are scripted and all database/config/download paths are temporary.
"""
import contextlib
import hashlib
import html as html_lib
import io
import ntpath
import os
import re
import socket
import sqlite3
import tempfile
import unittest
from collections import deque
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlparse

import requests
import customs_crawler as crawler


def list_row(post_id='101', token='AbC123', number='12', category='보도자료',
             title='관세청 보도자료', writer='홍보담당관', date='2026-01-02',
             views='1,234', bbs='1362'):
    esc = lambda x: html_lib.escape(str(x), quote=True)
    return (
        '<tr><td>{}</td><td>{}</td><td class="subject">'
        '<a class="nttInfoBtn" href="#" data-id="{}" data-url="{}" '
        'data-bbs="{}" title="{}">{}</a></td>'
        '<td>{}</td><td>{}</td><td>{}</td></tr>'
    ).format(*map(esc, [number, category, post_id, token, bbs, title, title,
                         writer, date, views]))


def list_html(page=1, total=1, rows=None, count=1):
    if rows is None:
        rows = [list_row()]
    return ('<!doctype html><html><body><div class="page_num">전체 {}건 '
            '<strong>{}</strong> / {} 페이지</div><table class="bbsList">'
            '<thead><tr><th>번호</th><th>구분</th><th>제목</th><th>작성자</th>'
            '<th>등록일</th><th>조회</th></tr></thead><tbody>{}</tbody></table>'
            '</body></html>').format(count, page, total, ''.join(rows))


def attachment_li(key, name, size=None, host='', title=True):
    escaped_name = html_lib.escape(name, quote=True)
    href = html_lib.escape(f'{host}/kcs/na/ntt/nttFileDownload.do?fileKey={key}&bbsId=1362', quote=True)
    title_attr = f' title="{escaped_name} 다운로드"' if title else ''
    size_html = f'<span>{size}</span>' if size is not None else ''
    return f'<li><a href="{href}"{title_attr}>{escaped_name}{size_html}</a></li>'


def detail_html(post_id='101', attachments=(), body=None, title='상세 보도자료'):
    if body is None:
        body = '<p>관<span>세</span>청<br>안내</p><script>ignore()</script><p>두 번째 문단</p>'
    return (
        '<!doctype html><html><body><form id="nttViewForm">'
        f'<input type="hidden" name="nttSn" value="{html_lib.escape(str(post_id), quote=True)}">'
        f'<h3 class="bbsTitle">{html_lib.escape(title)}</h3>'
        '<table class="bbsView"><tbody><tr><th>작성자</th><td>대변인실</td>'
        '<th>등록일</th><td>2026-01-03</td></tr><tr><th>구분</th><td>보도</td></tr>'
        f'<tr><td class="conts"><div class="conts">{body}</div></td></tr>'
        '</tbody></table><ul class="list_file">' + ''.join(attachments) +
        '</ul></form></body></html>'
    )


class FakeResponse:
    def __init__(self, text='', content=b'', content_type='application/octet-stream',
                 status=200, location=None, chunks=None):
        self.text = text
        self.content = content
        self.status = status
        self.headers = {'Content-Type': content_type}
        if location is not None:
            self.headers['Location'] = location
        self.is_redirect = status in (301, 302, 303, 307, 308) and location is not None
        self.chunks = chunks
        self.closed = False
        self.encoding = None

    def raise_for_status(self):
        if self.status >= 400:
            raise requests.HTTPError(f'HTTP {self.status}')

    def iter_content(self, chunk_size):
        for chunk in self.chunks if self.chunks is not None else [self.content]:
            if isinstance(chunk, Exception):
                raise chunk
            yield chunk

    def close(self):
        self.closed = True


class FakeSession:
    """One explicit queue per route; an unconfigured request can never hit the network."""
    def __init__(self):
        self.headers = {}
        self.routes = {}
        self.calls = []

    def add(self, key, *responses):
        self.routes.setdefault(key, deque()).extend(responses)

    def get(self, url, **kwargs):
        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        params = kwargs.get('params') or {}
        if parsed.path.endswith('selectNttList.do'):
            key = ('list', int(params.get('currPage', query.get('currPage', ['0'])[0])))
        elif parsed.path.endswith('selectNttInfo.do'):
            key = ('detail', query.get('nttSn', [''])[0])
        elif parsed.path.endswith('nttFileDownload.do'):
            key = ('file', query.get('fileKey', [''])[0])
        else:
            key = ('other', url)
        self.calls.append((key, url, kwargs))
        if key not in self.routes or not self.routes[key]:
            raise AssertionError(f'Unexpected fake HTTP request: {key!r} {url}')
        result = self.routes[key].popleft()
        if isinstance(result, Exception):
            raise result
        return result


def html_response(value):
    return FakeResponse(text=value, content_type='text/html; charset=utf-8')


class IsolatedTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.db = self.root / 'fixture.sqlite3'
        self.downloads = self.root / 'downloads'
        self.config = self.root / 'test.ini'
        self.config.write_text(
            '[crawler]\n'
            f'db_path = {self.db}\n'
            f'download_dir = {self.downloads}\n'
            'start_page = 2\nend_page = 4\n'
            'delay_seconds = 0\nconnect_timeout_seconds = 1\n'
            'read_timeout_seconds = 1\nretries = 1\n', encoding='utf-8')
        self.session = FakeSession()
        for patcher in (
            mock.patch.object(crawler.requests, 'Session', return_value=self.session),
            mock.patch.object(crawler, 'init_logging'),
            mock.patch.object(crawler.LOG, 'disabled', True),
            mock.patch.object(crawler.time, 'sleep'),
            mock.patch.object(socket, 'socket', side_effect=AssertionError('Real network is forbidden')),
        ):
            patcher.start()
            self.addCleanup(patcher.stop)

    def args(self, *values):
        return crawler.parse_args(['--config', str(self.config), *values])

    def run_main(self, *values):
        return crawler.main(['--config', str(self.config), *values])

    def open_db(self):
        con = crawler.connect_db(self.db, create_db=True)
        self.addCleanup(con.close)
        return con

    def rows(self, sql, parameters=()):
        with contextlib.closing(sqlite3.connect(self.db)) as con:
            con.row_factory = sqlite3.Row
            return con.execute(sql, parameters).fetchall()


class PageArgumentsTests(IsolatedTest):
    def test_single_range_all_flags_and_config_defaults(self):
        cases = [
            (['7'], (7, 7, False)),
            (['2', '5'], (2, 5, False)),
            (['all'], (1, None, True)),
            (['--from', '3', '--to', '9'], (3, 9, False)),
            ([], (2, 4, False)),
        ]
        for argv, expected in cases:
            with self.subTest(argv=argv):
                args = self.args(*argv)
                self.assertEqual((args.start, args.end, args.all_pages), expected)
                self.assertEqual(args.db_path, self.db)
                self.assertEqual(args.download_root, self.downloads)

    def test_invalid_arguments_exit_2(self):
        invalid = [
            ['0'], ['4', '2'], ['all', '2'], ['1', '2', '3'], ['foo'],
            ['--from', '1'], ['--to', '2'], ['--from', '0', '--to', '2'],
            ['--from', '3', '--to', '2'], ['1', '--from', '1', '--to', '2'],
            ['-1'], ['--stage', 'invalid'],
        ]
        for argv in invalid:
            with self.subTest(argv=argv), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as exc:
                    self.args(*argv)
                self.assertEqual(exc.exception.code, 2)

    def test_rejects_invalid_connection_settings(self):
        for setting in ['delay_seconds = -1', 'connect_timeout_seconds = 0',
                        'read_timeout_seconds = 0', 'retries = 0']:
            with self.subTest(setting=setting):
                name = setting.split(' = ')[0]
                original = self.config.read_text(encoding='utf-8')
                changed = re.sub(rf'^{name} = .*$', setting, original, flags=re.MULTILINE)
                self.config.write_text(changed, encoding='utf-8')
                try:
                    with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as exc:
                        self.args('1')
                    self.assertEqual(exc.exception.code, 2)
                finally:
                    self.config.write_text(original, encoding='utf-8')


class ParsingTests(IsolatedTest):
    def test_realistic_list_fields_and_page_count(self):
        markup = list_html(page='1,234', total='2,000', count='12,345', rows=[
            list_row('45678', 'A1b2Z', number='공지', title='관세 & 무역 <안내>', views='12,345'),
            list_row('45677', 'Token2', number='12', title='두 번째', views='-'),
        ])
        posts, total = crawler.parse_list(markup, 1234)
        self.assertEqual(total, 2000)
        self.assertEqual(len(posts), 2)
        first, second = posts
        self.assertEqual({k: first[k] for k in ('ntt_sn', 'bbs_id', 'ntt_sn_url', 'list_number',
                                                'category', 'title', 'writer', 'published_date',
                                                'view_count', 'source_page')},
                         dict(ntt_sn='45678', bbs_id='1362', ntt_sn_url='A1b2Z', list_number='공지',
                              category='보도자료', title='관세 & 무역 <안내>', writer='홍보담당관',
                              published_date='2026-01-02', view_count=12345, source_page=1234))
        self.assertEqual(parse_qs(urlparse(first['detail_url']).query),
                         {'mi': ['2891'], 'bbsId': ['1362'], 'nttSn': ['45678'], 'nttSnUrl': ['A1b2Z']})
        self.assertTrue(first['list_collected_at'])
        self.assertIsNone(second['view_count'])

    def test_empty_list_is_accepted_only_when_no_posts_claimed(self):
        empty_row = '<tr><td colspan="6">등록된 게시물이 없습니다</td></tr>'
        self.assertEqual(crawler.parse_list(list_html(rows=[empty_row], count=0), 1), ([], 1))
        with self.assertRaisesRegex(ValueError, '게시물이 존재'):
            crawler.parse_list(list_html(rows=[empty_row], count=3), 1)

    def test_invalid_list_structure_page_and_fields(self):
        cases = [
            ('missing table', '<div class="page_num">1 / 1</div>'),
            ('missing page', '<table class="bbsList"><tbody></tbody></table>'),
            ('bad page', list_html().replace('<strong>1</strong> / 1', '페이지 알 수 없음')),
            ('wrong page', list_html(page=2)),
            ('missing link', list_html(rows=['<tr><td>게시물</td></tr>'])),
            ('too few fields', list_html(rows=['<tr><td><a class="nttInfoBtn" data-id="1" data-url="A">제목</a></td></tr>'])),
            ('non-numeric id', list_html(rows=[list_row(post_id='12x')])),
            ('invalid token', list_html(rows=[list_row(token='bad-./')])),
            ('wrong board', list_html(rows=[list_row(bbs='99')])),
            ('empty title', list_html(rows=[list_row(title='')])),
        ]
        for label, markup in cases:
            with self.subTest(label=label), self.assertRaises(ValueError):
                crawler.parse_list(markup, 1)

    def test_detail_without_attachments_and_body_text(self):
        detail = crawler.parse_detail(detail_html(), '101')
        self.assertEqual(detail['title'], '상세 보도자료')
        self.assertEqual(detail['writer'], '대변인실')
        self.assertEqual(detail['published_date'], '2026-01-03')
        self.assertEqual(detail['category'], '보도')
        self.assertEqual(detail['body_text'], '관세청\n안내\n두 번째 문단')
        self.assertIn('<span>세</span>', detail['body_html'])
        self.assertNotIn('ignore()', detail['body_text'])
        self.assertEqual(detail['files'], [])

    def test_detail_multiple_attachments_and_filename_fallback(self):
        markup = detail_html(attachments=[
            attachment_li('file_A-1', '보도 자료.pdf', '1,234'),
            attachment_li('fileB', '서식.hwp', '알 수 없음', title=False),
        ])
        files = crawler.parse_detail(markup, '101')['files']
        self.assertEqual([(f['file_key'], f['original_name'], f['expected_bytes']) for f in files],
                         [('file_A-1', '보도 자료.pdf', 1234), ('fileB', '서식.hwp', None)])
        self.assertTrue(all(crawler.same_site(f['download_url']) for f in files))
        self.assertEqual(parse_qs(urlparse(files[0]['download_url']).query)['fileKey'], ['file_A-1'])

    def test_detail_rejects_wrong_identity_structure_and_unsafe_files(self):
        good = detail_html()
        bad = [
            '<html>error</html>',
            detail_html(post_id='999'),
            good.replace('<h3 class="bbsTitle">상세 보도자료</h3>', ''),
            good.replace('<td class="conts"><div class="conts">', '<td><div>'),
            detail_html(attachments=['<li><a href="/not-a-download">파일</a></li>']),
            detail_html(attachments=[attachment_li('', '파일.pdf')]),
            detail_html(attachments=[attachment_li('bad.dot', '파일.pdf')]),
            detail_html(attachments=[attachment_li('abc', '파일.pdf', host='https://evil.example')]),
            detail_html(attachments=[attachment_li('abc', '파일.pdf', host='http://www.customs.go.kr')]),
            detail_html(attachments=[attachment_li('dup', 'a.pdf'), attachment_li('dup', 'b.pdf')]),
            detail_html(attachments=['<li><a href="/kcs/na/ntt/nttFileDownload.do?fileKey=abc"><span>1</span></a></li>']),
        ]
        for i, markup in enumerate(bad):
            with self.subTest(case=i), self.assertRaises(ValueError):
                crawler.parse_detail(markup, '101')


class DatabaseTests(IsolatedTest):
    def test_existing_unrelated_tables_preserved_and_post_upsert_deduplicated(self):
        with sqlite3.connect(self.db) as con:
            con.execute('CREATE TABLE user_records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
            con.executemany('INSERT INTO user_records VALUES (?, ?)', [(1, '보존'), (2, 'untouched')])
            original_schema = con.execute("SELECT sql FROM sqlite_master WHERE name='user_records'").fetchone()[0]
        con = crawler.connect_db(self.db)
        self.addCleanup(con.close)
        posts, _ = crawler.parse_list(list_html(rows=[list_row(title='최초')]), 1)
        crawler.save_posts(con, posts)
        posts[0]['title'] = '변경'
        crawler.save_posts(con, posts)
        self.assertEqual(con.execute('SELECT COUNT(*) FROM kcs_press_release_v1').fetchone()[0], 1)
        self.assertEqual(con.execute('SELECT title FROM kcs_press_release_v1').fetchone()[0], '변경')
        self.assertEqual([tuple(r) for r in con.execute('SELECT * FROM user_records ORDER BY id')],
                         [(1, '보존'), (2, 'untouched')])
        self.assertEqual(con.execute("SELECT sql FROM sqlite_master WHERE name='user_records'").fetchone()[0], original_schema)

    def test_missing_db_requires_explicit_create(self):
        with self.assertRaises(FileNotFoundError):
            crawler.connect_db(self.db)
        self.assertFalse(self.db.exists())
        con = crawler.connect_db(self.db, create_db=True)
        con.close()
        self.assertTrue(self.db.exists())

    def test_obviously_incompatible_table_or_view_is_rejected(self):
        scenarios = [
            'CREATE TABLE kcs_press_release_v1 (ntt_sn TEXT PRIMARY KEY, title TEXT)',
            'CREATE VIEW kcs_press_release_v1 AS SELECT 1 AS ntt_sn',
            'CREATE TABLE kcs_press_attachment_v1 (id INTEGER PRIMARY KEY, ntt_sn TEXT)',
            crawler.FILE_DDL.replace('    UNIQUE(ntt_sn, file_key),\n', ''),
        ]
        for i, ddl in enumerate(scenarios):
            path = self.root / f'collision-{i}.db'
            with self.subTest(case=i):
                with sqlite3.connect(path) as existing:
                    existing.execute('CREATE TABLE unrelated (value TEXT)')
                    existing.execute("INSERT INTO unrelated VALUES ('safe')")
                    existing.execute(ddl)
                    snapshot = existing.execute("SELECT type, sql FROM sqlite_master WHERE name LIKE 'kcs_press_%'").fetchall()
                with self.assertRaises(RuntimeError):
                    crawler.connect_db(path)
                with sqlite3.connect(path) as after:
                    self.assertEqual(after.execute('SELECT * FROM unrelated').fetchall(), [('safe',)])
                    for obj_type, sql in snapshot:
                        self.assertIn((obj_type, sql), after.execute("SELECT type, sql FROM sqlite_master WHERE name LIKE 'kcs_press_%'").fetchall())

    def test_same_columns_but_incompatible_not_null_is_rejected(self):
        # save_posts omits body_html, so this schema cannot support list collection.
        bad_ddl = crawler.POST_DDL.replace('    body_html TEXT,', '    body_html TEXT NOT NULL,')
        with sqlite3.connect(self.db) as con:
            con.execute(bad_ddl)
            con.execute(crawler.FILE_DDL)
        try:
            accepted = crawler.connect_db(self.db)
        except RuntimeError:
            return
        with contextlib.closing(accepted):
            posts, _ = crawler.parse_list(list_html(), 1)
            with self.assertRaisesRegex(sqlite3.IntegrityError, 'body_html'):
                crawler.save_posts(accepted, posts)
        self.fail('비호환 NOT NULL 제약이 있는 기존 테이블을 connect_db가 수락했습니다')

    def test_partial_unique_index_is_not_a_compatible_unique_constraint(self):
        # A partial UNIQUE index does not support the crawler's unqualified UPSERT.
        bad_ddl = crawler.FILE_DDL.replace('    UNIQUE(ntt_sn, file_key),\n', '')
        with sqlite3.connect(self.db) as con:
            con.execute(crawler.POST_DDL)
            con.execute(bad_ddl)
            con.execute('CREATE UNIQUE INDEX only_active ON kcs_press_attachment_v1(ntt_sn, file_key) WHERE is_active=1')
        try:
            accepted = crawler.connect_db(self.db)
        except RuntimeError:
            return
        with contextlib.closing(accepted):
            posts, _ = crawler.parse_list(list_html(), 1)
            crawler.save_posts(accepted, posts)
            detail = crawler.parse_detail(detail_html(attachments=[attachment_li('key1', 'a.txt')]), '101')
            with self.assertRaisesRegex(sqlite3.OperationalError, 'ON CONFLICT'):
                crawler.save_detail(accepted, '101', detail)
        self.fail('UPSERT에 사용할 수 없는 부분 UNIQUE 인덱스를 connect_db가 수락했습니다')

    def test_schema_collision_does_not_leave_new_tables_in_existing_db(self):
        with sqlite3.connect(self.db) as con:
            con.execute('CREATE TABLE unrelated (value TEXT)')
            con.execute("INSERT INTO unrelated VALUES ('safe')")
            con.execute('CREATE TABLE kcs_press_attachment_v1 (id INTEGER PRIMARY KEY)')
            before = con.execute("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
        with self.assertRaises(RuntimeError):
            crawler.connect_db(self.db)
        with sqlite3.connect(self.db) as con:
            after = con.execute("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
            self.assertEqual(con.execute('SELECT * FROM unrelated').fetchall(), [('safe',)])
        self.assertEqual(after, before, '실패한 스키마 초기화가 기존 DB에 새 테이블을 남겼습니다')


class FilenameAndHttpTests(IsolatedTest):
    def test_safe_filename_traversal_windows_reserved_and_limits(self):
        inputs = ['../../etc/passwd', r'..\..\evil.txt', '/absolute/a.txt',
                  'CON', 'con.txt', 'PrN.pdf', 'NUL.zip', 'AUX', 'COM1.log', 'LPT9.txt',
                  '... ', '\x00a:*?"<>|.txt', '한' * 300 + '.txt']
        for name in inputs:
            with self.subTest(name=name):
                result = crawler.safe_filename(name)
                self.assertTrue(result)
                self.assertNotIn('/', result)
                self.assertNotIn('\\', result)
                self.assertNotRegex(result, r'[\x00-\x1f:*?"<>|]')
                self.assertNotIn(result, ('.', '..'))
                self.assertFalse(result.endswith((' ', '.')))
                stem = os.path.splitext(result)[0]
                self.assertNotRegex(stem, r'(?i)^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$')
                self.assertLessEqual(len(result.encode('utf-8')), 180)
        self.assertEqual(crawler.safe_filename('CON.txt'), '_CON.txt')
        self.assertEqual(crawler.safe_filename('... '), 'attachment')

    def test_html_retries_transient_failure_and_closes_response(self):
        response = html_response('<html>성공</html>')
        self.session.add(('list', 1), requests.Timeout('temporary'), response)
        client = crawler.HttpClient(0, 1, 2, 2)
        self.assertEqual(client.html(crawler.LIST_URL, {'currPage': 1}), '<html>성공</html>')
        self.assertEqual(len(self.session.calls), 2)
        self.assertTrue(response.closed)
        self.assertEqual(response.encoding, 'utf-8')
        self.assertEqual(self.session.calls[0][2]['timeout'], (1, 2))
        self.assertFalse(self.session.calls[0][2]['allow_redirects'])

    def test_download_retries_stream_error_and_replaces_atomically(self):
        url = crawler.BASE + '/kcs/na/ntt/nttFileDownload.do?fileKey=abc'
        broken = FakeResponse(chunks=[b'incomplete', requests.ConnectionError('dropped')])
        success = FakeResponse(chunks=[b'he', b'llo'])
        self.session.add(('file', 'abc'), broken, success)
        target = self.root / 'files' / 'file.bin'
        client = crawler.HttpClient(0, 1, 1, 2)
        size, digest = client.download(url, target, 5)
        self.assertEqual((size, digest), (5, hashlib.sha256(b'hello').hexdigest()))
        self.assertEqual(target.read_bytes(), b'hello')
        self.assertEqual(list(target.parent.glob('*.part')), [])
        self.assertTrue(broken.closed and success.closed)

    def test_bad_download_is_rejected_without_clobbering_existing_file(self):
        url = crawler.BASE + '/kcs/na/ntt/nttFileDownload.do?fileKey=abc'
        target = self.root / 'files' / 'old.bin'
        target.parent.mkdir()
        target.write_bytes(b'old')
        client = crawler.HttpClient(0, 1, 1, 1)
        for response, size in [(FakeResponse(text='error', content_type='text/html'), None),
                               (FakeResponse(content_type='application/json'), None)]:
            with self.subTest(content_type=response.headers['Content-Type'], size=size):
                self.session.add(('file', 'abc'), response)
                with self.assertRaises(ValueError):
                    client.download(url, target, size)
                self.assertEqual(target.read_bytes(), b'old')
                self.assertEqual(list(target.parent.glob('*.part')), [])
                self.assertTrue(response.closed)

    def test_foreign_host_and_redirect_are_blocked(self):
        client = crawler.HttpClient(0, 1, 1, 1)
        with self.assertRaises(ValueError):
            client.html('https://evil.example/no')
        self.assertEqual(self.session.calls, [])
        redirect = FakeResponse(status=302, location='https://evil.example/stolen')
        self.session.add(('list', 1), redirect)
        with self.assertRaises(ValueError):
            client.html(crawler.LIST_URL, {'currPage': 1})
        self.assertTrue(redirect.closed)
        self.assertEqual(len(self.session.calls), 1)


class StageAndRecoveryTests(IsolatedTest):
    def test_list_then_detail_range_and_detail_all_use_only_expected_requests(self):
        self.session.add(('list', 1), html_response(list_html(1, 2, [list_row('101')], count=2)))
        self.session.add(('list', 2), html_response(list_html(2, 2, [list_row('102')], count=2)))
        self.assertEqual(self.run_main('1', '2', '--stage', 'list', '--create-db'), 0)
        self.assertEqual([c[0] for c in self.session.calls], [('list', 1), ('list', 2)])
        self.assertEqual([(r['ntt_sn'], r['detail_status']) for r in self.rows(
            'SELECT ntt_sn, detail_status FROM kcs_press_release_v1 ORDER BY ntt_sn')],
            [('101', 'pending'), ('102', 'pending')])
        self.session.add(('detail', '101'), html_response(detail_html('101')))
        self.assertEqual(self.run_main('1', '--stage', 'detail'), 0)
        self.assertEqual([c[0] for c in self.session.calls[2:]], [('detail', '101')])
        self.assertEqual([(r['ntt_sn'], r['detail_status']) for r in self.rows(
            'SELECT ntt_sn, detail_status FROM kcs_press_release_v1 ORDER BY ntt_sn')],
            [('101', 'complete'), ('102', 'pending')])
        self.session.add(('detail', '101'), html_response(detail_html('101')))
        self.session.add(('detail', '102'), html_response(detail_html('102')))
        self.assertEqual(self.run_main('all', '--stage', 'detail'), 0)
        self.assertEqual([c[0] for c in self.session.calls[3:]], [('detail', '101'), ('detail', '102')])
        self.assertEqual([r[0] for r in self.rows('SELECT detail_status FROM kcs_press_release_v1')],
                         ['complete', 'complete'])

    def test_all_stage_visits_dynamic_pages_and_deduplicates_details(self):
        self.session.add(('list', 1), html_response(list_html(1, 2, [list_row('101')], count=3)))
        self.session.add(('list', 2), html_response(list_html(2, 2, [list_row('101'), list_row('102')], count=3)))
        self.session.add(('detail', '101'), html_response(detail_html('101')))
        self.session.add(('detail', '102'), html_response(detail_html('102')))
        self.assertEqual(self.run_main('all', '--stage', 'all', '--create-db'), 0)
        self.assertCountEqual([c[0] for c in self.session.calls],
                              [('list', 1), ('detail', '101'), ('list', 2), ('detail', '102')])
        rows = self.rows('SELECT ntt_sn, detail_status FROM kcs_press_release_v1 ORDER BY ntt_sn')
        self.assertEqual([(r['ntt_sn'], r['detail_status']) for r in rows],
                         [('101', 'complete'), ('102', 'complete')])

    def test_list_failure_returns_nonzero_but_later_pages_are_processed(self):
        self.session.add(('list', 1), html_response(list_html(1, 3, [list_row('101')], count=3)))
        self.session.add(('list', 2), html_response(list_html(1, 3, [list_row('102')], count=3)))
        self.session.add(('list', 3), html_response(list_html(3, 3, [list_row('103')], count=3)))
        self.assertEqual(self.run_main('all', '--stage', 'list', '--create-db'), 1)
        self.assertEqual([r[0] for r in self.rows('SELECT ntt_sn FROM kcs_press_release_v1 ORDER BY ntt_sn')],
                         ['101', '103'])

    def test_requested_end_beyond_last_page_is_rejected(self):
        self.session.add(('list', 1), html_response(list_html(1, 2)))
        self.assertEqual(self.run_main('1', '3', '--stage', 'list', '--create-db'), 1)
        self.assertEqual(len(self.rows('SELECT * FROM kcs_press_release_v1')), 0)
        self.assertEqual([c[0] for c in self.session.calls], [('list', 1)])

    def test_detail_without_saved_posts_fails_without_http(self):
        self.assertEqual(self.run_main('1', '--stage', 'detail', '--create-db'), 1)
        self.assertEqual(self.session.calls, [])

    def test_failed_detail_recovers_on_later_detail_run(self):
        self.session.add(('list', 1), html_response(list_html()))
        self.session.add(('detail', '101'), FakeResponse(status=503))
        self.assertEqual(self.run_main('1', '--stage', 'all', '--create-db'), 1)
        row = self.rows('SELECT detail_status, detail_error FROM kcs_press_release_v1')[0]
        self.assertEqual(row['detail_status'], 'failed')
        self.assertIn('HTTPError', row['detail_error'])
        self.session.add(('detail', '101'), html_response(detail_html()))
        self.assertEqual(self.run_main('1', '--stage', 'detail'), 0)
        row = self.rows('SELECT detail_status, detail_error, body_text FROM kcs_press_release_v1')[0]
        self.assertEqual(row['detail_status'], 'complete')
        self.assertIsNone(row['detail_error'])
        self.assertIn('관세청', row['body_text'])

    def test_failed_attachment_recovers_and_clears_errors_on_rerun(self):
        markup = detail_html(attachments=[attachment_li('key1', 'one.txt', 5),
                                          attachment_li('key2', 'two.txt', 3)])
        self.session.add(('list', 1), html_response(list_html()))
        self.session.add(('detail', '101'), html_response(markup), html_response(markup))
        self.session.add(('file', 'key1'), FakeResponse(status=503), FakeResponse(content=b'hello'))
        self.session.add(('file', 'key2'), FakeResponse(content=b'two'), FakeResponse(content=b'two'))
        self.assertEqual(self.run_main('1', '--stage', 'all', '--create-db'), 1)
        post = self.rows('SELECT detail_status, detail_error FROM kcs_press_release_v1')[0]
        self.assertEqual(post['detail_status'], 'partial')
        self.assertIn('one.txt', post['detail_error'])
        files = self.rows('SELECT * FROM kcs_press_attachment_v1 ORDER BY file_key')
        self.assertEqual([f['download_status'] for f in files], ['failed', 'complete'])
        self.assertIn('HTTPError', files[0]['error_message'])
        self.assertEqual(list(self.downloads.rglob('*.part')), [])
        self.assertEqual(self.run_main('1', '--stage', 'detail'), 0)
        post = self.rows('SELECT detail_status, detail_error FROM kcs_press_release_v1')[0]
        self.assertEqual(post['detail_status'], 'complete')
        self.assertIsNone(post['detail_error'])
        files = self.rows('SELECT * FROM kcs_press_attachment_v1 ORDER BY file_key')
        self.assertEqual([f['download_status'] for f in files], ['complete', 'complete'])
        self.assertTrue(all(f['error_message'] is None for f in files))
        for f, payload in zip(files, [b'hello', b'two']):
            self.assertEqual((self.downloads / f['relative_path']).read_bytes(), payload)
            self.assertEqual(f['size_bytes'], len(payload))
            self.assertEqual(f['sha256'], hashlib.sha256(payload).hexdigest())
            self.assertTrue(f['downloaded_at'])

    def test_size_mismatch_preserves_file_warns_and_recovers(self):
        markup = detail_html(attachments=[attachment_li('key1', '표시크기.txt', 5)])
        self.session.add(('list', 1), html_response(list_html()))
        self.session.add(('detail', '101'), html_response(markup), html_response(markup))
        self.session.add(('file', 'key1'), FakeResponse(content=b'bad'), FakeResponse(content=b'hello'))
        self.assertEqual(self.run_main('1', '--stage', 'all', '--create-db'), 1)
        post = self.rows('SELECT detail_status, detail_error FROM kcs_press_release_v1')[0]
        f = self.rows('SELECT * FROM kcs_press_attachment_v1')[0]
        self.assertEqual(post['detail_status'], 'partial')
        self.assertIn('표시크기.txt', post['detail_error'])
        self.assertEqual(f['download_status'], 'size_mismatch')
        self.assertEqual((f['expected_bytes'], f['size_bytes']), (5, 3))
        self.assertIn('5바이트', f['error_message'])
        self.assertIn('3바이트', f['error_message'])
        self.assertTrue(f['downloaded_at'])
        path = self.downloads / f['relative_path']
        self.assertEqual(path.read_bytes(), b'bad')
        self.assertEqual(f['sha256'], hashlib.sha256(b'bad').hexdigest())
        self.assertEqual(list(self.downloads.rglob('*.part')), [])
        self.assertEqual(self.run_main('1', '--stage', 'detail'), 0)
        post = self.rows('SELECT detail_status, detail_error FROM kcs_press_release_v1')[0]
        f = self.rows('SELECT * FROM kcs_press_attachment_v1')[0]
        self.assertEqual((post['detail_status'], post['detail_error']), ('complete', None))
        self.assertEqual((f['download_status'], f['error_message'], f['size_bytes']), ('complete', None, 5))
        self.assertEqual(path.read_bytes(), b'hello')
        self.assertEqual(f['sha256'], hashlib.sha256(b'hello').hexdigest())

    def test_duplicate_names_and_malicious_names_stay_in_post_directory(self):
        attachments = [attachment_li('key1', '같은 이름.txt', 1),
                       attachment_li('key2', '같은 이름.txt', 1),
                       attachment_li('key3', '../../escape.txt', 1),
                       attachment_li('key4', r'..\..\CON.txt', 1)]
        self.session.add(('list', 1), html_response(list_html()))
        self.session.add(('detail', '101'), html_response(detail_html(attachments=attachments)))
        for key, payload in [('key1', b'a'), ('key2', b'b'), ('key3', b'c'), ('key4', b'd')]:
            self.session.add(('file', key), FakeResponse(content=payload))
        self.assertEqual(self.run_main('1', '--stage', 'all', '--create-db'), 0)
        files = self.rows('SELECT * FROM kcs_press_attachment_v1 ORDER BY file_key')
        self.assertEqual(len(files), 4)
        paths = [self.downloads / f['relative_path'] for f in files]
        self.assertEqual(len(set(paths)), 4)
        expected_dir = (self.downloads / '관세청' / '보도자료' / '101').resolve()
        for path, payload in zip(paths, [b'a', b'b', b'c', b'd']):
            self.assertEqual(path.resolve().parent, expected_dir)
            self.assertEqual(path.read_bytes(), payload)
        self.assertFalse((self.root / 'escape.txt').exists())

    def test_different_keys_and_names_cannot_create_same_combined_path(self):
        # A raw underscore separator is ambiguous: a + b_c.txt == a_b + c.txt.
        attachments = [attachment_li('a', 'b_c.txt', 1),
                       attachment_li('a_b', 'c.txt', 1)]
        self.session.add(('list', 1), html_response(list_html()))
        self.session.add(('detail', '101'), html_response(detail_html(attachments=attachments)))
        self.session.add(('file', 'a'), FakeResponse(content=b'a'))
        self.session.add(('file', 'a_b'), FakeResponse(content=b'b'))
        self.assertEqual(self.run_main('1', '--stage', 'all', '--create-db'), 0)
        files = self.rows('SELECT file_key, relative_path, sha256 FROM kcs_press_attachment_v1 ORDER BY file_key')
        self.assertEqual(len(files), 2)
        self.assertNotEqual(files[0]['relative_path'], files[1]['relative_path'],
                            '서로 다른 첨부파일이 같은 경로로 저장되어 덮어씁니다')
        for f in files:
            self.assertEqual(hashlib.sha256((self.downloads / f['relative_path']).read_bytes()).hexdigest(), f['sha256'])

    def test_case_only_file_keys_do_not_collide_on_windows(self):
        # SQLite and the parser allow case-distinct keys, but default Windows
        # filesystems compare pathnames case-insensitively.
        attachments = [attachment_li('File1', '같은 이름.txt', 1),
                       attachment_li('file1', '같은 이름.txt', 1)]
        self.session.add(('list', 1), html_response(list_html()))
        self.session.add(('detail', '101'), html_response(detail_html(attachments=attachments)))
        self.session.add(('file', 'File1'), FakeResponse(content=b'a'))
        self.session.add(('file', 'file1'), FakeResponse(content=b'b'))
        self.assertEqual(self.run_main('1', '--stage', 'all', '--create-db'), 0)
        files = self.rows('SELECT relative_path FROM kcs_press_attachment_v1 ORDER BY file_key')
        self.assertEqual(len(files), 2)
        windows_paths = [ntpath.normcase(f['relative_path']) for f in files]
        self.assertEqual(len(set(windows_paths)), 2,
                         'Windows에서 서로 다른 첨부파일이 같은 경로로 저장됩니다')

    def test_attachment_removed_from_detail_becomes_inactive(self):
        self.session.add(('list', 1), html_response(list_html()))
        self.session.add(('detail', '101'),
                         html_response(detail_html(attachments=[attachment_li('old', 'old.txt', 1)])),
                         html_response(detail_html(attachments=[])))
        self.session.add(('file', 'old'), FakeResponse(content=b'x'))
        self.assertEqual(self.run_main('1', '--stage', 'all', '--create-db'), 0)
        self.assertEqual(self.run_main('1', '--stage', 'detail'), 0)
        row = self.rows('SELECT is_active, download_status FROM kcs_press_attachment_v1')[0]
        self.assertEqual((row['is_active'], row['download_status']), (0, 'complete'))
        self.assertEqual(self.rows('SELECT detail_status FROM kcs_press_release_v1')[0][0], 'complete')


if __name__ == '__main__':
    unittest.main(verbosity=2)
