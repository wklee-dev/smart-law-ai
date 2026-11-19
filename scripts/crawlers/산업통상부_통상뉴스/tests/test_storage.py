import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import storage  # noqa: E402


def article(article_id="article-1", **overrides):
    result = {
        "article_id": article_id,
        "title": "한-영 FTA 소식 '인용'",
        "registered_date": "2026-11-16",
        "source_url": "https://example.invalid/news?id=1",
        "body_text": "원문\n첫 줄",
        "body_html": "<p>원문 &amp; 본문</p>",
    }
    result.update(overrides)
    return result


def asset(article_id="article-1", asset_key="file-1", **overrides):
    result = {
        "article_id": article_id,
        "asset_key": asset_key,
        "kind": "attachment",
        "original_name": "보고서.pdf",
        "source_url": "https://example.invalid/report.pdf",
        "status": "failed",
    }
    result.update(overrides)
    return result


class StorageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.db_path = Path(self.temp.name) / "기존 DB #?.sqlite"
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("CREATE TABLE existing_data (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
            conn.execute("INSERT INTO existing_data VALUES (?, ?)", (7, "보존 '원본'"))
        self.conn = storage.open_database(self.db_path)
        self.addCleanup(self.conn.close)

    def test_existing_table_data_and_definition_are_preserved(self):
        before = self.conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='existing_data'"
        ).fetchone()[0]
        storage.save_article(self.conn, article())
        storage.save_asset(self.conn, asset(error_message="연결 실패"))
        with sqlite3.connect(self.db_path) as other:
            self.assertEqual(other.execute("SELECT * FROM existing_data").fetchall(),
                             [(7, "보존 '원본'")])
            self.assertEqual(other.execute(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='existing_data'"
            ).fetchone()[0], before)
            tables = {row[0] for row in other.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")}
            self.assertEqual(tables, {"existing_data", "fta_trade_news_articles",
                                      "fta_trade_news_assets"})
            # The writes were committed and are visible to a second connection.
            self.assertEqual(other.execute("SELECT COUNT(*) FROM fta_trade_news_articles").fetchone()[0], 1)
            self.assertEqual(other.execute("SELECT COUNT(*) FROM fta_trade_news_assets").fetchone()[0], 1)

    def test_connection_pragmas_and_schema(self):
        self.assertEqual(self.conn.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        self.assertEqual(self.conn.execute("PRAGMA busy_timeout").fetchone()[0], 5000)
        article_columns = [r[1] for r in self.conn.execute("PRAGMA table_info(fta_trade_news_articles)")]
        asset_columns = [r[1] for r in self.conn.execute("PRAGMA table_info(fta_trade_news_assets)")]
        self.assertEqual(article_columns, list(storage._ARTICLE_COLUMNS))
        self.assertEqual(asset_columns, list(storage._ASSET_COLUMNS))
        foreign_keys = self.conn.execute("PRAGMA foreign_key_list(fta_trade_news_assets)").fetchall()
        self.assertIn(("fta_trade_news_articles", "article_id", "article_id"),
                      [row[2:5] for row in foreign_keys])

    def test_reopen_does_not_change_existing_rows(self):
        storage.save_article(self.conn, article())
        original = self.conn.execute("SELECT * FROM fta_trade_news_articles").fetchall()
        self.conn.close()
        self.conn = storage.open_database(self.db_path)
        self.addCleanup(self.conn.close)
        self.assertEqual(self.conn.execute("SELECT * FROM fta_trade_news_articles").fetchall(), original)

    def test_article_upsert_preserves_created_at_and_updates_raw_body(self):
        first = "2026-01-01T00:00:00.000001+00:00"
        second = "2026-01-02T00:00:00.000001+00:00"
        with patch.object(storage, "_utc_now", side_effect=[first, second]):
            storage.save_article(self.conn, article(view_count=42, list_page=3))
            storage.save_article(self.conn, article(title="새 제목", body_text="새 원문\n'\x00끝",
                                                    body_html="<b>새 원문</b>", list_page=None))
        rows = self.conn.execute(
            "SELECT title, body_text, body_html, view_count, list_page, created_at, updated_at "
            "FROM fta_trade_news_articles WHERE article_id=?", ("article-1",)
        ).fetchall()
        self.assertEqual(rows, [("새 제목", "새 원문\n'\x00끝", "<b>새 원문</b>", 42, None,
                                 first, second)])

    def test_failure_and_successful_retry_upsert_same_asset(self):
        storage.save_article(self.conn, article())
        first = "2026-01-01T00:00:00.000001+00:00"
        second = "2026-01-02T00:00:00.000001+00:00"
        with patch.object(storage, "_utc_now", side_effect=[first, second]):
            storage.save_asset(self.conn, asset(error_message="HTTP 503", saved_path="old.part"))
            row = self.conn.execute(
                "SELECT status, error_message FROM fta_trade_news_assets WHERE article_id=? AND asset_key=?",
                ("article-1", "file-1")).fetchone()
            self.assertEqual(row, ("failed", "HTTP 503"))
            storage.save_asset(self.conn, asset(status="downloaded", saved_path="/data/report.pdf",
                                               size_bytes=2048, error_message=None))
        self.assertEqual(self.conn.execute(
            "SELECT status, saved_path, size_bytes, error_message, created_at, updated_at "
            "FROM fta_trade_news_assets").fetchall(),
            [("downloaded", "/data/report.pdf", 2048, None, first, second)])

    def test_asset_composite_key_and_omitted_optional_values(self):
        storage.save_article(self.conn, article("1"))
        storage.save_article(self.conn, article("2"))
        storage.save_asset(self.conn, asset("1", "same", kind="image", error_message="timeout"))
        storage.save_asset(self.conn, asset("2", "same", kind="attachment", error_message="disk full"))
        storage.save_asset(self.conn, asset("1", "another", kind="attachment"))
        storage.save_asset(self.conn, asset("1", "same", kind="image", status="retrying"))
        rows = self.conn.execute(
            "SELECT article_id, asset_key, kind, status, error_message "
            "FROM fta_trade_news_assets ORDER BY article_id, asset_key").fetchall()
        self.assertEqual(rows, [("1", "another", "attachment", "failed", None),
                                ("1", "same", "image", "retrying", "timeout"),
                                ("2", "same", "attachment", "failed", "disk full")])

    def test_timestamps_are_utc_iso(self):
        storage.save_article(self.conn, article())
        storage.save_asset(self.conn, asset())
        for table in ("fta_trade_news_articles", "fta_trade_news_assets"):
            created, updated = self.conn.execute(
                "SELECT created_at, updated_at FROM " + table).fetchone()
            self.assertEqual(created, updated)
            for value in (created, updated):
                timestamp = datetime.fromisoformat(value)
                self.assertEqual(timestamp.utcoffset(), timedelta(0))

    def test_binding_and_numeric_id_normalization(self):
        dangerous_id = "1'); DROP TABLE existing_data; --"
        dangerous_body = "<script>quotes ' \" and SQL --</script>"
        storage.save_article(self.conn, article(dangerous_id, body_html=dangerous_body))
        storage.save_asset(self.conn, asset(dangerous_id, "?;DROP TABLE x;--"))
        storage.save_article(self.conn, article(123))
        storage.save_asset(self.conn, asset(123, 456))
        self.assertEqual(self.conn.execute(
            "SELECT body_html FROM fta_trade_news_articles WHERE article_id=?",
            (dangerous_id,)).fetchone()[0], dangerous_body)
        self.assertEqual(self.conn.execute(
            "SELECT article_id, asset_key FROM fta_trade_news_assets WHERE article_id=?",
            ("123",)).fetchone(), ("123", "456"))
        self.assertEqual(self.conn.execute("SELECT value FROM existing_data").fetchone()[0], "보존 '원본'")

    def test_foreign_key_failure_rolls_back_and_connection_remains_usable(self):
        with self.assertRaises(sqlite3.IntegrityError):
            storage.save_asset(self.conn, asset("absent", error_message="failed"))
        self.assertFalse(self.conn.in_transaction)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM fta_trade_news_assets").fetchone()[0], 0)
        storage.save_article(self.conn, article())
        storage.save_asset(self.conn, asset())
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM fta_trade_news_assets").fetchone()[0], 1)

    def test_transaction_is_rolled_back_on_sql_failure(self):
        storage.save_article(self.conn, article())
        self.conn.execute("CREATE TRIGGER test_abort BEFORE INSERT ON fta_trade_news_assets "
                          "BEGIN SELECT RAISE(ABORT, 'forced failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            storage.save_asset(self.conn, asset())
        self.assertFalse(self.conn.in_transaction)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM fta_trade_news_assets").fetchone()[0], 0)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM fta_trade_news_articles").fetchone()[0], 1)

    def test_does_not_commit_or_rollback_callers_transaction(self):
        self.conn.execute("BEGIN")
        self.conn.execute("INSERT INTO existing_data VALUES (?, ?)", (8, "pending"))
        with self.assertRaisesRegex(RuntimeError, "existing transaction"):
            storage.save_article(self.conn, article())
        self.assertTrue(self.conn.in_transaction)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM existing_data").fetchone()[0], 2)
        with sqlite3.connect(self.db_path) as other:
            self.assertEqual(other.execute("SELECT COUNT(*) FROM existing_data").fetchone()[0], 1)
        self.conn.rollback()
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM existing_data").fetchone()[0], 1)

    def test_input_validation_does_not_change_database(self):
        bad = article()
        del bad["body_html"]
        with self.assertRaises(KeyError):
            storage.save_article(self.conn, bad)
        with self.assertRaises(TypeError):
            storage.save_article(self.conn, article(view_count=True))
        with self.assertRaises(TypeError):
            storage.save_article(self.conn, article(body_text=None))
        with self.assertRaises(ValueError):
            storage.save_article(self.conn, article("   "))
        with self.assertRaises(TypeError):
            storage.save_asset(self.conn, asset(size_bytes="100"))
        self.assertFalse(self.conn.in_transaction)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM fta_trade_news_articles").fetchone()[0], 0)

    def test_disabled_connection_safety_is_rejected(self):
        self.conn.execute("PRAGMA foreign_keys=OFF")
        with self.assertRaisesRegex(RuntimeError, "Foreign key"):
            storage.save_article(self.conn, article())
        self.conn.execute("PRAGMA foreign_keys=ON")
        self.conn.execute("PRAGMA busy_timeout=0")
        with self.assertRaisesRegex(RuntimeError, "timeout"):
            storage.save_article(self.conn, article())
        self.assertFalse(self.conn.in_transaction)

    def test_absent_file_is_not_created(self):
        missing = Path(self.temp.name) / "missing.sqlite"
        with self.assertRaises(sqlite3.OperationalError):
            storage.open_database(missing)
        self.assertFalse(missing.exists())
        missing_dir = Path(self.temp.name) / "missing-parent" / "db.sqlite"
        with self.assertRaises(sqlite3.OperationalError):
            storage.open_database(missing_dir)
        self.assertFalse(missing_dir.parent.exists())

    def test_incompatible_existing_table_fails_without_schema_changes(self):
        path = Path(self.temp.name) / "incompatible.sqlite"
        with sqlite3.connect(path) as db:
            db.execute("CREATE TABLE fta_trade_news_articles (article_id TEXT PRIMARY KEY, old_data TEXT)")
            db.execute("INSERT INTO fta_trade_news_articles VALUES ('id', 'untouched')")
        with self.assertRaisesRegex(RuntimeError, "Incompatible"):
            storage.open_database(path)
        with sqlite3.connect(path) as db:
            self.assertEqual(db.execute("SELECT * FROM fta_trade_news_articles").fetchall(),
                             [("id", "untouched")])
            self.assertIsNone(db.execute(
                "SELECT name FROM sqlite_master WHERE name='fta_trade_news_assets'").fetchone())

    def test_incompatible_existing_asset_without_foreign_key_is_untouched(self):
        path = Path(self.temp.name) / "missing_fk.sqlite"
        without_fk = storage._CREATE_ASSETS.replace(
            ",\n    FOREIGN KEY (article_id) REFERENCES fta_trade_news_articles(article_id)", "")
        with sqlite3.connect(path) as db:
            db.execute(storage._CREATE_ARTICLES)
            db.execute(without_fk)
        with self.assertRaisesRegex(RuntimeError, "reference the article table"):
            storage.open_database(path)
        with sqlite3.connect(path) as db:
            self.assertEqual(db.execute("PRAGMA foreign_key_list(fta_trade_news_assets)").fetchall(), [])

    def test_explicit_memory_database_and_custom_row_factory(self):
        conn = storage.open_database(":memory:")
        self.addCleanup(conn.close)
        conn.row_factory = lambda cursor, row: {col[0]: value for col, value in zip(cursor.description, row)}
        storage.save_article(conn, article())
        storage.save_asset(conn, asset())
        self.assertEqual(conn.execute("SELECT status FROM fta_trade_news_assets").fetchone(),
                         {"status": "failed"})


if __name__ == "__main__":
    unittest.main()
