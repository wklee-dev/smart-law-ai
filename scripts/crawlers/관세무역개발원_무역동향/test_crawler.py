#!/usr/bin/env python3
"""Offline regression tests for run.py and customs_crawler.py.

Run without creating bytecode files: PYTHONDONTWRITEBYTECODE=1 python -m unittest -v test_crawler

The site parser is deliberately stubbed at import time and its two functions are
mocked in each test. These tests exercise the crawler/parser contract, not the
HTML parser itself; no completed site_parser.py is required.
"""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib
import io
import json
import os
import sqlite3
import sys
import tempfile
import types
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

# Avoid changing the shared directory with __pycache__ during subsequent imports.
sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

# A parser may not exist yet, or may be under construction in another process.
# Only the module's import contract is needed here; parser behavior is mocked.
stub_parser = types.ModuleType("site_parser")
stub_parser.parse_list = mock.Mock(name="unconfigured_parse_list")
stub_parser.parse_detail = mock.Mock(name="unconfigured_parse_detail")
with mock.patch.dict(sys.modules, {"site_parser": stub_parser}):
    run = importlib.import_module("run")
    customs_crawler = importlib.import_module("customs_crawler")


def article(number, registered, page=1, title=None):
    number = str(number)
    return {
        "article_no": number,
        "board_number": number,
        "title": title or "제목 " + number,
        "writer": "작성자",
        "registered_date": registered,
        "detail_url": run.BASE_URL + "?mode=view&articleNo=" + number,
        "list_page": page,
    }


def attachment(key, filename, url=None):
    return {
        "file_key": key,
        "original_filename": filename,
        "url": url or "https://www.kctdi.or.kr/download/" + key,
    }


def detail(text="본문", attachments=None):
    return {"content_text": text, "content_html": "<p>" + text + "</p>",
            "attachments": list(attachments or [])}


class FakeResponse:
    def __init__(self, *, text="", url=run.BASE_URL, body=b"", headers=None,
                 redirect=False, read_error=None):
        self.text = text
        self.url = url
        self.body = body
        self.headers = dict(headers or {})
        self.is_redirect = redirect
        self.read_error = read_error
        self.closed = False

    def iter_content(self, chunk_size):
        yield self.body[:2]
        if self.read_error:
            raise self.read_error
        yield self.body[2:]

    def raise_for_status(self):
        return None

    def close(self):
        self.closed = True


class FakeClient:
    """Explicit fixtures only: an unexpected request is a test failure."""
    def __init__(self, pages=None, details=None, files=None):
        self.pages = dict(pages or {})
        self.details = dict(details or {})
        self.files = dict(files or {})
        self.calls = []

    def get(self, url, *, params=None, stream=False, **kwargs):
        self.calls.append((url, params, stream))
        if params is not None:
            page = params["article.offset"] // run.PAGE_SIZE + 1
            if page not in self.pages:
                raise AssertionError("unexpected list page %s" % page)
            value = self.pages[page]
        else:
            fixtures = self.files if stream else self.details
            if url not in fixtures:
                raise AssertionError("unexpected HTTP request: " + url)
            value = fixtures[url]
        if isinstance(value, BaseException):
            raise value
        if isinstance(value, FakeResponse):
            return value
        if stream and isinstance(value, bytes):
            return FakeResponse(url=url, body=value,
                                headers={"Content-Type": "application/octet-stream",
                                         "Content-Length": str(len(value))})
        return FakeResponse(url=url, text=json.dumps(value, ensure_ascii=False))

    def list_pages(self):
        return [params["article.offset"] // run.PAGE_SIZE + 1
                for _, params, _ in self.calls if params is not None]

    def detail_urls(self):
        return [url for url, params, stream in self.calls if params is None and not stream]

    def file_urls(self):
        return [url for url, params, stream in self.calls if params is None and stream]


class CrawlerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="test_crawler_")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.db_path = self.root / "test.sqlite"
        self.download_dir = self.root / "downloads"
        # Block requests even if a test accidentally constructs a real SiteClient.
        block = mock.patch("requests.sessions.Session.request",
                           side_effect=AssertionError("real HTTP is forbidden in tests"))
        block.start()
        self.addCleanup(block.stop)
        quiet = mock.patch.object(run.LOG, "disabled", True)
        quiet.start()
        self.addCleanup(quiet.stop)
        parse_list = mock.patch.object(run, "parse_list",
                                      side_effect=lambda text, page, url: json.loads(text))
        parse_detail = mock.patch.object(run, "parse_detail",
                                        side_effect=lambda text, url: json.loads(text))
        self.parse_list_mock = parse_list.start()
        self.parse_detail_mock = parse_detail.start()
        self.addCleanup(parse_list.stop)
        self.addCleanup(parse_detail.stop)

    def arguments(self, *parts):
        parser = run.get_parser()
        args = parser.parse_args(["crawl", "--db-path", str(self.db_path),
                                  "--download-dir", str(self.download_dir), *parts])
        run.validate_args(args, parser)
        return args

    def invalid_arguments(self, *parts):
        with contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as cm:
                self.arguments(*parts)
        self.assertEqual(cm.exception.code, 2)

    def db(self):
        conn = run.open_db(str(self.db_path), create=True)
        self.addCleanup(conn.close)
        return conn

    def seed(self, db, *items):
        with db:
            for item in items:
                run.save_list_row(db, item)

    def execute_main(self, client, *parts, create=False):
        argv = ["crawl", "--db-path", str(self.db_path),
                "--download-dir", str(self.download_dir), "--delay", "0"]
        if create:
            argv.append("--create-db")
        argv.extend(parts)
        with mock.patch.object(run, "SiteClient", return_value=client), \
             mock.patch.object(run, "setup_logging"):
            return run.main(argv)

    def row(self, db, number):
        return db.execute("SELECT * FROM kctdi_trade_articles WHERE article_no=?",
                          (str(number),)).fetchone()

    def test_existing_database_tables_and_rows_are_preserved(self):
        with sqlite3.connect(self.db_path) as db:
            db.executescript("CREATE TABLE legacy(id INTEGER PRIMARY KEY, value TEXT);"
                             "CREATE INDEX legacy_value_idx ON legacy(value);"
                             "INSERT INTO legacy VALUES(1, 'preserve me');")
        db = run.open_db(str(self.db_path))
        self.addCleanup(db.close)
        self.assertEqual(tuple(db.execute("SELECT * FROM legacy").fetchone()), (1, "preserve me"))
        objects = {r[0] for r in db.execute("SELECT name FROM sqlite_master")}
        self.assertTrue({"legacy", "legacy_value_idx", "kctdi_trade_articles",
                         "kctdi_trade_attachments"} <= objects)
        self.assertEqual(db.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        # Reopening must leave both legacy and newly created data intact.
        self.seed(db, article("100", "2026-09-14"))
        db2 = run.open_db(str(self.db_path))
        self.addCleanup(db2.close)
        self.assertEqual(db2.execute("SELECT value FROM legacy").fetchone()[0], "preserve me")
        self.assertEqual(db2.execute("SELECT count(*) FROM kctdi_trade_articles").fetchone()[0], 1)

    def test_missing_database_requires_explicit_create_and_directory_is_rejected(self):
        nested = self.root / "not_created" / "db.sqlite"
        with self.assertRaises(FileNotFoundError):
            run.open_db(str(nested))
        self.assertFalse(nested.exists())
        self.assertFalse(nested.parent.exists())
        with self.assertRaises(IsADirectoryError):
            run.open_db(str(self.root), create=True)
        db = run.open_db(str(nested), create=True)
        db.close()
        self.assertTrue(nested.is_file())

    def test_week_2026_38_is_inclusive_monday_to_sunday(self):
        args = self.arguments("--year", "2026", "--week", "38")
        self.assertEqual((args.start_date, args.end_date),
                         (date(2026, 9, 14), date(2026, 9, 20)))
        self.assertEqual(run.parse_date("20260914"), date(2026, 9, 14))
        self.assertEqual(run.parse_date("2026-09-20"), date(2026, 9, 20))

    def test_invalid_command_arguments_are_rejected(self):
        cases = [
            (), ("--year", "2026"), ("--week", "38"),
            ("--year", "2026", "--week", "54"),
            ("--year", "2026", "--week", "0"),
            ("--year", "10000", "--week", "1"),
            ("--start-date", "20260914"), ("--end-date", "20260920"),
            ("--start-date", "20260230", "--end-date", "20260301"),
            ("--start-date", "20260920", "--end-date", "20260914"),
            ("--year", "2026", "--week", "38", "--start-date", "20260914", "--end-date", "20260920"),
            ("--page", "0"), ("--page", "-1"), ("--page", "abc"),
            ("--from-page", "1"), ("--to-page", "3"),
            ("--from-page", "3", "--to-page", "1"),
            ("--page", "1", "--from-page", "1", "--to-page", "2"),
            ("--page", "1", "--all-pages"),
            ("--from-page", "1", "--to-page", "2", "--all-pages"),
            ("--page", "1", "--delay", "-1"),
            ("--page", "1", "--delay", "3601"),
            ("--page", "1", "--delay", "nan"),
            ("--page", "1", "--delay", "inf"),
            ("--page", "1", "--stage", "unknown"),
        ]
        for case in cases:
            with self.subTest(arguments=case):
                self.invalid_arguments(*case)

    def test_date_strings_must_match_the_documented_fixed_width_formats(self):
        for value in ("2026-1-2", "2026111"):
            with self.subTest(value=value):
                with self.assertRaises(argparse.ArgumentTypeError):
                    run.parse_date(value)

    def test_single_page_normalized_and_detail_needs_no_list_filter(self):
        args = self.arguments("--page", "3")
        self.assertEqual((args.from_page, args.to_page), (3, 3))
        args = self.arguments("--stage", "detail")
        self.assertIsNone(args.from_page)
        self.assertIsNone(args.start_date)

    @unittest.skipIf(os.name == "nt", "non-Windows default path validation")
    def test_non_windows_requires_explicit_database_and_download_paths(self):
        parser = run.get_parser()
        for flags in (("--db-path", str(self.db_path)),
                      ("--download-dir", str(self.download_dir)), ()):
            args = parser.parse_args(["crawl", "--page", "1", *flags])
            with self.subTest(flags=flags), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit):
                    run.validate_args(args, parser)

    def test_list_respects_page_range_and_inclusive_week_dates(self):
        db = self.db()
        args = self.arguments("--year", "2026", "--week", "38",
                              "--from-page", "2", "--to-page", "3")
        client = FakeClient(pages={
            2: [article("21", "2026-09-21", 2), article("20", "2026-09-20", 2),
                article("14", "2026-09-14", 2)],
            3: [article("13", "2026-09-13", 3)],
        })
        selected, failed = run.collect_list(db, client, args)
        self.assertFalse(failed)
        self.assertEqual(selected, ["20", "14"])
        self.assertEqual(client.list_pages(), [2, 3])
        self.assertEqual([(r["article_no"], r["list_page"]) for r in
                          db.execute("SELECT * FROM kctdi_trade_articles ORDER BY article_no")],
                         [("14", 2), ("20", 2)])
        self.assertEqual(client.calls[0][1], {"mode": "list", "articleLimit": run.PAGE_SIZE,
                                              "article.offset": run.PAGE_SIZE})

    def test_page_only_filter_includes_every_date_and_stops_at_bound(self):
        db = self.db()
        client = FakeClient(pages={3: [article("3", "2020-01-01", 3)]})
        selected, failed = run.collect_list(db, client, self.arguments("--page", "3"))
        self.assertEqual((selected, failed), (["3"], False))
        self.assertEqual(client.list_pages(), [3])

    def test_empty_page_terminates_all_pages(self):
        db = self.db()
        client = FakeClient(pages={1: [article("1", "2026-09-20")], 2: []})
        selected, failed = run.collect_list(db, client, self.arguments("--all-pages"))
        self.assertEqual((selected, failed), (["1"], False))
        self.assertEqual(client.list_pages(), [1, 2])

    def test_old_sorted_page_causes_early_termination(self):
        db = self.db()
        client = FakeClient(pages={1: [article("1", "2026-09-15")],
                                   2: [article("2", "2026-09-13", 2),
                                       article("3", "2026-09-12", 2)]})
        selected, failed = run.collect_list(db, client,
                                            self.arguments("--year", "2026", "--week", "38"))
        self.assertEqual((selected, failed), (["1"], False))
        self.assertEqual(client.list_pages(), [1, 2])

    def test_unsorted_old_page_does_not_trigger_early_termination(self):
        db = self.db()
        client = FakeClient(pages={1: [article("a", "2026-09-11"), article("b", "2026-09-12")],
                                   2: [article("c", "2026-09-15", 2)], 3: []})
        selected, failed = run.collect_list(db, client,
                                            self.arguments("--year", "2026", "--week", "38"))
        self.assertEqual((selected, failed), (["c"], False))
        self.assertEqual(client.list_pages(), [1, 2, 3])

    def test_cross_page_disorder_does_not_trigger_early_termination(self):
        db = self.db()
        client = FakeClient(pages={1: [article("a", "2026-09-15"), article("b", "2026-09-08")],
                                   2: [article("c", "2026-09-10", 2)],
                                   3: [article("d", "2026-09-16", 3)], 4: []})
        selected, failed = run.collect_list(db, client,
                                            self.arguments("--year", "2026", "--week", "38"))
        self.assertEqual((selected, failed), (["a", "d"], False))
        self.assertEqual(client.list_pages(), [1, 2, 3, 4])

    def test_duplicate_page_is_detected_and_logged_without_infinite_loop(self):
        db = self.db()
        entry = article("same", "2026-09-15")
        client = FakeClient(pages={1: [entry], 2: [entry]})
        with mock.patch.object(run.LOG, "exception") as error_log:
            selected, failed = run.collect_list(db, client, self.arguments("--all-pages"))
        self.assertEqual((selected, failed), (["same"], True))
        self.assertEqual(client.list_pages(), [1, 2])
        error_log.assert_called_once()
        self.assertEqual(db.execute("SELECT count(*) FROM kctdi_trade_articles").fetchone()[0], 1)

    def test_list_error_is_logged_and_next_run_can_retry(self):
        db = self.db()
        client = FakeClient(pages={1: OSError("temporary list failure")})
        with mock.patch.object(run.LOG, "exception") as error_log:
            selected, failed = run.collect_list(db, client, self.arguments("--page", "1"))
        self.assertEqual((selected, failed), ([], True))
        self.assertIn("temporary list failure", str(error_log.call_args))
        client.pages[1] = [article("ok", "2026-09-14")]
        self.assertEqual(run.collect_list(db, client, self.arguments("--page", "1")), (["ok"], False))

    def test_bad_date_does_not_partially_insert_the_page(self):
        db = self.db()
        client = FakeClient(pages={1: [article("ok", "2026-09-14"),
                                       article("bad", "not-a-date")]})
        selected, failed = run.collect_list(db, client, self.arguments("--page", "1"))
        self.assertEqual((selected, failed), ([], True))
        self.assertEqual(db.execute("SELECT count(*) FROM kctdi_trade_articles").fetchone()[0], 0)

    def test_list_upsert_preserves_detail_and_does_not_duplicate_article(self):
        db = self.db()
        self.seed(db, article("7", "2026-09-14", title="original"))
        with db:
            db.execute("UPDATE kctdi_trade_articles SET detail_status='complete', content_text='kept' WHERE article_no='7'")
        first_seen = self.row(db, "7")["first_seen_at"]
        client = FakeClient(pages={1: [article("7", "2026-09-15", title="updated")]})
        for _ in range(2):
            self.assertEqual(run.collect_list(db, client, self.arguments("--page", "1")), (["7"], False))
        row = self.row(db, "7")
        self.assertEqual((row["title"], row["registered_date"], row["detail_status"], row["content_text"]),
                         ("updated", "2026-09-15", "complete", "kept"))
        self.assertEqual(row["first_seen_at"], first_seen)
        self.assertEqual(db.execute("SELECT count(*) FROM kctdi_trade_articles").fetchone()[0], 1)

    def test_detail_selection_filters_status_page_date_and_selected_ids(self):
        db = self.db()
        self.seed(db, article("1", "2026-09-14", 2), article("2", "2026-09-20", 2),
                  article("3", "2026-09-15", 3), article("4", "2026-09-21", 2))
        with db:
            db.execute("UPDATE kctdi_trade_articles SET detail_status='complete' WHERE article_no='2'")
            db.execute("UPDATE kctdi_trade_articles SET detail_status='error' WHERE article_no='1'")
        args = self.arguments("--stage", "detail", "--year", "2026", "--week", "38", "--page", "2")
        self.assertEqual([r["article_no"] for r in run.select_detail_rows(db, args, None)], ["1"])
        self.assertEqual(run.select_detail_rows(db, args, []), [])
        args.refresh = True
        self.assertEqual({r["article_no"] for r in run.select_detail_rows(db, args, ["1", "3"])}, {"1"})
        self.assertEqual({r["article_no"] for r in run.select_detail_rows(db, args, None)}, {"1", "2"})

    def test_list_and_detail_are_separate_and_reruns_skip_completed(self):
        entry = article("10", "2026-09-14")
        item = attachment("f1", "자료.pdf")
        client = FakeClient(pages={1: [entry]}, details={entry["detail_url"]: detail("자료 본문", [item])},
                            files={item["url"]: b"file payload"})
        self.assertEqual(self.execute_main(client, "--stage", "list", "--page", "1", create=True), 0)
        self.assertEqual(client.detail_urls(), [])
        self.assertEqual(client.file_urls(), [])
        with sqlite3.connect(self.db_path) as db:
            self.assertEqual(db.execute("SELECT detail_status FROM kctdi_trade_articles").fetchone()[0], "pending")
        self.assertEqual(self.execute_main(client, "--stage", "detail"), 0)
        self.assertEqual(client.detail_urls(), [entry["detail_url"]])
        self.assertEqual(client.file_urls(), [item["url"]])
        self.assertEqual(self.execute_main(client, "--stage", "detail"), 0)
        self.assertEqual(len(client.detail_urls()), 1)
        self.assertEqual(len(client.file_urls()), 1)
        # Re-list and refresh explicitly: unique rows remain unique.
        self.assertEqual(self.execute_main(client, "--stage", "list", "--page", "1"), 0)
        self.assertEqual(self.execute_main(client, "--stage", "detail", "--refresh"), 0)
        self.assertEqual(len(client.detail_urls()), 2)
        self.assertEqual(len(client.file_urls()), 2)
        with sqlite3.connect(self.db_path) as db:
            self.assertEqual(db.execute("SELECT count(*), min(detail_status) FROM kctdi_trade_articles").fetchone(), (1, "complete"))
            self.assertEqual(db.execute("SELECT count(*) FROM kctdi_trade_attachments").fetchone()[0], 1)
            saved_path, size, digest = db.execute("SELECT saved_path,size_bytes,sha256 FROM kctdi_trade_attachments").fetchone()
        self.assertEqual(Path(saved_path).read_bytes(), b"file payload")
        self.assertEqual(size, len(b"file payload"))
        self.assertEqual(digest, hashlib.sha256(b"file payload").hexdigest())

    def test_all_stage_details_only_currently_selected_list_items(self):
        db = self.db()
        stale = article("stale", "2026-09-14")
        self.seed(db, stale)
        current = article("current", "2026-09-15")
        client = FakeClient(pages={1: [current]}, details={current["detail_url"]: detail()})
        self.assertEqual(self.execute_main(client, "--stage", "all", "--page", "1"), 0)
        self.assertEqual(client.detail_urls(), [current["detail_url"]])
        self.assertEqual(self.row(db, "stale")["detail_status"], "pending")
        self.assertEqual(self.row(db, "current")["detail_status"], "complete")

    def test_article_without_attachments_completes_without_download(self):
        db = self.db()
        entry = article("no-files", "2026-09-14")
        self.seed(db, entry)
        client = FakeClient(details={entry["detail_url"]: detail("내용", [])})
        self.assertFalse(run.collect_details(db, client, self.arguments("--stage", "detail"), None))
        row = self.row(db, "no-files")
        self.assertEqual((row["detail_status"], row["content_text"], row["last_error"]),
                         ("complete", "내용", None))
        self.assertEqual(client.file_urls(), [])
        self.assertEqual(db.execute("SELECT count(*) FROM kctdi_trade_attachments").fetchone()[0], 0)
        self.assertFalse(self.download_dir.exists())

    def test_detail_failure_is_recorded_then_retried_and_cleared(self):
        db = self.db()
        entry = article("retry", "2026-09-14")
        self.seed(db, entry)
        client = FakeClient(details={entry["detail_url"]: OSError("temporary detail failure")})
        args = self.arguments("--stage", "detail")
        with mock.patch.object(run.LOG, "exception") as error_log:
            self.assertTrue(run.collect_details(db, client, args, None))
        row = self.row(db, "retry")
        self.assertEqual(row["detail_status"], "error")
        self.assertIn("temporary detail failure", row["last_error"])
        self.assertIsNotNone(row["last_detail_at"])
        self.assertIn("temporary detail failure", str(error_log.call_args))
        client.details[entry["detail_url"]] = detail("retry succeeded")
        self.assertFalse(run.collect_details(db, client, args, None))
        row = self.row(db, "retry")
        self.assertEqual((row["detail_status"], row["last_error"], row["content_text"]),
                         ("complete", None, "retry succeeded"))
        self.assertEqual(len(client.detail_urls()), 2)

    def test_main_returns_error_then_success_on_retry(self):
        entry = article("retry", "2026-09-14")
        client = FakeClient(pages={1: [entry]}, details={entry["detail_url"]: OSError("offline")})
        self.assertEqual(self.execute_main(client, "--page", "1", create=True), 1)
        client.details[entry["detail_url"]] = detail("recovered")
        self.assertEqual(self.execute_main(client, "--stage", "detail"), 0)
        with sqlite3.connect(self.db_path) as db:
            self.assertEqual(db.execute("SELECT detail_status,last_error FROM kctdi_trade_articles").fetchone(),
                             ("complete", None))

    def test_duplicate_attachment_keys_mark_error_and_do_not_insert_rows(self):
        db = self.db()
        entry = article("dup", "2026-09-14")
        self.seed(db, entry)
        one = attachment("same", "one.txt")
        two = attachment("same", "two.txt")
        client = FakeClient(details={entry["detail_url"]: detail(attachments=[one, two])},
                            files={one["url"]: b"one"})
        self.assertTrue(run.collect_details(db, client, self.arguments("--stage", "detail"), None))
        self.assertEqual(self.row(db, "dup")["detail_status"], "error")
        self.assertIn("중복", self.row(db, "dup")["last_error"])
        self.assertEqual(db.execute("SELECT count(*) FROM kctdi_trade_attachments").fetchone()[0], 0)

    def test_refresh_removes_stale_attachment_rows(self):
        db = self.db()
        entry = article("gone", "2026-09-14")
        item = attachment("f", "file.txt")
        self.seed(db, entry)
        client = FakeClient(details={entry["detail_url"]: detail(attachments=[item])},
                            files={item["url"]: b"data"})
        args = self.arguments("--stage", "detail")
        self.assertFalse(run.collect_details(db, client, args, None))
        client.details[entry["detail_url"]] = detail("no files now")
        args.refresh = True
        self.assertFalse(run.collect_details(db, client, args, None))
        self.assertEqual(db.execute("SELECT count(*) FROM kctdi_trade_attachments").fetchone()[0], 0)
        self.assertEqual(self.row(db, "gone")["content_text"], "no files now")

    def test_safe_filename_blocks_paths_reserved_names_and_invalid_characters(self):
        self.assertEqual(run.safe_filename("../../private.txt"), "private.txt")
        self.assertEqual(run.safe_filename(r"C:\\secret\\report.pdf"), "report.pdf")
        self.assertEqual(run.safe_filename("CON.txt"), "_CON.txt")
        self.assertEqual(run.safe_filename("lpt9"), "_lpt9")
        self.assertEqual(run.safe_filename(" .. "), "attachment")
        cleaned = run.safe_filename('bad<>:"|?*\x00name.txt')
        self.assertFalse(any(ch in cleaned for ch in '<>:"/\\|?*\x00'))
        self.assertLessEqual(len(run.safe_filename("x" * 300 + ".txt")), 140)

    def test_attachment_is_contained_and_saved_with_hash_and_size(self):
        folder = self.root / "downloads"
        item = attachment("../file", r"C:\\temp\\..\\보고서?.pdf", "https://www.kctdi.or.kr/download/file")
        response = FakeResponse(url=item["url"], body=b"contents",
                                headers={"Content-Type": "application/pdf", "Content-Length": "8"})
        client = FakeClient(files={item["url"]: response})
        saved = run.download_attachment(client, folder, "../../123", item, None)
        path = Path(saved["saved_path"])
        self.assertEqual(path.resolve().parent, folder.resolve())
        self.assertEqual(path.read_bytes(), b"contents")
        self.assertEqual(saved["original_filename"], item["original_filename"])
        self.assertEqual(saved["size_bytes"], 8)
        self.assertEqual(saved["sha256"], hashlib.sha256(b"contents").hexdigest())
        self.assertTrue(response.closed)
        self.assertEqual(list(folder.glob("*.part")), [])
        self.assertNotIn("?", path.name)

    def test_download_reuses_valid_existing_file_without_http(self):
        folder = self.root / "folder"
        folder.mkdir()
        existing = folder / "existing.bin"
        existing.write_bytes(b"already")
        item = attachment("1", "file.bin")
        old = {"saved_path": str(existing), "download_url": item["url"], "size_bytes": 7,
               "sha256": hashlib.sha256(b"already").hexdigest(), "downloaded_at": "before",
               "original_filename": "file.bin"}
        client = FakeClient()
        result = run.download_attachment(client, folder, "a", item, old)
        self.assertEqual(result["saved_path"], str(existing))
        self.assertEqual(result["downloaded_at"], "before")
        self.assertEqual(client.calls, [])

    def test_cached_file_outside_download_folder_is_not_reused(self):
        folder = self.root / "folder"
        outside = self.root / "outside.bin"
        outside.write_bytes(b"old")
        item = attachment("1", "file.bin")
        old = {"saved_path": str(outside), "download_url": item["url"], "size_bytes": 3,
               "sha256": "x", "downloaded_at": "before", "original_filename": "file.bin"}
        client = FakeClient(files={item["url"]: b"new"})
        result = run.download_attachment(client, folder, "a", item, old)
        self.assertEqual(Path(result["saved_path"]).resolve().parent, folder.resolve())
        self.assertEqual(Path(result["saved_path"]).read_bytes(), b"new")
        self.assertEqual(outside.read_bytes(), b"old")

    def test_bad_attachment_response_cleans_partial_file_and_closes_response(self):
        item = attachment("1", "x.bin")
        cases = [FakeResponse(url=item["url"], body=b"bad", headers={"Content-Type": "text/html"}),
                 FakeResponse(url=item["url"], body=b"bad", headers={"Content-Length": "100"}),
                 FakeResponse(url=item["url"], body=b"bad", read_error=OSError("interrupted"))]
        for response in cases:
            with self.subTest(headers=response.headers, read_error=response.read_error):
                folder = self.root / ("case_" + str(cases.index(response)))
                client = FakeClient(files={item["url"]: response})
                with self.assertRaises((OSError, RuntimeError)):
                    run.download_attachment(client, folder, "a", item, None)
                self.assertTrue(response.closed)
                self.assertEqual(list(folder.glob("*")), [])

    def test_long_korean_attachment_name_can_be_saved(self):
        # Typical filesystems limit a single component to 255 *bytes*, not characters.
        folder = self.root / "folder"
        item = attachment("1", "가" * 100 + ".pdf")
        client = FakeClient(files={item["url"]: b"document"})
        saved = run.download_attachment(client, folder, "123", item, None)
        self.assertEqual(Path(saved["saved_path"]).read_bytes(), b"document")
        self.assertLessEqual(len(os.fsencode(Path(saved["saved_path"]).name)), 255)

    def test_distinct_attachment_keys_never_overwrite_each_other_after_sanitization(self):
        db = self.db()
        entry = article("collision", "2026-09-14")
        self.seed(db, entry)
        first = attachment("file?1", "report.txt", "https://www.kctdi.or.kr/download/a")
        second = attachment("file*1", "report.txt", "https://www.kctdi.or.kr/download/b")
        client = FakeClient(details={entry["detail_url"]: detail(attachments=[first, second])},
                            files={first["url"]: b"first", second["url"]: b"second"})
        self.assertFalse(run.collect_details(db, client, self.arguments("--stage", "detail"), None))
        rows = db.execute("SELECT file_key,saved_path FROM kctdi_trade_attachments ORDER BY file_key").fetchall()
        self.assertEqual(len(rows), 2)
        by_key = {row["file_key"]: Path(row["saved_path"]) for row in rows}
        self.assertNotEqual(by_key["file?1"], by_key["file*1"])
        self.assertEqual(by_key["file?1"].read_bytes(), b"first")
        self.assertEqual(by_key["file*1"].read_bytes(), b"second")

    def test_failed_refresh_keeps_persisted_attachment_metadata_consistent(self):
        db = self.db()
        entry = article("refresh", "2026-09-14")
        first = attachment("first", "first.txt")
        second = attachment("second", "second.txt")
        self.seed(db, entry)
        client = FakeClient(details={entry["detail_url"]: detail(attachments=[first, second])},
                            files={first["url"]: b"old1", second["url"]: b"old2"})
        args = self.arguments("--stage", "detail")
        self.assertFalse(run.collect_details(db, client, args, None))
        # The first refresh changes bytes while preserving length; the second fails.
        # Existing database rows must still describe the actual files after failure.
        client.files[first["url"]] = b"new1"
        client.files[second["url"]] = OSError("second download failed")
        args.refresh = True
        self.assertTrue(run.collect_details(db, client, args, None))
        self.assertEqual(self.row(db, "refresh")["detail_status"], "error")
        rows = db.execute("SELECT saved_path,sha256 FROM kctdi_trade_attachments").fetchall()
        self.assertEqual(len(rows), 2)
        for row in rows:
            with self.subTest(path=row["saved_path"]):
                self.assertEqual(hashlib.sha256(Path(row["saved_path"]).read_bytes()).hexdigest(),
                                 row["sha256"])

    def test_http_client_configures_retry_and_blocks_external_urls(self):
        client = run.SiteClient(delay=0)
        retry = client.session.get_adapter(run.BASE_URL).max_retries
        self.assertEqual(retry.total, 3)
        self.assertTrue({429, 500, 502, 503, 504} <= set(retry.status_forcelist))
        self.assertIn("GET", retry.allowed_methods)
        for url in ("http://www.kctdi.or.kr/", "https://evil.example/",
                    "https://www.kctdi.or.kr.evil.example/", "file:///etc/passwd"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                client.get(url)

    def test_http_redirect_is_checked_before_requesting_redirect_destination(self):
        client = run.SiteClient(delay=0)
        response = FakeResponse(url=run.BASE_URL, redirect=True,
                                headers={"Location": "https://evil.example/secret"})
        with mock.patch.object(client.session, "get", return_value=response) as get:
            with self.assertRaises(ValueError):
                client.get(run.BASE_URL)
        self.assertEqual(get.call_count, 1)
        self.assertTrue(response.closed)

    def test_http_allowed_redirect_and_request_options(self):
        client = run.SiteClient(delay=0)
        redirect = FakeResponse(url=run.BASE_URL, redirect=True, headers={"Location": "/next"})
        final = FakeResponse(url="https://www.kctdi.or.kr/next")
        with mock.patch.object(client.session, "get", side_effect=[redirect, final]) as get:
            self.assertIs(client.get(run.BASE_URL, params={"p": 1}, stream=True), final)
        self.assertTrue(redirect.closed)
        self.assertEqual(get.call_args_list[0].kwargs["timeout"], (15, 60))
        self.assertFalse(get.call_args_list[0].kwargs["allow_redirects"])
        self.assertEqual(get.call_args_list[1].args[0], final.url)
        self.assertTrue(get.call_args_list[1].kwargs["stream"])

    def test_compatibility_launcher_translates_page_arguments(self):
        cases = [(["1"], ["--page", "1"]),
                 (["1", "10"], ["--from-page", "1", "--to-page", "10"]),
                 (["all"], ["--all-pages"]),
                 (["--from", "2", "--to", "4"], ["--from-page", "2", "--to-page", "4"])]
        for argv, expected in cases:
            with self.subTest(argv=argv), mock.patch.object(customs_crawler.run, "main", return_value=17) as main:
                self.assertEqual(customs_crawler.main(argv + ["--stage", "list"]), 17)
                main.assert_called_once_with(["crawl", *expected, "--stage", "list"])

    def test_compatibility_launcher_uses_config_defaults(self):
        config = mock.Mock()
        config.getint.side_effect = [2, 5]
        with mock.patch.object(customs_crawler.configparser, "ConfigParser", return_value=config), \
             mock.patch.object(customs_crawler.run, "main", return_value=0) as main:
            self.assertEqual(customs_crawler.main([]), 0)
        main.assert_called_once_with(["crawl", "--from-page", "2", "--to-page", "5"])

    def test_compatibility_launcher_rejects_invalid_page_forms(self):
        cases = [("--from", "1"), ("--to", "2"), ("all", "2"),
                 ("1", "2", "3"), ("bad",), ("1", "--from", "2", "--to", "3")]
        for argv in cases:
            with self.subTest(argv=argv), contextlib.redirect_stderr(io.StringIO()), \
                 mock.patch.object(customs_crawler.run, "main") as main:
                with self.assertRaises(SystemExit):
                    customs_crawler.main(list(argv))
                main.assert_not_called()


if __name__ == "__main__":
    unittest.main()
