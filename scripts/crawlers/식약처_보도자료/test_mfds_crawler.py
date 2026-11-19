# -*- coding: utf-8 -*-
import contextlib
import hashlib
import http.client
import io
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest import mock
from email.message import Message
from urllib.parse import urlsplit, parse_qs

import mfds_crawler as m


def item(seq, number=None, title='폐지·제정 보도자료', notice=False):
    number = '공지' if notice else str(seq if number is None else number)
    return ('<li><div class="num">%s</div><div class="center_column">'
            '<a class="title" href="./view.do?seq=%s&amp;page=1">%s</a></div>'
            '<div class="right_column">2026-11-13</div></li>' % (number, seq, title))


def list_html(page=1, total=2, last=1, rows=None):
    if rows is None:
        rows = [item(100), item(101), item(999, notice=True)]
    return ('<div class="bbs_data_info">전체 <b>%s</b>건, 현재페이지 <b>%s</b>/%s</div>'
            '<div class="bbs_list01"><ul>%s</ul></div>' % (total, page, last, ''.join(rows)))


def detail_html(seq=100, attachment=True, filename='공고 CON!.XYZ'):
    box = ''
    if attachment:
        rows = []
        for n, name in [(1, filename), (2, '확장자 없는 파일'), (3, '공고 CON!.XYZ')]:
            rows.append('<li><div class="bbs_file_cont"><strong>%s</strong>'
                        '<a class="bbs_icon_filedown" href="./down.do?brd_id=ntc0021&amp;seq=%s&amp;data_tp=A&amp;file_seq=%s">다운받기</a>'
                        '</div></li>' % (name, seq, n))
        box = '<div class="bv_file_box"><strong>첨부파일</strong><ul class="bbs_file_view_list">%s</ul></div>' % ''.join(rows)
    return ("<script>var x={brd_seq:'%s'};</script><div class='bbs_view01'>"
            '<div class="bv_title"><!-- 무시 -->제목 &amp; 내용</div>'
            '<div class="bv_txt01"><ul><li><span>등록일</span> 2026-11-13</li>'
            '<li><span>조회수</span> 42</li></ul></div>'
            '<div class="bv_contents"><div class="bv_cont"><p>첫 줄<br>둘째 &amp; 셋째</p>'
            '<p><b>본문</b></p></div>%s</div>'
            '<div class="bbs_sat_header"><p><strong>부서</strong><span>보도과</span></p>'
            '<p><strong>담당자</strong><span>홍길동</span></p>'
            '<p><span><i>전화</i> 123-456</span></p></div></div>' % (seq, box))


class Response(io.BytesIO):
    def __init__(self, body, url='https://www.mfds.go.kr/brd/m_99/down.do', content_type='application/octet-stream', length=None, disposition='attachment'):
        super().__init__(body)
        self.url, self.status = url, 200
        self.headers = Message()
        self.headers['Content-Type'] = content_type
        self.headers['Content-Disposition'] = disposition
        if length is not None:
            self.headers['Content-Length'] = str(length)


class ParsingTests(unittest.TestCase):
    def test_real_structure_all_rows_and_notice(self):
        out = m.parse_list(list_html(), m.list_url(1), 1)
        self.assertEqual([x['seq'] for x in out['items']], [100, 101, 999])
        self.assertEqual(out['items'][0]['title'], '폐지·제정 보도자료')
        self.assertEqual(out['items'][2]['is_notice'], 1)
        self.assertEqual((out['total'], out['last']), (2, 1))
        notices = m.parse_list(list_html(total=1, rows=[item(999, notice=True)]), m.list_url(1), 1)
        self.assertEqual([i['seq'] for i in notices['items']], [999])

    def test_page_parameter_is_not_constant(self):
        self.assertEqual(parse_qs(urlsplit(m.list_url(1)).query)['page'], ['1'])
        self.assertEqual(parse_qs(urlsplit(m.list_url(2)).query)['page'], ['2'])
        with self.assertRaises(m.CrawlError):
            m.parse_list(list_html(page=1), m.list_url(2), 2)
        with self.assertRaises(m.CrawlError):
            m.parse_list('<html>로그인</html>', m.list_url(1), 1)
        with self.assertRaises(m.CrawlError):
            m.parse_list(list_html(rows=[]), m.list_url(1), 1)
        with self.assertRaises(m.CrawlError):
            m.parse_list(list_html(rows=[item(100)]), m.list_url(1), 1)

    def test_detail_text_html_metadata_and_all_extensions(self):
        result = m.parse_detail(detail_html(), 'https://www.mfds.go.kr/brd/m_99/view.do?seq=100', 100)
        self.assertEqual(result['title'], '제목 & 내용')
        self.assertEqual(result['body_text'], '첫 줄\n둘째 & 셋째\n본문')
        self.assertIn('<b>본문</b>', result['body_html'])
        self.assertEqual(result['published_date'], '2026-11-13')
        self.assertEqual(result['view_count'], '42')
        self.assertEqual(result['department'], '보도과')
        self.assertEqual(result['contact'], '홍길동')
        self.assertEqual(result['phone'], '123-456')
        self.assertEqual([a['file_seq'] for a in result['attachments']], [1, 2, 3])
        self.assertEqual(result['attachments'][1]['original_name'], '확장자 없는 파일')
        self.assertIn('file_seq=3', result['attachments'][2]['url'])
        with self.assertRaises(m.CrawlError):
            m.parse_detail(detail_html(seq=200), 'https://www.mfds.go.kr/brd/m_99/view.do?seq=100', 100)
        malformed = detail_html().replace('class="bbs_file_cont"', 'class="changed"', 1)
        with self.assertRaises(m.CrawlError):
            m.parse_detail(malformed, 'https://www.mfds.go.kr/brd/m_99/view.do?seq=100', 100)

    def test_windows_safe_filename(self):
        self.assertEqual(m.safe_filename('CON.txt'), '_CON.txt')
        self.assertEqual(m.safe_filename('lpt1'), '_lpt1')
        self.assertNotRegex(m.safe_filename('a<>:"/\\|?*\x01.txt'), r'[<>:"/\\|?*\x01]')
        long_name = m.safe_filename('한' * 400 + '.pdf')
        self.assertLessEqual(len(long_name.encode('utf-8')), 150)
        self.assertTrue(long_name.endswith('.pdf'))

    def test_listed_attachment_and_image_notice(self):
        row = item(100).replace('<div class="num">100</div>',
                                '<div class="num"><img alt="공지"></div>')
        attachment = ('<ul class="bbs_file_list"><li><div class="bbs_file_list_header">'
                      '<span>별도.dat</span><a href="./down.do?seq=100&amp;file_seq=9">받기</a>'
                      '</div></li></ul>')
        row = row.replace('<div class="right_column">', attachment + '<div class="right_column">')
        parsed = m.parse_list(list_html(total=1, rows=[row, item(101)]), m.list_url(1), 1)
        self.assertEqual(parsed['items'][0]['is_notice'], 1)
        self.assertEqual(parsed['items'][0]['listed_files'][0]['file_seq'], 9)
        self.assertEqual(parsed['items'][0]['listed_files'][0]['original_name'], '별도.dat')


class HTTPTests(unittest.TestCase):
    def test_good_download_and_all_extensions(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = m.Client(timeout=1, retries=0, delay=0)
            payload = b'hello random binary\x00\x01'
            target = os.path.join(tmp, '100_1_weird.XYZ')
            with mock.patch.object(client, 'open', return_value=Response(payload, length=len(payload))):
                size, sha, ctype = client.download('https://www.mfds.go.kr/brd/m_99/down.do', target, 'weird.XYZ')
            self.assertEqual(Path(target).read_bytes(), payload)
            self.assertEqual((size, sha, ctype), (len(payload), hashlib.sha256(payload).hexdigest(), 'application/octet-stream'))
            self.assertEqual(os.listdir(tmp), ['100_1_weird.XYZ'])

    def test_html_error_and_partial_dont_overwrite_existing_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'file.pdf')
            Path(path).write_bytes(b'old valid file')
            client = m.Client(timeout=1, retries=0, delay=0)
            for response in [Response(b'<!doctype html><html>Login Required</html>'),
                             Response(b'<!-- server -->\n<script>location.href="/login"</script>'),
                             Response(b'partial', length=100), Response(b'')]:
                with self.subTest(response=response), mock.patch.object(client, 'open', return_value=response):
                    with self.assertRaises(m.CrawlError):
                        client.download('https://www.mfds.go.kr/brd/m_99/down.do', path, 'file.pdf')
                    self.assertEqual(Path(path).read_bytes(), b'old valid file')
                    self.assertEqual(os.listdir(tmp), ['file.pdf'])

    def test_incomplete_read_retried(self):
        client = m.Client(retries=1, delay=0)
        seq = [http.client.IncompleteRead(b'abc', 100), 'success']
        def op():
            v = seq.pop(0)
            if isinstance(v, Exception):
                raise v
            return v
        with mock.patch('time.sleep'):
            self.assertEqual(client.attempt(op), 'success')
        with mock.patch('time.sleep'), self.assertRaises(m.CrawlError):
            client.attempt(lambda: (_ for _ in ()).throw(http.client.IncompleteRead(b'partial', 10)))

    def test_html_file_allowed_only_as_download_not_error_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = os.path.join(tmp, 'file.html')
            client = m.Client(retries=0, delay=0)
            page = b'<!doctype html><html><body>archive</body></html>'
            with mock.patch.object(client, 'open', return_value=Response(page, content_type='text/html')):
                client.download('https://www.mfds.go.kr/brd/m_99/down.do', target, 'real.html')
            self.assertEqual(Path(target).read_bytes(), page)
            with mock.patch.object(client, 'open', return_value=Response(page, content_type='text/html', disposition='inline')):
                with self.assertRaises(m.CrawlError):
                    client.download('https://www.mfds.go.kr/brd/m_99/down.do', target, 'real.html')


class DBTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = sqlite3.connect(os.path.join(self.tmp.name, 'test.db'))
        self.db.row_factory = sqlite3.Row
        self.db.execute('create table sentinel(value text)')
        self.db.execute("insert into sentinel values ('untouched')")
        self.db.commit()
        m.initialize(self.db)
        self.entry = m.parse_list(list_html(), m.list_url(1), 1)['items'][0]
        self.detail = m.parse_detail(detail_html(), self.entry['url'], 100)
        m.upsert_article(self.db, self.entry, self.detail)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def test_success_then_failed_detail_does_not_damage(self):
        before = dict(self.db.execute('select * from mfds_press_articles where seq=100').fetchone())
        changed = dict(self.entry, title='bad new title')
        m.upsert_article(self.db, changed, error='partial page')
        after = dict(self.db.execute('select * from mfds_press_articles where seq=100').fetchone())
        for field in ('title', 'body_text', 'body_html', 'crawl_status', 'metadata_json'):
            self.assertEqual(before[field], after[field])
        self.assertEqual(after['last_error'], 'partial page')
        self.assertEqual(self.db.execute('select value from sentinel').fetchone()[0], 'untouched')

    def test_attachment_failure_recovery_then_failed_refresh(self):
        att = self.detail['attachments'][0]
        client = mock.Mock()
        client.download.side_effect = m.CrawlError('temporary failure')
        self.assertFalse(m.save_attachment(self.db, client, 100, att, self.tmp.name))
        row = self.db.execute('select * from mfds_press_attachments').fetchone()
        self.assertEqual(row['status'], 'failed')
        self.assertIn('temporary failure', row['last_error'])
        def success(url, path, name):
            Path(path).write_bytes(b'new valid file')
            return 14, hashlib.sha256(b'new valid file').hexdigest(), 'application/octet-stream'
        client.download.side_effect = success
        self.assertTrue(m.save_attachment(self.db, client, 100, att, self.tmp.name))
        row = self.db.execute('select * from mfds_press_attachments').fetchone()
        self.assertEqual(row['status'], 'downloaded')
        self.assertIsNone(row['last_error'])
        path = row['saved_path']
        self.assertEqual(Path(path).read_bytes(), b'new valid file')
        client.download.side_effect = m.CrawlError('refresh failed')
        self.assertFalse(m.save_attachment(self.db, client, 100, att, self.tmp.name, redownload=True))
        row2 = self.db.execute('select * from mfds_press_attachments').fetchone()
        self.assertEqual(row2['status'], 'downloaded')
        self.assertEqual(row2['saved_path'], path)
        self.assertEqual(row2['sha256'], row['sha256'])
        self.assertEqual(Path(path).read_bytes(), b'new valid file')
        self.assertIn('refresh failed', row2['last_error'])

    def test_changed_attachment_name_failure_preserves_old_success(self):
        att = self.detail['attachments'][0]
        client = mock.Mock()
        def success(url, path, name):
            Path(path).write_bytes(b'old')
            return 3, hashlib.sha256(b'old').hexdigest(), 'x/test'
        client.download.side_effect = success
        self.assertTrue(m.save_attachment(self.db, client, 100, att, self.tmp.name))
        old = dict(self.db.execute('select * from mfds_press_attachments').fetchone())
        client.download.side_effect = m.CrawlError('failed')
        self.assertFalse(m.save_attachment(self.db, client, 100, dict(att, original_name='새이름.hwp'), self.tmp.name))
        new = dict(self.db.execute('select * from mfds_press_attachments').fetchone())
        for k in ('status', 'original_name', 'url', 'saved_path', 'sha256'):
            self.assertEqual(new[k], old[k])
        self.assertEqual(Path(new['saved_path']).read_bytes(), b'old')

    def test_all_pages_and_every_attachment(self):
        pages = {1: list_html(page=1, total=11, last=2, rows=[item(i, number=i) for i in range(100, 110)]),
                 2: list_html(page=2, total=11, last=2, rows=[item(110)])}
        calls, downloads = [], []
        class FakeClient:
            def page(self, url):
                calls.append(url)
                q = parse_qs(urlsplit(url).query)
                if urlsplit(url).path.endswith('/list.do'):
                    return pages[int(q['page'][0])]
                return detail_html(int(q['seq'][0]))
            def download(self, url, path, name):
                downloads.append(url)
                Path(path).write_bytes(url.encode())
                return len(url.encode()), hashlib.sha256(url.encode()).hexdigest(), 'x/test'
        failures = m.crawl(self.db, FakeClient(), 1, None, self.tmp.name)
        self.assertEqual(failures, 0)
        list_calls = [x for x in calls if urlsplit(x).path.endswith('/list.do')]
        self.assertEqual([parse_qs(urlsplit(x).query)['page'][0] for x in list_calls], ['1', '2'])
        self.assertEqual(len(downloads), 33)
        self.assertEqual(self.db.execute('select count(*) from mfds_press_articles').fetchone()[0], 11)
        self.assertEqual(self.db.execute("select count(*) from mfds_press_attachments where status='downloaded'").fetchone()[0], 33)
        paths = [r[0] for r in self.db.execute('select saved_path from mfds_press_attachments')]
        self.assertEqual(len(set(paths)), 33)
        self.assertTrue(all(os.path.isfile(p) for p in paths))


class CLITests(unittest.TestCase):
    def test_positional_switches_and_ini(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = ['--db', os.path.join(tmp, 'db'), '--download-dir', tmp]
            for args, expected in [(['--from', '1', '--to', '10'], (1, 10)), (['1', '10'], (1, 10)),
                                   (['1'], (1, 1)), (['all'], (1, None)), ([], (1, 1))]:
                with self.subTest(args=args):
                    a = m.parse_options(args + base)
                    self.assertEqual((a.start, a.end), expected)
            cfg = Path(tmp, 'test.ini')
            cfg.write_text('[crawler]\nfrom_page=3\nto_page=6\ndelay=1\n', encoding='utf-8')
            a = m.parse_options(base + ['--config', str(cfg)])
            self.assertEqual((a.start, a.end, a.delay), (3, 6, 1))
            cfg.write_text('[crawler]\nstart_page=4\nend_page=8\ndelay=1\n', encoding='utf-8')
            a = m.parse_options(base + ['--config', str(cfg)])
            self.assertEqual((a.start, a.end, a.delay), (4, 8, 1))
            a = m.parse_options(['2'] + base + ['--config', str(cfg)])
            self.assertEqual((a.start, a.end), (2, 2))
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as e:
                m.parse_options(['--from', '5', '--to', '2'] + base)
            self.assertEqual(e.exception.code, 2)

    def test_attachment_failure_exits_nonzero_and_records_each(self):
        with tempfile.TemporaryDirectory() as tmp:
            dbfile = os.path.join(tmp, 'db')
            rows = [item(100, number=1)]
            def page(client, url):
                if 'list.do' in url:
                    return list_html(total=1, rows=rows)
                return detail_html()
            with mock.patch.object(m.Client, 'page', page), \
                 mock.patch.object(m.Client, 'download', side_effect=m.CrawlError('HTTP 404')), \
                 mock.patch.object(m, 'configure_logging'):
                code = m.main(['1', '--db', dbfile, '--download-dir', os.path.join(tmp, 'files'),
                               '--log-dir', os.path.join(tmp, 'logs')])
            self.assertEqual(code, 1)
            with sqlite3.connect(dbfile) as db:
                self.assertEqual(db.execute("select count(*) from mfds_press_attachments where status='failed' and last_error like '%404%'").fetchone()[0], 3)
                self.assertEqual(db.execute("select count(*) from mfds_press_articles where crawl_status='complete'").fetchone()[0], 1)

    def test_mismatch_downloads_listed_item_but_is_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            dbfile = os.path.join(tmp, 'db')
            row = item(100, number=1)
            listed = ('<ul class="bbs_file_list"><li><div class="bbs_file_list_header">'
                      '<span>숨겨진.bin</span><a href="./down.do?seq=100&amp;file_seq=9">받기</a>'
                      '</div></li></ul>')
            row = row.replace('<div class="right_column">', listed + '<div class="right_column">')
            def page(client, url):
                return list_html(total=1, rows=[row]) if 'list.do' in url else detail_html(attachment=False)
            def download(client, url, path, name):
                Path(path).write_bytes(b'file')
                return 4, hashlib.sha256(b'file').hexdigest(), 'application/octet-stream'
            with mock.patch.object(m.Client, 'page', page), mock.patch.object(m.Client, 'download', download), \
                 mock.patch.object(m, 'configure_logging'):
                code = m.main(['1', '--db', dbfile, '--download-dir', tmp, '--log-dir', tmp])
            self.assertEqual(code, 1)
            with sqlite3.connect(dbfile) as db:
                self.assertEqual(db.execute('select file_seq,status from mfds_press_attachments').fetchall(), [(9, 'downloaded')])


if __name__ == '__main__':
    unittest.main()
