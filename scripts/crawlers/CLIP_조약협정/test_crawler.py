import importlib.util
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "clip_treaty_crawler.py"
SPEC = importlib.util.spec_from_file_location("clip_treaty_crawler", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class CrawlerUtilityTests(unittest.TestCase):
    def test_extract_attachments_deduplicates_repeated_display_sections(self):
        html = """
        <div><a data-attchfileid="A-1" title="국문.hwp" href="#">국문.hwp</a><span>(10KB)</span></div>
        <div><a data-attchfileid="A-1" title="국문.hwp" href="#">국문.hwp</a><span>(10KB)</span></div>
        <div><a data-attchfileid="B-2" href="#">영문.pdf</a><span>(20KB)</span></div>
        """
        attachments = MODULE.extract_attachments(html)
        self.assertEqual([item.attachment_id for item in attachments], ["A-1", "B-2"])
        self.assertEqual(attachments[0].filename, "국문.hwp")
        self.assertEqual(attachments[1].displayed_size, "(20KB)")

    def test_safe_filename_removes_windows_reserved_characters(self):
        result = MODULE.safe_filename('a:b/c*d?e"f<g>h|i.hwp')
        self.assertEqual(result, "a_b_c_d_e_f_g_h_i.hwp")

    def test_page_argument_limits_collection_to_exactly_one_page(self):
        args = MODULE.parse_arguments(["--page", "3", "--page-size", "50"])
        self.assertEqual(args.start_page, 3)
        self.assertEqual(args.end_page, 3)
        self.assertEqual(args.page_size, 50)


class DatabaseTests(unittest.TestCase):
    def test_schema_is_additive_and_supports_upsert(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "clip_admin_rule.db"
            database = MODULE.TreatyDatabase(db_path)
            treaty = MODULE.TreatySummary(
                trty_srno="00000001",
                name="테스트 조약",
                category_code="03",
                category_name="FTA협정",
                countries="테스트국",
                treaty_number="1",
                effective_date="20260101",
                registered_date="20251201",
                list_page=1,
                list_row_number=1,
                korean_content="국문 본문",
                english_content=None,
                raw_json="{}",
            )
            database.upsert_treaty(treaty, "<p>상세</p>", "상세")
            database.upsert_attachment(
                treaty.trty_srno,
                MODULE.Attachment("ATT-1", "file.hwp", "(1KB)"),
                "attachments/조약협정/00000001/file.hwp",
                1024,
                "abc",
                "downloaded",
                None,
            )
            database.commit()
            tables = {
                row[0]
                for row in database.connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
            self.assertIn("clip_treaties", tables)
            self.assertIn("clip_treaty_attachments", tables)
            row = database.connection.execute(
                "SELECT treaty_name, detail_text FROM clip_treaties WHERE trty_srno = '00000001'"
            ).fetchone()
            self.assertEqual(tuple(row), ("테스트 조약", "상세"))
            database.close()
            self.assertTrue(sqlite3.connect(db_path).execute("SELECT 1").fetchone())


if __name__ == "__main__":
    unittest.main()
