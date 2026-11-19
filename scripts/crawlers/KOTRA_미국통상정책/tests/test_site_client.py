"""Tests against synthetic fixtures only; they never contact KOTRA."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from site_client import SiteClient, SiteError


class Response:
    def __init__(self, data=None, content=b'', headers=None, status=200, url='https://dream.kotra.or.kr/detail'):
        self.data = data
        self.content = content
        self.headers = headers or {}
        self.status_code = status
        self.url = url
        self.encoding = 'utf-8'
    def json(self): return self.data
    def close(self): pass
    def raise_for_status(self): pass
    def iter_content(self, chunk_size=65536):
        yield self.content


class ClientTests(unittest.TestCase):
    def setUp(self):
        self.client = SiteClient(delay=0, retries=0)

    def test_empty_results_and_malformed_record(self):
        self.client._request = Mock(return_value=Response(data={'list': [], 'totalCount': 0}))
        self.assertEqual(self.client.get_list(1), {'items': [], 'has_next': False})
        self.client._request = Mock(return_value=Response(data={'list': [{'NTT_SJ': '제목'}]}))
        with self.assertRaises(SiteError): self.client.get_list(1)
        self.client._request = Mock(return_value=Response(data={'list': [], 'totalCount': 20}))
        with self.assertRaises(SiteError): self.client.get_list(1)

    def test_list_retains_raw_data_and_dates(self):
        row = {'NTT_SN':'123','NTT_SJ':'테스트','OTHBC_DT_NM':'2026.09.14','BBS_NAME':'폐지제정'}
        self.client._request = Mock(return_value=Response(data={'list': [row], 'totalCount': 1}))
        item = self.client.get_list(1)['items'][0]
        self.assertEqual(item['published_date'], '2026-09-14')
        self.assertEqual(item['raw_list']['BBS_NAME'], '폐지제정')
        self.assertIn('/actionKotraBoardDetail.do?', item['url'])
        self.assertEqual(SiteClient._date('2026-99-99'), '')

    def test_body_and_attachment_on_synthetic_html(self):
        html = '''<html><head></head><body><div class="view_cont"><p>첫 문단</p><table><tr><td>표 내용</td></tr></table></div><div class="file_list"><a href="/file/download.do?fileId=1">보고서.pdf</a></div></body></html>'''
        self.client._request = Mock(return_value=Response(content=html.encode()))
        item = {'article_id':'123','title':'제목','published_date':'2026-09-14',
                'url':'https://dream.kotra.or.kr/detail', 'raw_list':{'BBS_NAME':'폐지'}}
        result = self.client.get_article(item)
        self.assertIn('<table>', result['body_html'])
        self.assertIn('표 내용', result['body_text'])
        self.assertEqual(result['attachments'][0]['filename'], '보고서.pdf')
        self.assertEqual(result['raw_list']['BBS_NAME'], '폐지')

    def test_redirect_to_other_host_is_blocked(self):
        self.client.session.request = Mock(return_value=Response(status=302, headers={'Location':'https://other.example/file'}))
        with self.assertRaises(SiteError): self.client._request('GET', 'https://dream.kotra.or.kr/file')
        self.assertEqual(self.client.session.request.call_count, 1)

    def test_download_is_atomic_and_html_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / 'result.pdf'
            dest.write_bytes(b'old')
            self.client._request = Mock(return_value=Response(content=b'<html>login</html>', headers={'Content-Type':'text/html'}))
            with self.assertRaises(SiteError):
                self.client.download_attachment({'url':'https://dream.kotra.or.kr/file'}, dest)
            self.assertEqual(dest.read_bytes(), b'old')
            self.client._request = Mock(return_value=Response(content=b'%PDF new', headers={'Content-Type':'application/pdf'}))
            self.client.download_attachment({'url':'https://dream.kotra.or.kr/file'}, dest)
            self.assertEqual(dest.read_bytes(), b'%PDF new')
            self.assertEqual(len(list(Path(tmp).iterdir())), 1)

    def test_runtime_robots_guard_prevents_request(self):
        self.client.can_fetch = lambda url: False
        self.client.session.request = Mock()
        with self.assertRaises(SiteError): self.client._request('GET', 'https://dream.kotra.or.kr/file')
        self.client.session.request.assert_not_called()


if __name__ == '__main__':
    unittest.main()
