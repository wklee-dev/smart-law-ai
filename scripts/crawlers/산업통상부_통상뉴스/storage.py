"""SQLite persistence for FTA trade news.

The caller chooses and creates the database file and any parent directories;
this module never creates or truncates a file.  Pass an existing filesystem
path (str or os.PathLike), or ':memory:' for an explicitly in-memory database.

Both save functions own their transaction and commit on success. They reject an
already active caller transaction rather than committing or rolling it back.
A missing optional field preserves its existing value on an upsert; explicitly
passing None clears it. Required fields are replaced on every upsert, including
the original body text and HTML. Article/asset keys accept str or int and are
stored as TEXT; the remaining field types are documented in the functions.
"""

from datetime import datetime, timezone
from pathlib import Path
import sqlite3


_BUSY_TIMEOUT_MS = 5000

_CREATE_ARTICLES = """
CREATE TABLE IF NOT EXISTS fta_trade_news_articles (
    article_id TEXT NOT NULL PRIMARY KEY,
    title TEXT NOT NULL,
    registered_date TEXT NOT NULL,
    source_url TEXT NOT NULL,
    body_text TEXT NOT NULL,
    body_html TEXT NOT NULL,
    view_count INTEGER,
    list_page INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""

_CREATE_ASSETS = """
CREATE TABLE IF NOT EXISTS fta_trade_news_assets (
    article_id TEXT NOT NULL,
    asset_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    original_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    status TEXT NOT NULL,
    saved_path TEXT,
    size_bytes INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (article_id, asset_key),
    FOREIGN KEY (article_id) REFERENCES fta_trade_news_articles(article_id)
)
"""

_ARTICLE_UPSERT = """
INSERT INTO fta_trade_news_articles (
    article_id, title, registered_date, source_url, body_text, body_html,
    view_count, list_page, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(article_id) DO UPDATE SET
    title = excluded.title,
    registered_date = excluded.registered_date,
    source_url = excluded.source_url,
    body_text = excluded.body_text,
    body_html = excluded.body_html,
    view_count = CASE WHEN ? THEN excluded.view_count
                      ELSE fta_trade_news_articles.view_count END,
    list_page = CASE WHEN ? THEN excluded.list_page
                     ELSE fta_trade_news_articles.list_page END,
    updated_at = excluded.updated_at
"""

_ASSET_UPSERT = """
INSERT INTO fta_trade_news_assets (
    article_id, asset_key, kind, original_name, source_url, status,
    saved_path, size_bytes, error_message, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(article_id, asset_key) DO UPDATE SET
    kind = excluded.kind,
    original_name = excluded.original_name,
    source_url = excluded.source_url,
    status = excluded.status,
    saved_path = CASE WHEN ? THEN excluded.saved_path
                      ELSE fta_trade_news_assets.saved_path END,
    size_bytes = CASE WHEN ? THEN excluded.size_bytes
                      ELSE fta_trade_news_assets.size_bytes END,
    error_message = CASE WHEN ? THEN excluded.error_message
                         ELSE fta_trade_news_assets.error_message END,
    updated_at = excluded.updated_at
"""

# name: (declared type, NOT NULL, primary-key position)
_ARTICLE_COLUMNS = {
    "article_id": ("TEXT", 1, 1),
    "title": ("TEXT", 1, 0),
    "registered_date": ("TEXT", 1, 0),
    "source_url": ("TEXT", 1, 0),
    "body_text": ("TEXT", 1, 0),
    "body_html": ("TEXT", 1, 0),
    "view_count": ("INTEGER", 0, 0),
    "list_page": ("INTEGER", 0, 0),
    "created_at": ("TEXT", 1, 0),
    "updated_at": ("TEXT", 1, 0),
}
_ASSET_COLUMNS = {
    "article_id": ("TEXT", 1, 1),
    "asset_key": ("TEXT", 1, 2),
    "kind": ("TEXT", 1, 0),
    "original_name": ("TEXT", 1, 0),
    "source_url": ("TEXT", 1, 0),
    "status": ("TEXT", 1, 0),
    "saved_path": ("TEXT", 0, 0),
    "size_bytes": ("INTEGER", 0, 0),
    "error_message": ("TEXT", 0, 0),
    "created_at": ("TEXT", 1, 0),
    "updated_at": ("TEXT", 1, 0),
}


def _rows(conn, sql, parameters=()):
    """Read PRAGMAs independently of any caller-configured row_factory."""
    cursor = conn.cursor()
    cursor.row_factory = None
    try:
        return cursor.execute(sql, parameters).fetchall()
    finally:
        cursor.close()


def _check_schema(conn):
    # Never alter an incompatible pre-existing namesake table. Abort the whole
    # initialization transaction, including any table created in this attempt.
    for name, columns, pragma in (
        ("fta_trade_news_articles", _ARTICLE_COLUMNS,
         'PRAGMA table_info("fta_trade_news_articles")'),
        ("fta_trade_news_assets", _ASSET_COLUMNS,
         'PRAGMA table_info("fta_trade_news_assets")'),
    ):
        object_type = _rows(
            conn, "SELECT type FROM sqlite_master WHERE name = ?", (name,)
        )
        if object_type != [("table",)]:
            raise RuntimeError(f"Incompatible existing SQLite object: {name}")
        info = {row[1]: (row[2].upper(), row[3], row[5])
                for row in _rows(conn, pragma)}
        if any(info.get(column) != spec for column, spec in columns.items()):
            raise RuntimeError(f"Incompatible existing SQLite table: {name}")
        actual_pk = {column for column, spec in info.items() if spec[2]}
        expected_pk = {column for column, spec in columns.items() if spec[2]}
        if actual_pk != expected_pk:
            raise RuntimeError(f"Incompatible existing SQLite primary key: {name}")

    foreign_keys = _rows(conn, 'PRAGMA foreign_key_list("fta_trade_news_assets")')
    if not any(
        row[2:5] == ("fta_trade_news_articles", "article_id", "article_id")
        and sum(other[0] == row[0] for other in foreign_keys) == 1
        for row in foreign_keys
    ):
        raise RuntimeError("Asset table must reference the article table")


def _rollback_if_active(conn):
    if conn.in_transaction:
        try:
            conn.execute("ROLLBACK")
        except sqlite3.Error:
            # Preserve the original exception if SQLite has already aborted.
            pass


def open_database(db_path):
    """Open an existing database, initialize the two tables, and return it.

    No default path or parent-directory/file creation is provided. ':memory:'
    explicitly requests a new in-memory database. Foreign keys and a 5-second
    busy timeout are enabled per connection. Schema initialization is atomic;
    incompatible existing namesake tables raise RuntimeError without migration.
    The caller owns and must close the returned connection.
    """
    if db_path == ":memory:":
        conn = sqlite3.connect(":memory:")
    else:
        # The URI mode=rw opens an existing file only. as_uri quotes special
        # filename characters such as '?' and '#'; SQLite must not create it.
        uri = Path(db_path).absolute().as_uri() + "?mode=rw"
        conn = sqlite3.connect(uri, uri=True)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute(f"PRAGMA busy_timeout = {_BUSY_TIMEOUT_MS}")
        if _rows(conn, "PRAGMA foreign_keys") != [(1,)]:
            raise RuntimeError("SQLite foreign key enforcement is unavailable")
        conn.execute("BEGIN")
        try:
            conn.execute(_CREATE_ARTICLES)
            conn.execute(_CREATE_ASSETS)
            _check_schema(conn)
            conn.execute("COMMIT")
        except BaseException:
            _rollback_if_active(conn)
            raise
        return conn
    except BaseException:
        conn.close()
        raise


def _utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def _required(item, names):
    if not isinstance(item, dict):
        raise TypeError("item must be a dict")
    missing = [name for name in names if name not in item]
    if missing:
        raise KeyError("Missing required keys: " + ", ".join(missing))


def _key(value, name):
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise TypeError(f"{name} must be str or int")
    result = str(value)
    if not result.strip():
        raise ValueError(f"{name} must not be blank")
    return result


def _text(value, name, optional=False):
    if value is None and optional:
        return None
    if not isinstance(value, str):
        raise TypeError(f"{name} must be str" + (" or None" if optional else ""))
    return value


def _integer(value, name):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{name} must be int or None")
    return value


def _save(conn, sql, parameters):
    if conn.in_transaction:
        raise RuntimeError("Cannot save inside an existing transaction")
    if _rows(conn, "PRAGMA foreign_keys") != [(1,)]:
        raise RuntimeError("Foreign key enforcement must be enabled")
    timeout = _rows(conn, "PRAGMA busy_timeout")
    if not timeout or timeout[0][0] <= 0:
        raise RuntimeError("A positive SQLite busy timeout is required")
    conn.execute("BEGIN")
    try:
        conn.execute(sql, parameters)
        conn.execute("COMMIT")
    except BaseException:
        _rollback_if_active(conn)
        raise


def save_article(conn, item):
    """Atomically upsert an article by article_id and commit.

    Required: article_id (str/int), title, registered_date, source_url,
    body_text and body_html (str). Optional: view_count and list_page
    (int/None). Raw body strings are stored without transformation.
    """
    required = ("article_id", "title", "registered_date", "source_url",
                "body_text", "body_html")
    _required(item, required)
    key = _key(item["article_id"], "article_id")
    texts = tuple(_text(item[name], name) for name in required[1:])
    view_count = _integer(item.get("view_count"), "view_count")
    list_page = _integer(item.get("list_page"), "list_page")
    now = _utc_now()
    _save(conn, _ARTICLE_UPSERT,
          (key, *texts, view_count, list_page, now, now,
           int("view_count" in item), int("list_page" in item)))


def save_asset(conn, item):
    """Atomically upsert an asset by (article_id, asset_key) and commit.

    Required: article_id and asset_key (str/int); kind, original_name,
    source_url and status (str). Optional: saved_path and error_message
    (str/None), size_bytes (int/None). A parent article must already exist.
    Status is unrestricted so failures and retry states can be recorded. On a
    successful retry pass error_message=None to clear an earlier error.
    """
    required = ("article_id", "asset_key", "kind", "original_name",
                "source_url", "status")
    _required(item, required)
    article_id = _key(item["article_id"], "article_id")
    asset_key = _key(item["asset_key"], "asset_key")
    texts = tuple(_text(item[name], name) for name in required[2:])
    saved_path = _text(item.get("saved_path"), "saved_path", optional=True)
    size_bytes = _integer(item.get("size_bytes"), "size_bytes")
    error_message = _text(item.get("error_message"), "error_message", optional=True)
    now = _utc_now()
    _save(conn, _ASSET_UPSERT,
          (article_id, asset_key, *texts, saved_path, size_bytes, error_message,
           now, now, int("saved_path" in item), int("size_bytes" in item),
           int("error_message" in item)))
