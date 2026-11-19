"""Offline validation for the corrected UNI-PASS crawler; no browser login or network access."""
import ast
import importlib.util
import sqlite3
import tempfile
from pathlib import Path

SOURCE = Path(__file__).parent / "unipass_전자등기우편발송목록" / "unipass_post_crawler.py"
spec = importlib.util.spec_from_file_location("crawler", SOURCE)
crawler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crawler)

assert crawler.get_week_dates(2026, 10) == ("2026-03-02", "2026-03-08")
assert crawler._format_date("20240531") == "2024-05-31"
assert crawler._format_date("2024-05-31") == "2024-05-31"
assert crawler._extract_erpst_no("javascript:open('007202405001046')") == "007202405001046"


class DummyWait:
    """Bypasses DOM predicates so do_search can be tested without a browser."""

    def __init__(self, *_args, **_kwargs):
        pass

    def until(self, _condition):
        return True


class FakeDriver:
    def __init__(self):
        self.scripts = []

    def execute_script(self, script, *arguments):
        self.scripts.append((script, arguments))
        if "setNativeValue" in script:
            return {"ok": True}
        return []


# The reported ElementNotInteractableException was raised by element.click() in
# do_search. This verifies that the function delegates input and search to one
# JavaScript execution rather than interacting with WebElement controls.
original_wait = crawler.WebDriverWait
crawler.WebDriverWait = DummyWait
try:
    fake_driver = FakeDriver()
    crawler.do_search(fake_driver, "2026-03-02", "2026-03-08")
finally:
    crawler.WebDriverWait = original_wait

search_calls = [call for call in fake_driver.scripts if "setNativeValue" in call[0]]
assert len(search_calls) == 1
assert search_calls[0][1] == ("2026-03-02", "2026-03-08")

# The direct menu function must not invoke the site's login redirect function.
source_tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
navigate_node = next(
    node for node in source_tree.body
    if isinstance(node, ast.FunctionDef) and node.name == "navigate_to_post_menu"
)
navigate_called_names = {
    node.func.id
    for node in ast.walk(navigate_node)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
}
assert "myc_f_openLgnDrt" not in navigate_called_names

# The search function must not call a Selenium WebElement click/input method.
search_node = next(
    node for node in source_tree.body
    if isinstance(node, ast.FunctionDef) and node.name == "do_search"
)
search_method_calls = {
    node.func.attr
    for node in ast.walk(search_node)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
}
assert not {"click", "send_keys", "clear", "select_by_value"}.intersection(search_method_calls)

with tempfile.TemporaryDirectory() as temporary_directory:
    db_path = Path(temporary_directory) / "legacy.db"
    connection = sqlite3.connect(db_path)
    connection.execute("""
        CREATE TABLE post_detail (
            발송일자 TEXT NOT NULL,
            업무구분 TEXT NOT NULL,
            대상문서명 TEXT NOT NULL,
            문서구분부호 TEXT NOT NULL,
            수신확인일자 TEXT NOT NULL,
            PRIMARY KEY (발송일자, 업무구분, 대상문서명, 문서구분부호, 수신확인일자)
        )
    """)
    connection.commit()
    connection.close()

    crawler.setup_logger(temporary_directory)
    connection = crawler.init_db(str(db_path))
    columns = {row[1] for row in connection.execute("PRAGMA table_info(post_detail)")}
    assert {"전자등기우편번호", "pdf_경로", "본문내용"}.issubset(columns)

    row = {
        "발송일자": "2024-05-31",
        "업무구분": "품목분류분석",
        "대상문서명": "품목분류회신서",
        "문서구분부호": "PCAS004",
        "수신확인일자": "2024-05-31",
    }
    crawler.upsert_list(connection, row)
    crawler.upsert_detail(connection, row, "007202405001046", "/tmp/test.pdf", "본문")
    connection.commit()
    assert connection.execute("SELECT COUNT(*) FROM post_list").fetchone()[0] == 1
    assert connection.execute("SELECT COUNT(*) FROM post_detail").fetchone()[0] == 1
    connection.close()

pdf_path = Path(__file__).parent / "unipass_전자등기우편발송목록" / "downloads" / "007202405001046_1.pdf"
text = crawler.extract_pdf_text(pdf_path)
assert "품목분류" in text
print("Offline validation passed")
