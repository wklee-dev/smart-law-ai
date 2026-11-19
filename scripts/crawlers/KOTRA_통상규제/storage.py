"""SQLite storage for KOTRA trade articles and their attachments.

Only the two ``kotra_trade_*`` tables declared here are created or modified.
``init_db`` creates and commits the schema.  Each successful ``save_*`` call
commits the connection; as with ``Connection.commit()``, this also commits any
other pending changes on that connection.  A failed operation rolls back its
own savepoint without rolling back earlier caller work.
"""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator


_ARTICLE_COLUMNS = (
    ("source_id", "TEXT", False, 1),
    ("title", "TEXT", False, 0),
    ("category", "TEXT", False, 0),
    ("country", "TEXT", False, 0),
    ("office", "TEXT", False, 0),
    ("published_date", "TEXT", False, 0),
    ("source", "TEXT", False, 0),
    ("keywords", "TEXT", False, 0),
    ("summary", "TEXT", False, 0),
    ("content_text", "TEXT", False, 0),
    ("content_html", "TEXT", False, 0),
    ("original_url", "TEXT", False, 0),
    ("list_json", "TEXT", False, 0),
    ("fetched_at", "TEXT", False, 0),
    ("updated_at", "TEXT", False, 0),
)
_ATTACHMENT_COLUMNS = (
    ("source_id", "TEXT", True, 1),
    ("file_id", "TEXT", True, 2),
    ("original_name", "TEXT", False, 0),
    ("download_url", "TEXT", False, 0),
    ("local_path", "TEXT", False, 0),
    ("status", "TEXT", False, 0),
    ("size_bytes", "INTEGER", False, 0),
    ("sha256", "TEXT", False, 0),
    ("error", "TEXT", False, 0),
    ("updated_at", "TEXT", False, 0),
)
_SCHEMAS = {
    "kotra_trade_articles": _ARTICLE_COLUMNS,
    "kotra_trade_attachments": _ATTACHMENT_COLUMNS,
}

_CREATE_ARTICLES = """
CREATE TABLE IF NOT EXISTS main.kotra_trade_articles (
    source_id TEXT PRIMARY KEY,
    title TEXT,
    category TEXT,
    country TEXT,
    office TEXT,
    published_date TEXT,
    source TEXT,
    keywords TEXT,
    summary TEXT,
    content_text TEXT,
    content_html TEXT,
    original_url TEXT,
    list_json TEXT,
    fetched_at TEXT,
    updated_at TEXT
)
"""
_CREATE_ATTACHMENTS = """
CREATE TABLE IF NOT EXISTS main.kotra_trade_attachments (
    source_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    original_name TEXT,
    download_url TEXT,
    local_path TEXT,
    status TEXT,
    size_bytes INTEGER,
    sha256 TEXT,
    error TEXT,
    updated_at TEXT,
    PRIMARY KEY (source_id, file_id),
    FOREIGN KEY (source_id) REFERENCES kotra_trade_articles(source_id)
)
"""


class SchemaError(RuntimeError):
    """A target table is missing or incompatible with the required schema."""


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _validate_table(conn: sqlite3.Connection, name: str, *, required: bool) -> None:
    """Check a main-database table without modifying it or other objects."""
    obj = conn.execute(
        "SELECT type, name FROM main.sqlite_master WHERE name = ? COLLATE NOCASE",
        (name,),
    ).fetchone()
    if obj is None:
        if required:
            raise SchemaError(f"Required table {name!r} does not exist; call init_db first")
        return
    if obj[0] != "table":
        raise SchemaError(f"Cannot use {name!r}: existing object is a {obj[0]}, not a table")

    # Table names are fixed module constants, not caller input. table_xinfo also
    # catches hidden/generated extra columns which table_info would omit.
    rows = conn.execute(f'PRAGMA main.table_xinfo("{name}")').fetchall()
    expected = {column[0]: column for column in _SCHEMAS[name]}
    actual = {row[1]: row for row in rows}
    if set(actual) != set(expected):
        missing = sorted(set(expected) - set(actual))
        extra = sorted(set(actual) - set(expected))
        raise SchemaError(f"Incompatible {name!r} columns: missing={missing}, extra={extra}")

    for column, declared_type, not_null, primary_key_order in _SCHEMAS[name]:
        row = actual[column]
        if row[6] != 0:
            raise SchemaError(f"Incompatible {name!r}: column {column!r} is hidden or generated")
        if (row[2] or "").strip().upper() != declared_type:
            raise SchemaError(
                f"Incompatible {name!r}: column {column!r} must have type {declared_type}"
            )
        if row[5] != primary_key_order:
            raise SchemaError(f"Incompatible {name!r}: incorrect primary key for {column!r}")
        # A NOT NULL article primary key is a harmless, stricter variant of
        # SQLite's usual nullable TEXT PRIMARY KEY. Other nullability matters
        # because every optional field can be saved as NULL.
        actual_not_null = bool(row[3])
        if not (name == "kotra_trade_articles" and column == "source_id"):
            if actual_not_null != not_null:
                raise SchemaError(f"Incompatible {name!r}: incorrect nullability for {column!r}")

    if name == "kotra_trade_attachments":
        foreign_keys = conn.execute(
            'PRAGMA main.foreign_key_list("kotra_trade_attachments")'
        ).fetchall()
        if (
            len(foreign_keys) != 1
            or foreign_keys[0][2].lower() != "kotra_trade_articles"
            or foreign_keys[0][3] != "source_id"
            or foreign_keys[0][4] != "source_id"
        ):
            raise SchemaError(
                "Incompatible 'kotra_trade_attachments': expected a source_id "
                "foreign key referencing kotra_trade_articles(source_id)"
            )


def _validate_schema(conn: sqlite3.Connection, *, required: bool) -> None:
    for name in _SCHEMAS:
        _validate_table(conn, name, required=required)


def _require_foreign_keys(conn: sqlite3.Connection) -> None:
    row = conn.execute("PRAGMA foreign_keys").fetchone()
    if not row or row[0] != 1:
        raise RuntimeError("SQLite foreign key enforcement must be enabled; use init_db")


@contextmanager
def _savepoint(conn: sqlite3.Connection) -> Iterator[None]:
    """Isolate this operation while retaining any pre-existing transaction."""
    conn.execute("SAVEPOINT kotra_storage_operation")
    try:
        yield
        conn.execute("RELEASE SAVEPOINT kotra_storage_operation")
    except BaseException:
        # A failing RELEASE (for example, a deferred foreign key violation) can
        # leave the savepoint active; preserve the original exception if SQLite
        # has already discarded it.
        try:
            conn.execute("ROLLBACK TO SAVEPOINT kotra_storage_operation")
            conn.execute("RELEASE SAVEPOINT kotra_storage_operation")
        except sqlite3.Error:
            pass
        raise


def init_db(path: str | os.PathLike[str]) -> sqlite3.Connection:
    """Open *path*, enable foreign keys, validate and commit the two schemas.

    Parent directories are created if needed. Existing databases and unrelated
    tables are preserved. Incompatible existing target tables raise SchemaError
    before either target table is created. The returned connection is owned by
    the caller, who must eventually close it. ``:memory:`` is also supported.
    """
    db_path = os.fsdecode(os.fspath(path))
    if db_path != ":memory:":
        db_path = str(Path(db_path).expanduser())
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        _require_foreign_keys(conn)
        with _savepoint(conn):
            _validate_schema(conn, required=False)
            conn.execute(_CREATE_ARTICLES)
            conn.execute(_CREATE_ATTACHMENTS)
            _validate_schema(conn, required=True)
        conn.commit()
        return conn
    except BaseException:
        conn.close()
        raise


def _identifier(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    if value is None or str(value) == "":
        raise ValueError(f"{key} is required and must not be empty")
    return str(value)


def _text_json(value: Any) -> Any:
    """Accept already serialized text or serialize structured JSON fields."""
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, ensure_ascii=False)
    return value


def save_article(conn: sqlite3.Connection, article: dict[str, Any]) -> None:
    """Upsert a complete article and commit; omitted optional fields become NULL.

    ``source_id`` is required. On insert, missing or None ``fetched_at`` and
    ``updated_at`` default to the current local ISO time (seconds). On update,
    the original ``fetched_at`` is never changed and ``updated_at`` uses the
    supplied value or the current time. Dict/list/tuple values for ``keywords``
    and ``list_json`` are serialized as JSON; strings are stored unchanged.
    A successful call also commits any existing pending changes on *conn*.
    """
    _require_foreign_keys(conn)
    source_id = _identifier(article, "source_id")
    timestamp = _now()
    values = []
    for name, _, _, _ in _ARTICLE_COLUMNS:
        if name == "source_id":
            value = source_id
        elif name in ("fetched_at", "updated_at"):
            value = article.get(name)
            if value is None:
                value = timestamp
        else:
            value = article.get(name)
            if name in ("keywords", "list_json"):
                value = _text_json(value)
        values.append(value)

    names = [spec[0] for spec in _ARTICLE_COLUMNS]
    columns = ", ".join(f'"{name}"' for name in names)
    placeholders = ", ".join("?" for _ in names)
    updates = ", ".join(
        f'"{name}" = excluded."{name}"'
        for name in names if name not in ("source_id", "fetched_at")
    )
    with _savepoint(conn):
        _validate_schema(conn, required=True)
        conn.execute(
            f"INSERT INTO main.kotra_trade_articles ({columns}) VALUES ({placeholders}) "
            f"ON CONFLICT(source_id) DO UPDATE SET {updates}",
            values,
        )
    conn.commit()


def save_attachment(conn: sqlite3.Connection, attachment: dict[str, Any]) -> None:
    """Upsert attachment metadata and commit; omitted optional fields become NULL.

    ``source_id`` and ``file_id`` are required, and the parent article must
    exist. A missing or None ``updated_at`` defaults to the current local ISO
    time (seconds). A successful call also commits any existing pending changes
    on *conn*. Foreign key or other SQLite errors are propagated to the caller.
    """
    _require_foreign_keys(conn)
    source_id = _identifier(attachment, "source_id")
    file_id = _identifier(attachment, "file_id")
    values = []
    for name, _, _, _ in _ATTACHMENT_COLUMNS:
        if name == "source_id":
            value = source_id
        elif name == "file_id":
            value = file_id
        elif name == "updated_at":
            value = attachment.get(name)
            if value is None:
                value = _now()
        else:
            value = attachment.get(name)
        values.append(value)

    names = [spec[0] for spec in _ATTACHMENT_COLUMNS]
    columns = ", ".join(f'"{name}"' for name in names)
    placeholders = ", ".join("?" for _ in names)
    updates = ", ".join(
        f'"{name}" = excluded."{name}"'
        for name in names if name not in ("source_id", "file_id")
    )
    with _savepoint(conn):
        _validate_schema(conn, required=True)
        conn.execute(
            f"INSERT INTO main.kotra_trade_attachments ({columns}) VALUES ({placeholders}) "
            f"ON CONFLICT(source_id, file_id) DO UPDATE SET {updates}",
            values,
        )
    conn.commit()
