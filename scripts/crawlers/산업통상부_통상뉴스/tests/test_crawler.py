import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fta_crawler as c
from storage import open_database


def listing(rows, total=30):
    content = "".join(
        "<tr><td>3</td><td><div class='board-link'><a href='#' onclick='goView(%s)'><i>%s</i></a></div></td><td>%s</td><td>12</td></tr>" % r
        for r in rows
    )
    return "<div class='board-count'><i>%s</i></div><div class='board-list'><table><tbody>%s</tbody></table></div>" % (total, content)


def detail(title="시험 기사", d="2026-11-13"):
    return """<div class='board-detail'><div class='detail-tit'>%s</div>
    <div class='detail-info'><ul><li><div class='tit'>등록일</div><div><p>%s</p></div></li></ul></div>
    <div class='detail-cont'><p><span>한</span><span>글 본문</span></p><table><tr><td>값1</td><td>값2</td></tr></table>
    <img src='/images/example.png'><a href='https://example.com/source'>출처</a></div>
    <div class='detail-file'><a href='/download?file=1'>파일.hwp</a></div></div>""" % (title, d)


class FakeResponse:
    def __init__(self, text):
        self.text = text
        self.encoding = None
    def __enter__(self): return self
    def __exit__(self, *args): return False


class FakeCrawler(c.Crawler):
    def __init__(self, db, responses):
        super().__init__(db, tempfile.gettempdir(), 0, 1)
        self.responses = responses
        self.requests = []
    def get(self, url, **kwargs):
        if url == c.LIST_URL:
            page = kwargs["params"]["pageNum"]
            self.requests.append(page)
            return FakeResponse(self.responses[page])
        return FakeResponse(detail())
    def download(self, *args):
        pass


class CrawlerTests(unittest.TestCase):
    def test_page_selection(self):
        for text, result in [("1", (1, 1)), ("2 5", (2, 5)), ("2~5", (2, 5)),
                             ("2 ~ 5", (2, 5)), ("2-5", (2, 5)), ("all", (1, None))]:
            with self.subTest(text=text):
                self.assertEqual(c.parse_page_selection(text), result)
        for text in ("0", "5~2", "1~3~5", "a", "all 2"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                c.parse_page_selection(text)

    def test_list_parsing_and_date(self):
        rows, total = c.parse_list(listing([("146224", "제목", "2026-11-13")]), 3)
        self.assertEqual(total, 30)
        self.assertEqual(rows[0]["article_id"], "146224")
        self.assertEqual(rows[0]["registered_date"], "2026-11-13")
        self.assertEqual(rows[0]["list_page"], 3)
        self.assertEqual(rows[0]["view_count"], 12)

    def test_invalid_list_not_silently_empty(self):
        with self.assertRaises(ValueError): c.parse_list("<html>denied</html>", 1)
        broken = listing([("146224", "제목", "2026-11-13")]).replace("goView(146224)", "missing()")
        with self.assertRaises(ValueError): c.parse_list(broken, 1)

    def test_detail_html_text_and_assets(self):
        row = {"article_id": "1", "title": "list", "registered_date": "2026-11-13", "list_page": 1, "view_count": 2}
        obj, assets = c.parse_detail(detail(), "https://example.com/view", row)
        self.assertEqual(obj["title"], "시험 기사")
        self.assertIn("한글 본문", obj["body_text"])
        self.assertIn("<table>", obj["body_html"])
        self.assertEqual({a["kind"] for a in assets}, {"image", "attachment"})
        self.assertEqual(len(assets), 2)
        self.assertTrue(any(a["source_url"] == "https://example.com/images/example.png" for a in assets))
        self.assertFalse(any(a["source_url"] == "https://example.com/source" for a in assets))

    def test_unsupported_script_attachment_is_not_silently_ignored(self):
        html = detail().replace("<a href='/download?file=1'>파일.hwp</a>", "<a href='#' onclick='fileDown(7)'>파일.hwp</a>")
        soup = c.BeautifulSoup(html, "html.parser")
        assets = c.discover_assets(soup, "https://example.com/view")
        attachment = next(a for a in assets if a["kind"] == "attachment")
        self.assertIn("unsupported_error", attachment)
        self.assertEqual(attachment["source_url"], "https://example.com/view")

    def test_filename_traversal_reserved(self):
        self.assertNotIn("/", c.safe_filename("../secret?.hwp"))
        self.assertEqual(c.safe_filename("CON.txt"), "_CON.txt")
        self.assertEqual(c.safe_filename(""), "file")

    def test_download_failure_then_retry_and_cached_file(self):
        from storage import save_article
        db = open_database(":memory:")
        save_article(db, {"article_id": "1", "title": "test", "registered_date": "2026-11-13",
                          "source_url": "https://example.com", "body_text": "text", "body_html": "<p>text</p>"})
        asset = {"asset_key": c.asset_key("attachment", "https://example.com/download"),
                 "kind": "attachment", "original_name": "test.hwp", "source_url": "https://example.com/download"}
        class BinaryResponse:
            headers = {"Content-Type": "application/octet-stream"}
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def iter_content(self, chunk_size): yield b"example binary"
        try:
            with tempfile.TemporaryDirectory() as folder:
                crawler = c.Crawler(db, folder, 0, 1)
                try:
                    with patch.object(crawler, "get", side_effect=OSError("offline")):
                        with self.assertRaises(OSError): crawler.download("1", asset, "https://example.com/view")
                    self.assertEqual(db.execute("select status from fta_trade_news_assets").fetchone()[0], "failed")
                    with patch.object(crawler, "get", return_value=BinaryResponse()) as get:
                        crawler.download("1", asset, "https://example.com/view")
                        self.assertEqual(get.call_count, 1)
                        crawler.download("1", asset, "https://example.com/view")
                        self.assertEqual(get.call_count, 1)
                    status, path, error = db.execute("select status,saved_path,error_message from fta_trade_news_assets").fetchone()
                    self.assertEqual(status, "downloaded")
                    self.assertIsNone(error)
                    self.assertEqual(Path(path).read_bytes(), b"example binary")
                finally: crawler.session.close()
        finally: db.close()

    def test_page_range_includes_all_dates_and_never_stops_on_old_date(self):
        rows1 = [("1", "A", "2026-11-13"), ("2", "B", "2026-11-06")]
        rows2 = [("3", "C", "2014-01-01")]
        pages = {1: listing(rows1, 20), 2: listing(rows2, 20)}
        db = open_database(":memory:")
        try:
            crawler = FakeCrawler(db, pages)
            try:
                self.assertEqual(crawler.run(1, 2), 0)
                self.assertEqual(crawler.requests, [1, 2])
                self.assertEqual(db.execute("select article_id from fta_trade_news_articles order by article_id").fetchall(), [("1",), ("2",), ("3",)])
            finally: crawler.session.close()
        finally: db.close()

    def test_all_scans_every_row(self):
        pages = {1: listing([("1", "A", "2026-11-13"), ("2", "B", "2026-11-06")], 2)}
        db = open_database(":memory:")
        try:
            crawler = FakeCrawler(db, pages)
            try:
                self.assertEqual(crawler.run(1, None), 0)
                self.assertEqual(db.execute("select count(*) from fta_trade_news_articles").fetchone()[0], 2)
            finally: crawler.session.close()
        finally: db.close()

    def test_cli_defaults_range_all_and_invalid(self):
        cfg = str(Path(__file__).resolve().parents[1] / "config.ini")
        for argv, expected in [(["1"], (1, 1)), (["2", "5"], (2, 5)),
                               (["2~5"], (2, 5)), (["--from", "2", "--to", "5"], (2, 5)),
                               (["all"], (1, None))]:
            _, start, end, *_ = c.parse_options(["--config", cfg] + argv)
            self.assertEqual((start, end), expected)
        with patch("sys.stderr"):
            with self.assertRaises(SystemExit): c.parse_options(["--config", cfg, "--year", "2026"])
            with self.assertRaises(SystemExit): c.parse_options(["--config", cfg, "--from", "2"])
            with self.assertRaises(SystemExit): c.parse_options(["--config", cfg, "0"])
            with self.assertRaises(SystemExit): c.parse_options(["--config", cfg, "5", "2"])
            with self.assertRaises(SystemExit): c.parse_options(["--config", cfg, "1", "--from", "2", "--to", "5"])

    def test_interactive_page_input_and_default(self):
        cfg = str(Path(__file__).resolve().parents[1] / "config.ini")
        for user_input, expected in [("1", (1, 1)), ("2 5", (2, 5)), ("2~5", (2, 5)),
                                     ("all", (1, None)), ("", (1, 1))]:
            with self.subTest(user_input=user_input), patch("builtins.input", return_value=user_input):
                _, start, end, *_ = c.parse_options(["--config", cfg])
                self.assertEqual((start, end), expected)
        with patch("builtins.input", side_effect=EOFError):
            _, start, end, *_ = c.parse_options(["--config", cfg])
            self.assertEqual((start, end), (1, 1))


if __name__ == "__main__":
    unittest.main()
