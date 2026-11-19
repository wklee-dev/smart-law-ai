"""Offline tests: no network requests or writes to the user's actual database."""
from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import run
import site_client


class FakeSite:
    calls = []
    bad_article = None
    missing_date = None
    fail_attachment = False
    records = {
        1: [dict(article_id='101', title='첫 기사', published_date='2026-09-14', url='https://dream.kotra.or.kr/a', raw_list={'BBS_NAME':'폐지제정'})],
        2: [dict(article_id='102', title='둘째 기사', published_date='2026-09-20', url='https://dream.kotra.or.kr/b', raw_list={'BBS_NAME':'일반'})],
        3: [dict(article_id='103', title='셋째 기사', published_date='2026-09-21', url='https://dream.kotra.or.kr/c', raw_list={'BBS_NAME':'일반'})],
    }

    def __init__(self, **kwargs):
        pass

    def get_list(self, page_no, start_date=None, end_date=None):
        self.calls.append(page_no)
        records = [dict(x) for x in self.records.get(page_no, [])]
        if self.missing_date:
            for x in records:
                if x['article_id'] == self.missing_date:
                    x['published_date'] = ''
        return {'items': records, 'has_next': page_no < 3}

    def get_article(self, item):
        if item['article_id'] == self.bad_article:
            raise site_client.SiteError('fixture: 상세 응답 오류')
        result = dict(item)
        result.update(body_html='<div><p>본문</p><table><tr><td>표</td></tr></table></div>',
                      body_text='본문\n표', author='작성자', office='무역관', keywords='무역', attachments=[])
        if item['article_id'] == '101':
            result['attachments'] = [
                dict(file_id='a1', filename='동일한 파일.pdf', url='https://dream.kotra.or.kr/download?id=1'),
                dict(file_id='a2', filename='동일한 파일.pdf', url='https://dream.kotra.or.kr/download?id=2')]
        return result

    def download_attachment(self, attachment, dest_path):
        if self.fail_attachment:
            raise site_client.SiteError('fixture: 다운로드 실패')
        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        Path(dest_path).write_bytes(b'%PDF-1.4 test')


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.db = self.root / 'legacy.db'
        with sqlite3.connect(self.db) as c:
            c.execute('CREATE TABLE legacy_data (value TEXT)')
            c.execute("INSERT INTO legacy_data VALUES ('unchanged')")
        self.dl = self.root / 'downloads'
        self.logs = self.root / 'logs'
        FakeSite.calls = []
        FakeSite.bad_article = None
        FakeSite.missing_date = None
        FakeSite.fail_attachment = False
        self.patches = [patch.object(run, 'robots_allowed', return_value=(True, 'fixture permitted')),
                        patch.object(site_client, 'SiteClient', FakeSite)]
        for p in self.patches: p.start()

    def tearDown(self):
        for p in self.patches: p.stop()
        self.tmp.cleanup()

    def execute(self, *args):
        return run.main(['crawl', *args, '--db', str(self.db), '--download-dir', str(self.dl),
                         '--log-dir', str(self.logs), '--delay', '0'])

    def query(self, sql):
        with sqlite3.connect(self.db) as c:
            return c.execute(sql).fetchall()

    def test_all_pages_and_repeated_execution_are_idempotent(self):
        self.assertEqual(self.execute('all'), 0)
        self.assertEqual(FakeSite.calls, [1,2,3])
        self.assertEqual(self.query('select count(*) from kotra_us_trade_articles')[0][0], 3)
        self.assertEqual(self.query('select value from legacy_data'), [('unchanged',)])
        self.assertEqual(self.query('select count(*) from kotra_us_trade_attachments')[0][0], 2)
        files_before = sorted(str(p.relative_to(self.dl)) for p in self.dl.rglob('*') if p.is_file())
        self.assertEqual(len(files_before), 2)
        self.assertEqual(self.execute('all'), 0)
        self.assertEqual(self.query('select count(*) from kotra_us_trade_articles')[0][0], 3)
        self.assertEqual(self.query('select count(*) from kotra_us_trade_attachments')[0][0], 2)
        self.assertEqual(files_before, sorted(str(p.relative_to(self.dl)) for p in self.dl.rglob('*') if p.is_file()))
        raw = self.query("select raw_list_json from kotra_us_trade_articles where article_id='101'")[0][0]
        self.assertIn('폐지제정', raw)
        html = self.query("select body_html from kotra_us_trade_articles where article_id='101'")[0][0]
        self.assertIn('<table>', html)

    def test_iso_week_filters_inclusively(self):
        self.assertEqual(run.week_dates(2026, 38)[0].isoformat(), '2026-09-14')
        self.assertEqual(run.week_dates(2026, 38)[1].isoformat(), '2026-09-20')
        self.assertEqual(self.execute('--year','2026','--week','38'), 0)
        self.assertEqual(self.query('select article_id from kotra_us_trade_articles order by article_id'), [('101',),('102',)])

    def test_page_range(self):
        self.assertEqual(self.execute('--from','2','--to','3'), 0)
        self.assertEqual(FakeSite.calls, [2,3])
        self.assertEqual(self.query('select article_id from kotra_us_trade_articles order by article_id'), [('102',),('103',)])

    def test_detail_failure_is_reported_and_later_articles_continue(self):
        FakeSite.bad_article = '101'
        self.assertEqual(self.execute('all'), 1)
        self.assertEqual(self.query('select article_id from kotra_us_trade_articles order by article_id'), [('102',),('103',)])
        self.assertTrue(list(self.logs.glob('*.log')))

    def test_missing_date_does_not_silently_succeed(self):
        FakeSite.missing_date = '101'
        self.assertEqual(self.execute('--year','2026','--week','38'), 1)
        self.assertIn(('102',), self.query('select article_id from kotra_us_trade_articles'))

    def test_bad_page_input_is_rejected(self):
        for args in [('--page','0'), ('1','2','3'), ('1','--from','1','--to','2')]:
            with self.subTest(args=args), self.assertRaises(SystemExit) as e:
                self.execute(*args)
            self.assertEqual(e.exception.code, 2)

    def test_policy_blocks_before_database_access(self):
        self.db.unlink()
        with patch.object(run, 'robots_allowed', return_value=(False, 'blocked')):
            self.assertNotEqual(self.execute('all'), 0)
        self.assertFalse(self.db.exists())


if __name__ == '__main__':
    unittest.main()
