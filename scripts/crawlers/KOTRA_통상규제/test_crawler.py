"""Offline contract tests for the KOTRA crawler.

Run with: python -m unittest -v test_crawler
No real HTTP requests are made. All DBs and downloaded files live in tempdirs.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlsplit

import requests

import run
import storage


class OfflineCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="kotra-tests-")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.db = self.root / "existing.db"
        self.cfg = dict(run.DEFAULTS)
        self.cfg.update({
            "db": str(self.db),
            "downloads": str(self.root / "downloads"),
            "log_dir": str(self.root / "logs"),
            "delay_seconds": "0",
        })
        # Defense in depth: any unexpectedly unmocked HTTP or socket connection
        # fails instead of contacting a site.
        for target in ("requests.sessions.Session.request", "socket.socket.connect",
                       "socket.socket.connect_ex"):
            p = mock.patch(target, side_effect=AssertionError("Network is forbidden in tests"))
            p.start()
            self.addCleanup(p.stop)
        p = mock.patch.object(run.LOG, "disabled", True)
        p.start()
        self.addCleanup(p.stop)

    def opts(self, *args, cfg=None):
        with contextlib.redirect_stderr(io.StringIO()):
            parsed = run.create_parser().parse_args(["crawl", *args])
        return run.settings(parsed, cfg or self.cfg)

    def assert_rejected(self, *args):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises((ValueError, SystemExit, argparse.ArgumentTypeError)):
                parsed = run.create_parser().parse_args(["crawl", *args])
                run.settings(parsed, self.cfg)


class DateAndPageTests(OfflineCase):
    def test_iso_2026_week_38_is_monday_through_sunday(self):
        opts = self.opts("--year", "2026", "--week", "38")
        self.assertEqual((opts["start"], opts["end"]),
                         (dt.date(2026, 9, 14), dt.date(2026, 9, 20)))
        self.assertEqual((opts["first"], opts["last"]), (1, None))

    def test_iso_leap_week_and_year_boundary(self):
        opts = self.opts("--year", "2020", "--week", "9")
        self.assertEqual((opts["start"], opts["end"]),
                         (dt.date(2020, 2, 24), dt.date(2020, 3, 1)))
        opts = self.opts("--year", "2020", "--week", "53")
        self.assertEqual((opts["start"], opts["end"]),
                         (dt.date(2020, 12, 28), dt.date(2021, 1, 3)))
        self.assertEqual(run.parse_date("20240229"), dt.date(2024, 2, 29))
        self.assertEqual(run.parse_date("2024-02-29"), dt.date(2024, 2, 29))
        for value in ("20230229", "2026-02-30", "not-a-date"):
            with self.subTest(value=value), self.assertRaises(argparse.ArgumentTypeError):
                run.parse_date(value)

    def test_invalid_iso_week_and_incomplete_or_conflicting_dates(self):
        bad = [
            ("--year", "2021", "--week", "53"),
            ("--year", "2026", "--week", "0"),
            ("--year", "2026", "--week", "54"),
            ("--year", "0", "--week", "1"),
            ("--year", "2026"), ("--week", "38"),
            ("--start-date", "20260301"), ("--end-date", "20260918"),
            ("--start-date", "20260919", "--end-date", "20260918"),
            ("--start-date", "20230229", "--end-date", "20230301"),
            ("--year", "2026", "--week", "38", "--start-date", "20260914", "--end-date", "20260920"),
        ]
        for args in bad:
            with self.subTest(args=args):
                self.assert_rejected(*args)

    def test_date_interval_and_page_modes(self):
        opts = self.opts("--start-date", "20260301", "--end-date", "20260918")
        self.assertEqual((opts["start"], opts["end"]),
                         (dt.date(2026, 3, 1), dt.date(2026, 9, 18)))
        self.assertEqual((opts["first"], opts["last"]), (1, None))
        cases = [
            (("--from", "2", "--to", "5"), (2, 5)),
            (("2", "5"), (2, 5)),
            (("3",), (3, 3)),
            (("--page", "4"), (4, 4)),
            (("all",), (1, None)),
            (("--year", "2026", "--week", "38", "--from", "2", "--to", "4"), (2, 4)),
        ]
        for args, expected in cases:
            with self.subTest(args=args):
                opts = self.opts(*args)
                self.assertEqual((opts["first"], opts["last"]), expected)
        self.assertEqual((self.opts()["first"], self.opts()["last"]), (1, 1))
        cfg = dict(self.cfg, start_page="4", end_page="7")
        opts = self.opts(cfg=cfg)
        self.assertEqual((opts["first"], opts["last"]), (4, 7))
        opts = self.opts("--year", "2026", "--week", "38", cfg=cfg)
        self.assertEqual((opts["first"], opts["last"]), (1, None))

    def test_invalid_or_conflicting_page_arguments(self):
        bad = [
            ("--from", "1"), ("--to", "2"), ("--from", "5", "--to", "2"),
            ("--from", "0", "--to", "2"), ("--page", "0"),
            ("0",), ("5", "2"), ("1", "2", "3"), ("1", "all"), ("bad",),
            ("--page", "1", "--from", "1", "--to", "3"),
            ("2", "--page", "2"), ("all", "--from", "1", "--to", "3"),
        ]
        for args in bad:
            with self.subTest(args=args):
                self.assert_rejected(*args)

    def test_list_request_forwards_inclusive_date_and_page_filter(self):
        opts = self.opts("--start-date", "20260301", "--end-date", "20260918", "--from", "2", "--to", "3")
        rows = [{"NTT_SN": "42", "OTHBC_DT_NM": "2026-09-18"}]
        class Response:
            def __enter__(self):
                return self
            def __exit__(self, *exc):
                return False
            def json(self):
                return {"data": {"list": rows, "totalRecordCount": 20,
                                 "currentPageNo": 2, "recordCountPerPage": opts["size"]}}
        client = run.Client(opts)
        self.addCleanup(client.session.close)
        with mock.patch.object(client, "request", return_value=Response()) as request:
            self.assertEqual(client.get_list(2, opts), (rows, 20))
            self.assertEqual(request.call_args.args[:2], ("POST", run.LIST_URL))
            data = request.call_args.kwargs["data"]
            self.assertEqual(data["pageNo"], 2)
            self.assertEqual(data["recordCountPerPage"], 10)
            self.assertEqual((data["pStartDt"], data["pEndDt"]), ("2026/03/01", "2026/09/18"))


class FilenameTests(OfflineCase):
    def test_traversal_and_windows_forbidden_characters(self):
        for source in ("../../secret.txt", "..\\..\\secret.txt",
                       "C:\\Users\\name\\../report?.txt", "bad<>:\"|?*\x01.txt",
                       "../..", "&#46;&#46;&#47;escape.txt", "한글 이름.pdf"):
            with self.subTest(source=source):
                name = run.safe_filename(source)
                self.assertTrue(name)
                self.assertNotIn(name, (".", ".."))
                self.assertIsNone(re.search(r'[<>:"/\\|?*\x00-\x1f\x7f]', name))
                self.assertFalse(name.endswith((" ", ".")))
                self.assertLessEqual(len(name), 100)
        self.assertEqual(run.safe_filename("../../secret.txt"), "secret.txt")
        self.assertLessEqual(len(run.safe_filename("가" * 200 + ".pdf")), 100)

    def test_reserved_windows_device_names_including_extensions(self):
        for source in ("CON", "con.txt", "PRN.pdf", "AUX", "nul.TXT", "COM1.txt",
                       "com9", "LPT1.pdf", "lpt9.log", "CON.backup.txt"):
            with self.subTest(source=source):
                result = run.safe_filename(source)
                first_component = result.split(".", 1)[0].rstrip(" ")
                self.assertIsNone(re.fullmatch(r"CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]",
                                               first_component, re.IGNORECASE), result)

    def test_actual_download_sanitizes_name_and_separates_file_ids(self):
        payload = b"offline test content"
        class Response:
            headers = {"Content-Type": "application/pdf", "Content-Length": str(len(payload))}
            def __enter__(self):
                return self
            def __exit__(self, *exc):
                return False
            def iter_content(self, chunk_size):
                yield payload[:4]
                yield b""
                yield payload[4:]
        client = run.Client(self.opts("all"))
        self.addCleanup(client.session.close)
        with mock.patch.object(client, "request", side_effect=lambda *a, **kw: Response()) as request:
            paths = []
            for file_id in ("f1", "f2"):
                path, size, digest = client.download(
                    {"file_id": file_id, "original_name": "../../a?b.pdf",
                     "download_url": "https://dream.kotra.or.kr/offline-file"},
                    "123", str(self.root / "downloads"))
                paths.append(Path(path))
                self.assertTrue(Path(path).resolve().is_relative_to((self.root / "downloads" / "123").resolve()))
                self.assertEqual(Path(path).read_bytes(), payload)
                self.assertEqual(size, len(payload))
                self.assertEqual(digest, hashlib.sha256(payload).hexdigest())
                self.assertNotIn("?", Path(path).name)
            self.assertNotEqual(*paths)
            before = request.call_count
            with self.assertRaises(ValueError):
                client.download({"file_id": "../evil", "original_name": "x",
                                 "download_url": "https://dream.kotra.or.kr/offline-file"},
                                "123", str(self.root / "downloads"))
            self.assertEqual(request.call_count, before)


class ParserTests(OfflineCase):
    # Synthetic markup follows the locally captured KOTRA lineList_v, txtInfo,
    # keywordArea, fileArea, subTitleArea and viewDataWrap structure. The PDF
    # preview, body image and ordinary body link are not downloadable files.
    HTML = """<!doctype html><html><head>
    <meta property="description" content="규제 개정에 관한 요약">
    </head><body>
    <div class="board_area"><div class="lineList_v" id="pdfArea"><dl>
      <dt><div class="txtL"><strong>새 법률 &amp; 규정 제정</strong></div>
        <div class="txtInfo"><ul><li class="categ"><span class="txt">통상·규제</span></li>
        <li>중국</li><li>톈진무역관</li><li class="date">2026-10-11</li>
        <li class="source"><em>출처 : KOTRA</em></li></ul></div></dt>
      <dd><div class="keywordArea"><b class="tit">Keyword</b>
        <a href="#;" onclick="fn_goKeywordSearch('유기농');">#유기농</a>
        <a href="#;" onclick="fn_goKeywordSearch('중국');">#중국</a></div>
        <div class="fileArea fileTr"><ul><li><div>
          <a href="#;" class="file_pdf" data-atfilesn="120379"
             data-filename="인증 목록.pdf" data-filesize="123"
             onclick="fn_fileDown(this);">인증 목록.pdf</a>
          <div class="btnGrp"><a href="#;" class="btnC_s btn_pdf_priview"
             data-atfilesn="120379" onclick="fn_filePreview(this);">미리보기</a></div>
        </div></li><li><div>
          <a href="#;" class="file_xlsx" data-atfilesn="120380"
             data-filename="비교표.xlsx" onclick="fn_fileDown(this);">비교표.xlsx</a>
        </div></li></ul></div>
        <div class="subTitleArea"><p class="subTit">첫 번째 요약</p>
          <p class="subTit">두 번째 요약</p></div>
        <div class="view_txt"><div class="viewDataWrap">
          <p>첫 본문 &amp; 설명</p><table><tr><td>규제 표 내용</td></tr></table>
          <p>마지막 본문 <a href="https://example.com/reference">일반 링크</a></p>
          <img src="https://dream.kotra.or.kr/attach/namo/images/photo.png" alt="본문 이미지">
        </div></div>
      </dd></dl></div></div><footer>관련 뉴스는 본문이 아님</footer>
    </body></html>"""
    URL = "https://dream.kotra.or.kr/kotranews/cms/news/actionKotraBoardDetail.do?pNttSn=244359"

    def test_synthetic_real_class_layout_and_attachment_metadata(self):
        article, files = run.parse_detail(self.HTML, self.URL, "244359")
        self.assertEqual(article["title"], "새 법률 & 규정 제정")
        self.assertEqual(article["category"], "통상·규제")
        self.assertEqual(article["country"], "중국")
        self.assertEqual(article["office"], "톈진무역관")
        self.assertEqual(article["published_date"], "2026-10-11")
        self.assertIn("KOTRA", article["source"])
        self.assertIn("유기농", article["keywords"])
        self.assertIn("중국", article["keywords"])
        self.assertIn("첫 번째 요약", article["summary"])
        self.assertIn("두 번째 요약", article["summary"])
        for fragment in ("첫 본문", "규제 표 내용", "마지막 본문"):
            self.assertIn(fragment, article["content_text"])
        self.assertNotIn("관련 뉴스는 본문이 아님", article["content_text"])
        self.assertIn("<table", article["content_html"])
        self.assertIn("photo.png", article["content_html"])
        self.assertIn("https://example.com/reference", article["content_html"])
        self.assertEqual(len(files), 2)
        self.assertEqual(len({str(item["file_id"]) for item in files}), 2)
        by_id = {parse_qs(urlsplit(item["download_url"]).query)["atFileSn"][0]: item for item in files}
        self.assertEqual(set(by_id), {"120379", "120380"})
        self.assertEqual(by_id["120379"]["original_name"], "인증 목록.pdf")
        self.assertEqual(by_id["120380"]["original_name"], "비교표.xlsx")
        for file_id, item in by_id.items():
            url = urlsplit(item["download_url"])
            self.assertEqual((url.scheme, url.hostname, url.path),
                             ("https", "dream.kotra.or.kr", "/ajaxa/fileCpnt/fileDown.do"))
            query = parse_qs(url.query)
            self.assertEqual(query.get("gbn"), ["n01"])
            self.assertEqual(query.get("nttSn"), ["244359"])
            self.assertEqual(query.get("atFileSn"), [file_id])
            self.assertEqual(query.get("pFrontYn"), ["Y"])

    def test_synthetic_article_without_attachment(self):
        html = self.HTML.replace('class="fileArea fileTr"', 'class="not-file-area"')
        # Remove the file block entirely rather than making ordinary links into attachments.
        start = html.index('<div class="not-file-area"')
        end = html.index('<div class="subTitleArea">', start)
        html = html[:start] + html[end:]
        article, files = run.parse_detail(html, self.URL, "244359")
        self.assertTrue(article["content_text"])
        self.assertEqual(files, [])

    def test_parser_attachment_is_accepted_by_downloader(self):
        _, files = run.parse_detail(self.HTML, self.URL, "244359")
        self.assertEqual(len(files), 2)
        payload = b"synthetic attachment"
        class Response:
            headers = {"Content-Type": "application/octet-stream", "Content-Length": str(len(payload))}
            def __enter__(self):
                return self
            def __exit__(self, *exc):
                return False
            def iter_content(self, chunk_size):
                yield payload
        client = run.Client(self.opts("all"))
        self.addCleanup(client.session.close)
        with mock.patch.object(client, "request", side_effect=lambda *a, **kw: Response()):
            for item in files:
                with self.subTest(file_id=item["file_id"]):
                    path, size, digest = client.download(item, "244359", str(self.root / "downloads"))
                    self.assertEqual(Path(path).read_bytes(), payload)
                    self.assertEqual(size, len(payload))
                    self.assertEqual(digest, hashlib.sha256(payload).hexdigest())

    @unittest.skipUnless(Path("/tmp/kotra_detail.html").is_file(), "optional local captured HTML absent")
    def test_optional_local_captured_article_without_attachments(self):
        html = Path("/tmp/kotra_detail.html").read_text(encoding="utf-8")
        article, files = run.parse_detail(html, self.URL.replace("244359", "244890"), "244890")
        self.assertIn("드론 수출통제", article["title"])
        self.assertIn("규제 개요", article["content_text"])
        self.assertIn("<table", article["content_html"])
        self.assertEqual(files, [])

    @unittest.skipUnless(Path("/tmp/kotra_with_attachment.html").is_file(), "optional local captured HTML absent")
    def test_optional_local_captured_article_with_two_attachments(self):
        html = Path("/tmp/kotra_with_attachment.html").read_text(encoding="utf-8")
        article, files = run.parse_detail(html, self.URL, "244359")
        self.assertIn("중국 유기농 제품 인증 목록", article["title"])
        self.assertIn("유기농", article["content_text"])
        self.assertEqual(len(files), 2)
        self.assertEqual(len({str(item["file_id"]) for item in files}), 2)
        by_id = {parse_qs(urlsplit(item["download_url"]).query)["atFileSn"][0]: item for item in files}
        self.assertEqual(set(by_id), {"120379", "120380"})
        self.assertTrue(by_id["120379"]["original_name"].endswith(".pdf"))
        self.assertTrue(by_id["120380"]["original_name"].endswith(".xlsx"))
        for file_id, item in by_id.items():
            query = parse_qs(urlsplit(item["download_url"]).query)
            self.assertEqual(query.get("nttSn"), ["244359"])
            self.assertEqual(query.get("atFileSn"), [file_id])


class StorageTests(OfflineCase):
    def test_existing_unrelated_table_survives_and_records_upsert(self):
        with sqlite3.connect(self.db) as conn:
            conn.execute("CREATE TABLE existing_data (id INTEGER PRIMARY KEY, value TEXT)")
            conn.executemany("INSERT INTO existing_data VALUES (?, ?)", [(1, "유지"), (2, "untouched")])
            before = conn.execute("SELECT sql FROM sqlite_master WHERE name='existing_data'").fetchone()[0]
        conn = storage.init_db(self.db)
        self.addCleanup(conn.close)
        original = {"source_id": "123", "title": "원래 제목", "content_text": "원문",
                    "fetched_at": "2026-01-01T00:00:00", "updated_at": "2026-01-01T00:00:00",
                    "list_json": {"NTT_SN": 123}}
        storage.save_article(conn, original)
        attachment = {"source_id": "123", "file_id": "a1", "original_name": "법령.pdf",
                      "download_url": "https://dream.kotra.or.kr/a", "local_path": "/tmp/a",
                      "status": "downloaded", "size_bytes": 10, "sha256": "old", "error": ""}
        storage.save_attachment(conn, attachment)
        storage.save_article(conn, dict(original, title="업데이트 제목", content_text="새 본문",
                                        fetched_at="2099-01-01T00:00:00", updated_at="2026-02-01T00:00:00"))
        storage.save_attachment(conn, dict(attachment, local_path="/tmp/new", size_bytes=20, sha256="new"))
        conn.close()
        # Re-opening simulates a second run against the same existing database.
        conn = storage.init_db(self.db)
        self.addCleanup(conn.close)
        self.assertEqual(conn.execute("SELECT * FROM existing_data ORDER BY id").fetchall(),
                         [(1, "유지"), (2, "untouched")])
        self.assertEqual(conn.execute("SELECT sql FROM sqlite_master WHERE name='existing_data'").fetchone()[0], before)
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM kotra_trade_articles").fetchone()[0], 1)
        row = conn.execute("SELECT title, content_text, fetched_at, updated_at, list_json FROM kotra_trade_articles").fetchone()
        self.assertEqual(row[:4], ("업데이트 제목", "새 본문", "2026-01-01T00:00:00", "2026-02-01T00:00:00"))
        self.assertEqual(json.loads(row[4]), {"NTT_SN": 123})
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM kotra_trade_attachments").fetchone()[0], 1)
        self.assertEqual(conn.execute("SELECT source_id, file_id, local_path, status, size_bytes, sha256 FROM kotra_trade_attachments").fetchone(),
                         ("123", "a1", "/tmp/new", "downloaded", 20, "new"))

    def test_attachment_composite_key_and_enforced_foreign_key(self):
        conn = storage.init_db(self.db)
        self.addCleanup(conn.close)
        self.assertEqual(conn.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        fks = conn.execute("PRAGMA foreign_key_list(kotra_trade_attachments)").fetchall()
        self.assertTrue(any(fk[2:5] == ("kotra_trade_articles", "source_id", "source_id") for fk in fks))
        with self.assertRaises(sqlite3.IntegrityError):
            storage.save_attachment(conn, {"source_id": "missing", "file_id": "x"})
        storage.save_article(conn, {"source_id": "1", "title": "one"})
        storage.save_article(conn, {"source_id": "2", "title": "two"})
        for source_id, file_id in (("1", "same"), ("2", "same"), ("1", "other")):
            storage.save_attachment(conn, {"source_id": source_id, "file_id": file_id, "status": "downloaded"})
        self.assertEqual(conn.execute("SELECT source_id, file_id FROM kotra_trade_attachments ORDER BY 1, 2").fetchall(),
                         [("1", "other"), ("1", "same"), ("2", "same")])
        self.assertEqual(conn.execute("PRAGMA foreign_key_check").fetchall(), [])


class CrawlTests(OfflineCase):
    @staticmethod
    def row(source_id, date, title, attachment=False):
        return {"NTT_SN": str(source_id), "OTHBC_DT_NM": date.isoformat(), "NTT_SJ": title,
                "BBS_NAME": "통상규제", "ATTACH_YN": "Y" if attachment else "N"}

    def run_fixture(self, opts, pages, titles, attachment_id=None, content_version="v1"):
        total = sum(map(len, pages.values()))
        def get_list(client, page, actual_opts):
            self.assertEqual(actual_opts, opts)
            self.assertIn(page, pages, "Crawler requested a page beyond the fixture")
            return pages[page], total
        def detail(client, source_id, page, actual_opts):
            files = []
            if source_id == attachment_id:
                files = [{"file_id": "file-1", "original_name": "규정.pdf",
                          "download_url": "https://dream.kotra.or.kr/offline-file"}]
            data = {"title": titles[source_id], "content_text": "본문 " + content_version,
                    "content_html": "<p>본문 " + content_version + "</p>"}
            return (data, files), "https://dream.kotra.or.kr/offline-detail/" + source_id
        def download(client, item, source_id, root):
            path = Path(root) / source_id / (item["file_id"] + ".pdf")
            path.parent.mkdir(parents=True, exist_ok=True)
            payload = ("mock-" + content_version).encode("ascii")
            path.write_bytes(payload)
            return str(path), len(payload), hashlib.sha256(payload).hexdigest()
        with mock.patch.object(run.Client, "get_list", autospec=True, side_effect=get_list) as lists, \
             mock.patch.object(run.Client, "detail", autospec=True, side_effect=detail) as details, \
             mock.patch.object(run.Client, "download", autospec=True, side_effect=download) as downloads:
            result = run.crawl(opts)
            return (result, [call.args[1] for call in lists.call_args_list],
                    [call.args[1] for call in details.call_args_list], downloads.call_count)

    def test_all_periods_all_pages_no_duplicates_and_repeal_enactment_titles(self):
        with sqlite3.connect(self.db) as conn:
            conn.execute("CREATE TABLE existing_data (value TEXT)")
            conn.execute("INSERT INTO existing_data VALUES ('do not touch')")
        rows = []
        for i in range(20):
            title = ("새 통상법 제정" if i == 0 else "기존 규정 폐지" if i == 1 else f"일반 뉴스 {i}")
            rows.append(self.row(1001 + i, dt.date(2026, 9, 20) - dt.timedelta(days=45 * i),
                                 title, attachment=(i == 0)))
        titles = {row["NTT_SN"]: row["NTT_SJ"] for row in rows}
        all_rows = rows[:12] + [rows[4].copy()] + rows[12:]
        pages = {1: all_rows[:10], 2: all_rows[10:20], 3: all_rows[20:]}
        opts = self.opts("all")
        self.assertIsNone(opts["start"])
        self.assertIsNone(opts["end"])
        status, seen_pages, seen_details, downloads = self.run_fixture(opts, pages, titles, "1001")
        self.assertEqual(status, 0)
        self.assertEqual(seen_pages, [1, 2, 3])
        self.assertEqual(len(seen_details), 20)
        self.assertCountEqual(seen_details, list(titles))
        self.assertEqual(downloads, 1)
        with sqlite3.connect(self.db) as conn:
            saved = dict(conn.execute("SELECT source_id, title FROM kotra_trade_articles"))
            self.assertEqual(saved, titles)
            self.assertEqual(conn.execute("SELECT value FROM existing_data").fetchall(), [("do not touch",)])
            fetched_at = conn.execute("SELECT fetched_at FROM kotra_trade_articles WHERE source_id='1001'").fetchone()[0]
            file_row = conn.execute("SELECT source_id, file_id, original_name, status, size_bytes, sha256, local_path, error FROM kotra_trade_attachments").fetchone()
            self.assertEqual(file_row[:4], ("1001", "file-1", "규정.pdf", "downloaded"))
            self.assertEqual(file_row[4:6], (7, hashlib.sha256(b"mock-v1").hexdigest()))
            self.assertEqual(Path(file_row[6]).read_bytes(), b"mock-v1")
            self.assertFalse(file_row[7])
        titles["1001"] = "개정된 법률 제정 제목"
        status, seen_pages, seen_details, downloads = self.run_fixture(opts, pages, titles, "1001", "v2")
        self.assertEqual((status, seen_pages, len(seen_details), downloads), (0, [1, 2, 3], 20, 1))
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM kotra_trade_articles").fetchone()[0], 20)
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM kotra_trade_attachments").fetchone()[0], 1)
            self.assertEqual(conn.execute("SELECT title, content_text, fetched_at FROM kotra_trade_articles WHERE source_id='1001'").fetchone(),
                             ("개정된 법률 제정 제목", "본문 v2", fetched_at))
            self.assertEqual(conn.execute("SELECT sha256 FROM kotra_trade_attachments").fetchone()[0], hashlib.sha256(b"mock-v2").hexdigest())
            self.assertEqual(conn.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_explicit_date_interval_includes_both_endpoints_and_all_pages(self):
        opts = self.opts("--start-date", "20260301", "--end-date", "20260918")
        rows = [self.row(1, dt.date(2026, 9, 19), "too new")]
        rows.extend(self.row(100 + i, dt.date(2026, 9, 18) - dt.timedelta(days=i), f"in range {i}")
                    for i in range(20))
        rows.append(self.row(200, dt.date(2026, 3, 1), "start boundary"))
        rows.append(self.row(201, dt.date(2026, 2, 28), "too old"))
        pages = {1: rows[:10], 2: rows[10:20], 3: rows[20:]}
        titles = {r["NTT_SN"]: r["NTT_SJ"] for r in rows}
        status, seen_pages, details, downloads = self.run_fixture(opts, pages, titles)
        self.assertEqual((status, seen_pages, downloads), (0, [1, 2, 3], 0))
        self.assertCountEqual(details, [str(100 + i) for i in range(20)] + ["200"])
        with sqlite3.connect(self.db) as conn:
            dates = dict(conn.execute("SELECT source_id, published_date FROM kotra_trade_articles"))
            self.assertEqual(len(dates), 21)
            self.assertEqual(dates["100"], "2026-09-18")
            self.assertEqual(dates["200"], "2026-03-01")
            self.assertNotIn("1", dates)
            self.assertNotIn("201", dates)

    def test_from_to_crawls_both_page_endpoints_only(self):
        opts = self.opts("--from", "2", "--to", "3")
        rows = [self.row(i, dt.date(2026, 1, 1), f"row {i}") for i in range(1, 41)]
        pages = {i: rows[(i - 1) * 10:i * 10] for i in range(1, 5)}
        titles = {r["NTT_SN"]: r["NTT_SJ"] for r in rows}
        status, seen_pages, details, downloads = self.run_fixture(opts, pages, titles)
        self.assertEqual((status, seen_pages, downloads), (0, [2, 3], 0))
        self.assertCountEqual(details, [str(i) for i in range(11, 31)])
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM kotra_trade_articles").fetchone()[0], 20)

    def test_failed_download_is_recorded_with_parent_and_nonzero_result(self):
        opts = self.opts("1")
        row = self.row(42, dt.date(2026, 9, 18), "첨부가 있는 글", attachment=True)
        item = {"file_id": "file-42", "original_name": "doc.pdf",
                "download_url": "https://dream.kotra.or.kr/offline"}
        with mock.patch.object(run.Client, "get_list", autospec=True, return_value=([row], 1)), \
             mock.patch.object(run.Client, "detail", autospec=True,
                               return_value=(({"title": "첨부가 있는 글", "content_text": "본문"}, [item]),
                                             "https://dream.kotra.or.kr/detail/42")), \
             mock.patch.object(run.Client, "download", autospec=True, side_effect=OSError("test download error")):
            self.assertEqual(run.crawl(opts), 2)
        with sqlite3.connect(self.db) as conn:
            self.assertEqual(conn.execute("SELECT source_id FROM kotra_trade_articles").fetchall(), [("42",)])
            result = conn.execute("SELECT source_id, file_id, status, error FROM kotra_trade_attachments").fetchone()
            self.assertEqual(result[:3], ("42", "file-42", "failed"))
            self.assertIn("test download error", result[3])
            self.assertEqual(conn.execute("PRAGMA foreign_key_check").fetchall(), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
