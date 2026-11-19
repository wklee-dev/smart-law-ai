"""SQLite persistence for the law latest crawler V1 namespace."""

from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from typing import Any, Iterator, Mapping, Sequence

OWNER = "law_latest_crawler_v1"
SCHEMA_VERSION = "1.0"
PREFIX = "llc_v1_"


class StorageSchemaError(RuntimeError):
    """The database already has an incompatible llc_v1_ namespace."""


# (column name, declared type, not-null flag, primary-key order), as exposed by
# SQLite PRAGMA table_info.  It is intentionally strict: there is no migration
# path in this module, only an unambiguous fail-before-write policy.
COLUMNS: dict[str, tuple[tuple[str, str, int, int], ...]] = {
    "llc_v1_meta": (("key", "TEXT", 1, 1), ("value", "TEXT", 1, 0)),
    "llc_v1_runs": (
        ("run_id", "INTEGER", 0, 1),
        ("stage", "TEXT", 1, 0),
        ("options_json", "TEXT", 1, 0),
        ("status", "TEXT", 1, 0),
        ("stats_json", "TEXT", 1, 0),
        ("error", "TEXT", 1, 0),
        ("started_at", "TEXT", 1, 0),
        ("ended_at", "TEXT", 1, 0),
    ),
    "llc_v1_list": (
        ("key", "TEXT", 1, 1),
        ("category", "TEXT", 1, 0),
        ("source_id", "TEXT", 1, 0),
        ("effective_date", "TEXT", 1, 0),
        ("title", "TEXT", 1, 0),
        ("gubun", "TEXT", 1, 0),
        ("source_url", "TEXT", 1, 0),
        ("announce_date", "TEXT", 1, 0),
        ("expire_date", "TEXT", 1, 0),
        ("law_type", "TEXT", 1, 0),
        ("announce_no", "TEXT", 1, 0),
        ("revision_type", "TEXT", 1, 0),
        ("ministry", "TEXT", 1, 0),
        ("article_label", "TEXT", 1, 0),
        ("page", "INTEGER", 1, 0),
        ("match_status", "TEXT", 1, 0),
        ("matched_keywords", "TEXT", 1, 0),
        ("data_json", "TEXT", 1, 0),
        ("collected_at", "TEXT", 1, 0),
    ),
    "llc_v1_raw_articles": (
        ("item_key", "TEXT", 1, 1),
        ("part_id", "TEXT", 1, 2),
        ("title", "TEXT", 1, 0),
        ("text", "TEXT", 1, 0),
        ("html", "TEXT", 1, 0),
        ("gubun", "TEXT", 1, 0),
        ("collected_at", "TEXT", 1, 0),
    ),
    "llc_v1_raw_addendum": (
        ("item_key", "TEXT", 1, 1),
        ("part_id", "TEXT", 1, 2),
        ("title", "TEXT", 1, 0),
        ("text", "TEXT", 1, 0),
        ("html", "TEXT", 1, 0),
        ("gubun", "TEXT", 1, 0),
        ("collected_at", "TEXT", 1, 0),
    ),
    "llc_v1_raw_annex": (
        ("item_key", "TEXT", 1, 1),
        ("part_id", "TEXT", 1, 2),
        ("title", "TEXT", 1, 0),
        ("text", "TEXT", 1, 0),
        ("html", "TEXT", 1, 0),
        ("gubun", "TEXT", 1, 0),
        ("collected_at", "TEXT", 1, 0),
    ),
    "llc_v1_raw_attachment": (
        ("item_key", "TEXT", 1, 1),
        ("part_id", "TEXT", 1, 2),
        ("annex_id", "TEXT", 1, 0),
        ("url", "TEXT", 1, 0),
        ("display_name", "TEXT", 1, 0),
        ("local_path", "TEXT", 1, 0),
        ("size", "INTEGER", 0, 0),
        ("sha256", "TEXT", 1, 0),
        ("status", "TEXT", 1, 0),
        ("error", "TEXT", 1, 0),
        ("gubun", "TEXT", 1, 0),
        ("collected_at", "TEXT", 1, 0),
    ),
}
TABLES = tuple(COLUMNS)
INDEXES: dict[str, tuple[str, tuple[str, ...]]] = {
    "llc_v1_list_category_idx": ("llc_v1_list", ("category",)),
    "llc_v1_list_source_effective_idx": (
        "llc_v1_list",
        ("source_id", "effective_date"),
    ),
    "llc_v1_raw_articles_gubun_idx": ("llc_v1_raw_articles", ("gubun",)),
    "llc_v1_raw_addendum_gubun_idx": ("llc_v1_raw_addendum", ("gubun",)),
    "llc_v1_raw_annex_gubun_idx": ("llc_v1_raw_annex", ("gubun",)),
    "llc_v1_raw_attachment_gubun_idx": ("llc_v1_raw_attachment", ("gubun",)),
}
SECTION_TABLES = {
    "articles": "llc_v1_raw_articles",
    "addenda": "llc_v1_raw_addendum",
    "annexes": "llc_v1_raw_annex",
    "attachments": "llc_v1_raw_attachment",
}
REQUIRED_ITEM = (
    "key",
    "category",
    "source_id",
    "effective_date",
    "title",
    "gubun",
    "source_url",
)
OPTIONAL_TEXT = (
    "announce_date",
    "expire_date",
    "law_type",
    "announce_no",
    "revision_type",
    "ministry",
    "article_label",
    "match_status",
)

DDL = (
    """CREATE TABLE llc_v1_meta (
        key TEXT NOT NULL PRIMARY KEY,
        value TEXT NOT NULL
    )""",
    """CREATE TABLE llc_v1_runs (
        run_id INTEGER PRIMARY KEY,
        stage TEXT NOT NULL,
        options_json TEXT NOT NULL,
        status TEXT NOT NULL,
        stats_json TEXT NOT NULL,
        error TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL
    )""",
    """CREATE TABLE llc_v1_list (
        key TEXT NOT NULL PRIMARY KEY,
        category TEXT NOT NULL,
        source_id TEXT NOT NULL,
        effective_date TEXT NOT NULL,
        title TEXT NOT NULL,
        gubun TEXT NOT NULL,
        source_url TEXT NOT NULL,
        announce_date TEXT NOT NULL,
        expire_date TEXT NOT NULL,
        law_type TEXT NOT NULL,
        announce_no TEXT NOT NULL,
        revision_type TEXT NOT NULL,
        ministry TEXT NOT NULL,
        article_label TEXT NOT NULL,
        page INTEGER NOT NULL,
        match_status TEXT NOT NULL,
        matched_keywords TEXT NOT NULL,
        data_json TEXT NOT NULL,
        collected_at TEXT NOT NULL
    )""",
    """CREATE TABLE llc_v1_raw_articles (
        item_key TEXT NOT NULL,
        part_id TEXT NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        html TEXT NOT NULL,
        gubun TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        PRIMARY KEY (item_key, part_id),
        FOREIGN KEY (item_key) REFERENCES llc_v1_list(key) ON DELETE RESTRICT
    )""",
    """CREATE TABLE llc_v1_raw_addendum (
        item_key TEXT NOT NULL,
        part_id TEXT NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        html TEXT NOT NULL,
        gubun TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        PRIMARY KEY (item_key, part_id),
        FOREIGN KEY (item_key) REFERENCES llc_v1_list(key) ON DELETE RESTRICT
    )""",
    """CREATE TABLE llc_v1_raw_annex (
        item_key TEXT NOT NULL,
        part_id TEXT NOT NULL,
        title TEXT NOT NULL,
        text TEXT NOT NULL,
        html TEXT NOT NULL,
        gubun TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        PRIMARY KEY (item_key, part_id),
        FOREIGN KEY (item_key) REFERENCES llc_v1_list(key) ON DELETE RESTRICT
    )""",
    """CREATE TABLE llc_v1_raw_attachment (
        item_key TEXT NOT NULL,
        part_id TEXT NOT NULL,
        annex_id TEXT NOT NULL,
        url TEXT NOT NULL,
        display_name TEXT NOT NULL,
        local_path TEXT NOT NULL,
        size INTEGER,
        sha256 TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT NOT NULL,
        gubun TEXT NOT NULL,
        collected_at TEXT NOT NULL,
        PRIMARY KEY (item_key, part_id),
        FOREIGN KEY (item_key) REFERENCES llc_v1_list(key) ON DELETE RESTRICT
    )""",
    "CREATE INDEX llc_v1_list_category_idx ON llc_v1_list(category)",
    "CREATE INDEX llc_v1_list_source_effective_idx ON llc_v1_list(source_id, effective_date)",
    "CREATE INDEX llc_v1_raw_articles_gubun_idx ON llc_v1_raw_articles(gubun)",
    "CREATE INDEX llc_v1_raw_addendum_gubun_idx ON llc_v1_raw_addendum(gubun)",
    "CREATE INDEX llc_v1_raw_annex_gubun_idx ON llc_v1_raw_annex(gubun)",
    "CREATE INDEX llc_v1_raw_attachment_gubun_idx ON llc_v1_raw_attachment(gubun)",
)


class Storage:
    """SQLite storage with a private, verified llc_v1_ table namespace."""

    def __init__(self, path: str | Path) -> None:
        if not isinstance(path, (str, Path)):
            raise TypeError("path must be a str or pathlib.Path")
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).expanduser().parent.mkdir(parents=True, exist_ok=True)
        self._conn: sqlite3.Connection | None = sqlite3.connect(self.path)
        self._conn.row_factory = sqlite3.Row
        try:
            self._conn.execute("PRAGMA foreign_keys = ON")
            self._initialize()
        except Exception:
            self.close()
            raise

    def __enter__(self) -> Storage:
        self._connection()
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        self.close()

    def close(self) -> None:
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    def save_list(self, items: list[dict[str, Any]]) -> None:
        if not isinstance(items, list):
            raise TypeError("items must be a list")
        rows = [self._prepare_item(item) for item in items]
        if not rows:
            return
        with self._transaction():
            for row in rows:
                self._upsert_item(row)

    def get_items(
        self,
        ids: list[str] | None = None,
        category: str | None = None,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        conn = self._connection()
        if ids is not None:
            if not isinstance(ids, list) or any(
                not isinstance(value, str) for value in ids
            ):
                raise TypeError("ids must be a list of strings or None")
            if not ids:
                return []
        if category is not None and not isinstance(category, str):
            raise TypeError("category must be a string or None")
        if limit is not None:
            if isinstance(limit, bool) or not isinstance(limit, int) or limit < 0:
                raise ValueError("limit must be a non-negative integer or None")
            if limit == 0:
                return []
        clauses: list[str] = []
        values: list[Any] = []
        if ids is not None:
            clauses.append("key IN (" + ", ".join("?" for _ in ids) + ")")
            values.extend(ids)
        if category is not None:
            clauses.append("category = ?")
            values.append(category)
        sql = "SELECT data_json FROM llc_v1_list"
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY key COLLATE BINARY ASC"
        if limit is not None:
            sql += " LIMIT ?"
            values.append(limit)
        result: list[dict[str, Any]] = []
        for row in conn.execute(sql, values):
            try:
                data = json.loads(row["data_json"])
            except json.JSONDecodeError as exc:
                raise StorageSchemaError(
                    "llc_v1_list contains invalid data_json"
                ) from exc
            if not isinstance(data, dict):
                raise StorageSchemaError("llc_v1_list data_json must be an object")
            result.append(data)
        return result

    def begin_run(self, stage: str, options: dict[str, Any]) -> int:
        if not isinstance(stage, str) or not stage:
            raise ValueError("stage must be a non-empty string")
        if not isinstance(options, dict):
            raise TypeError("options must be a dictionary")
        with self._transaction() as conn:
            cursor = conn.execute(
                """INSERT INTO llc_v1_runs
                   (stage, options_json, status, stats_json, error, started_at, ended_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    stage,
                    self._json(options, "options"),
                    "running",
                    "{}",
                    "",
                    self._now(),
                    "",
                ),
            )
            return int(cursor.lastrowid)

    def end_run(
        self, run_id: int, status: str, stats: dict[str, Any], error: str = ""
    ) -> None:
        if isinstance(run_id, bool) or not isinstance(run_id, int) or run_id <= 0:
            raise ValueError("run_id must be a positive integer")
        if not isinstance(status, str) or not status:
            raise ValueError("status must be a non-empty string")
        if not isinstance(stats, dict):
            raise TypeError("stats must be a dictionary")
        if not isinstance(error, str):
            raise TypeError("error must be a string")
        with self._transaction() as conn:
            cursor = conn.execute(
                """UPDATE llc_v1_runs
                      SET status = ?, stats_json = ?, error = ?, ended_at = ?
                    WHERE run_id = ?""",
                (status, self._json(stats, "stats"), error, self._now(), run_id),
            )
            if cursor.rowcount != 1:
                raise ValueError(f"unknown run_id: {run_id}")

    def save_detail(self, item: dict[str, Any], detail: dict[str, Any]) -> None:
        """Upsert only the supplied detail rows; never delete old parsed rows."""
        item_row = self._prepare_item(item)
        sections = self._prepare_detail(detail)
        timestamp = self._now()
        with self._transaction() as conn:
            self._upsert_item(item_row, timestamp)
            for section in ("articles", "addenda", "annexes"):
                table = SECTION_TABLES[section]
                for part in sections[section]:
                    conn.execute(
                        f"""INSERT INTO {table}
                            (item_key, part_id, title, text, html, gubun, collected_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT(item_key, part_id) DO UPDATE SET
                              title=excluded.title, text=excluded.text, html=excluded.html,
                              gubun=excluded.gubun, collected_at=excluded.collected_at""",
                        (
                            item_row["key"],
                            part["id"],
                            part["title"],
                            part["text"],
                            part["html"],
                            item_row["gubun"],
                            timestamp,
                        ),
                    )
            for part in sections["attachments"]:
                conn.execute(
                    """INSERT INTO llc_v1_raw_attachment
                       (item_key, part_id, annex_id, url, display_name, local_path, size,
                        sha256, status, error, gubun, collected_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(item_key, part_id) DO UPDATE SET
                         annex_id=excluded.annex_id, url=excluded.url,
                         display_name=excluded.display_name, local_path=excluded.local_path,
                         size=excluded.size, sha256=excluded.sha256, status=excluded.status,
                         error=excluded.error, gubun=excluded.gubun,
                         collected_at=excluded.collected_at""",
                    (
                        item_row["key"],
                        part["id"],
                        part["annex_id"],
                        part["url"],
                        part["display_name"],
                        part["local_path"],
                        part["size"],
                        part["sha256"],
                        part["status"],
                        part["error"],
                        item_row["gubun"],
                        timestamp,
                    ),
                )

    def _initialize(self) -> None:
        conn = self._connection()
        objects = conn.execute(
            """SELECT name, type FROM sqlite_master
                 WHERE name LIKE ? ESCAPE '\\'
                   AND type IN ('table', 'index', 'view', 'trigger')""",
            ("llc\\_v1\\_%",),
        ).fetchall()
        if objects:
            self._verify(objects)
            return
        try:
            conn.execute("BEGIN IMMEDIATE")
            for statement in DDL:
                conn.execute(statement)
            conn.executemany(
                "INSERT INTO llc_v1_meta(key, value) VALUES (?, ?)",
                (("owner", OWNER), ("schema_version", SCHEMA_VERSION)),
            )
            conn.execute("COMMIT")
        except Exception:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise

    def _verify(self, objects: Sequence[sqlite3.Row]) -> None:
        conn = self._connection()
        expected = set(TABLES) | set(INDEXES)
        actual = {str(row["name"]) for row in objects}
        extra, missing = actual - expected, expected - actual
        if extra or missing:
            description = []
            if extra:
                description.append("unexpected: " + ", ".join(sorted(extra)))
            if missing:
                description.append("missing: " + ", ".join(sorted(missing)))
            raise StorageSchemaError(
                "existing llc_v1_ namespace is not owned V1 schema ("
                + "; ".join(description)
                + ")"
            )
        kinds = {str(row["name"]): str(row["type"]) for row in objects}
        for table in TABLES:
            if kinds.get(table) != "table":
                raise StorageSchemaError(f"schema mismatch for {table}")
            observed = tuple(
                (
                    str(row["name"]),
                    str(row["type"]).upper(),
                    int(row["notnull"]),
                    int(row["pk"]),
                )
                for row in conn.execute(f"PRAGMA table_info({table})")
            )
            if observed != COLUMNS[table]:
                raise StorageSchemaError(f"schema mismatch for {table}")
        for index, (table, columns) in INDEXES.items():
            if kinds.get(index) != "index":
                raise StorageSchemaError(f"schema mismatch for {index}")
            index_row = conn.execute(
                "SELECT tbl_name FROM sqlite_master WHERE type = ? AND name = ?",
                ("index", index),
            ).fetchone()
            observed = tuple(
                str(row["name"]) for row in conn.execute(f"PRAGMA index_info({index})")
            )
            if (
                index_row is None
                or index_row["tbl_name"] != table
                or observed != columns
            ):
                raise StorageSchemaError(f"schema mismatch for {index}")
        for table in (
            "llc_v1_raw_articles",
            "llc_v1_raw_addendum",
            "llc_v1_raw_annex",
            "llc_v1_raw_attachment",
        ):
            foreign = list(conn.execute(f"PRAGMA foreign_key_list({table})"))
            if len(foreign) != 1:
                raise StorageSchemaError(f"schema mismatch for {table} foreign key")
            row = foreign[0]
            if (row["table"], row["from"], row["to"], row["on_delete"].upper()) != (
                "llc_v1_list",
                "item_key",
                "key",
                "RESTRICT",
            ):
                raise StorageSchemaError(f"schema mismatch for {table} foreign key")
        markers = {
            str(row["key"]): str(row["value"])
            for row in conn.execute("SELECT key, value FROM llc_v1_meta")
        }
        if (
            markers.get("owner") != OWNER
            or markers.get("schema_version") != SCHEMA_VERSION
        ):
            raise StorageSchemaError(
                "existing llc_v1_ namespace lacks this module owner marker"
            )

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        conn = self._connection()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.execute("COMMIT")
        except Exception:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise

    def _upsert_item(
        self, item: Mapping[str, Any], timestamp: str | None = None
    ) -> None:
        self._connection().execute(
            """INSERT INTO llc_v1_list
               (key, category, source_id, effective_date, title, gubun, source_url,
                announce_date, expire_date, law_type, announce_no, revision_type,
                ministry, article_label, page, match_status, matched_keywords,
                data_json, collected_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET
                 category=excluded.category, source_id=excluded.source_id,
                 effective_date=excluded.effective_date, title=excluded.title,
                 gubun=excluded.gubun, source_url=excluded.source_url,
                 announce_date=excluded.announce_date, expire_date=excluded.expire_date,
                 law_type=excluded.law_type, announce_no=excluded.announce_no,
                 revision_type=excluded.revision_type, ministry=excluded.ministry,
                 article_label=excluded.article_label, page=excluded.page,
                 match_status=excluded.match_status, matched_keywords=excluded.matched_keywords,
                 data_json=excluded.data_json, collected_at=excluded.collected_at""",
            (
                item["key"],
                item["category"],
                item["source_id"],
                item["effective_date"],
                item["title"],
                item["gubun"],
                item["source_url"],
                item["announce_date"],
                item["expire_date"],
                item["law_type"],
                item["announce_no"],
                item["revision_type"],
                item["ministry"],
                item["article_label"],
                item["page"],
                item["match_status"],
                item["matched_keywords"],
                item["data_json"],
                timestamp or self._now(),
            ),
        )

    def _prepare_item(self, item: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(item, dict):
            raise TypeError("item must be a dictionary")
        for field in REQUIRED_ITEM:
            if field not in item:
                raise ValueError(f"item is missing required field: {field}")
            if not isinstance(item[field], str):
                raise TypeError(f"item field {field} must be a string")
        if not item["key"]:
            raise ValueError("item key must not be empty")
        if item["effective_date"] not in ("", "미정"):
            try:
                datetime.strptime(item["effective_date"], "%Y-%m-%d")
            except ValueError as exc:
                raise ValueError(
                    "effective_date must be YYYY-MM-DD, 미정, or empty"
                ) from exc
        self._numeric_array(item["gubun"], "gubun")
        if "matched_keywords" in item:
            if not isinstance(item["matched_keywords"], str):
                raise TypeError("matched_keywords must be a JSON string")
            self._json_load(item["matched_keywords"], "matched_keywords")
        for field in OPTIONAL_TEXT:
            if field in item and not isinstance(item[field], str):
                raise TypeError(f"item field {field} must be a string")
        page = item.get("page", 0)
        if isinstance(page, bool) or not isinstance(page, int):
            raise TypeError("item field page must be an integer")
        return {
            "key": item["key"],
            "category": item["category"],
            "source_id": item["source_id"],
            "effective_date": item["effective_date"],
            "title": item["title"],
            "gubun": item["gubun"],
            "source_url": item["source_url"],
            "announce_date": item.get("announce_date", ""),
            "expire_date": item.get("expire_date", ""),
            "law_type": item.get("law_type", ""),
            "announce_no": item.get("announce_no", ""),
            "revision_type": item.get("revision_type", ""),
            "ministry": item.get("ministry", ""),
            "article_label": item.get("article_label", ""),
            "page": page,
            "match_status": item.get("match_status", ""),
            "matched_keywords": item.get("matched_keywords", "[]"),
            "data_json": self._json(item, "item"),
        }

    @staticmethod
    def _prepare_detail(detail: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
        if not isinstance(detail, dict):
            raise TypeError("detail must be a dictionary")
        missing = set(SECTION_TABLES) - set(detail)
        if missing:
            raise ValueError(
                "detail is missing sections: " + ", ".join(sorted(missing))
            )
        result: dict[str, list[dict[str, Any]]] = {}
        for section in ("articles", "addenda", "annexes"):
            entries = detail[section]
            if not isinstance(entries, list):
                raise TypeError(f"detail section {section} must be a list")
            result[section] = []
            for entry in entries:
                if not isinstance(entry, dict):
                    raise TypeError(f"{section} entry must be a dictionary")
                for field in ("id", "title", "text", "html"):
                    if field not in entry:
                        raise ValueError(f"{section} entry is missing field: {field}")
                    if not isinstance(entry[field], str):
                        raise TypeError(
                            f"{section} entry field {field} must be a string"
                        )
                if not entry["id"]:
                    raise ValueError(f"{section} entry id must not be empty")
                result[section].append(
                    {field: entry[field] for field in ("id", "title", "text", "html")}
                )
        entries = detail["attachments"]
        if not isinstance(entries, list):
            raise TypeError("detail section attachments must be a list")
        result["attachments"] = []
        fields = (
            "id",
            "annex_id",
            "url",
            "display_name",
            "local_path",
            "size",
            "sha256",
            "status",
            "error",
        )
        for entry in entries:
            if not isinstance(entry, dict):
                raise TypeError("attachment must be a dictionary")
            for field in fields:
                if field not in entry:
                    raise ValueError(f"attachment is missing field: {field}")
                if field != "size" and not isinstance(entry[field], str):
                    raise TypeError(f"attachment field {field} must be a string")
            size = entry["size"]
            if size is not None and (
                isinstance(size, bool) or not isinstance(size, int) or size < 0
            ):
                raise TypeError(
                    "attachment size must be a non-negative integer or None"
                )
            if not entry["id"]:
                raise ValueError("attachment id must not be empty")
            result["attachments"].append({field: entry[field] for field in fields})
        return result

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    @staticmethod
    def _json(value: Any, label: str) -> str:
        try:
            return json.dumps(
                value, ensure_ascii=False, separators=(",", ":"), allow_nan=False
            )
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{label} must be JSON serializable") from exc

    @staticmethod
    def _json_load(value: str, label: str) -> Any:
        try:
            return json.loads(
                value,
                parse_constant=lambda token: (_ for _ in ()).throw(ValueError(token)),
            )
        except (json.JSONDecodeError, ValueError) as exc:
            raise ValueError(f"{label} must be valid JSON") from exc

    def _numeric_array(self, value: str, label: str) -> None:
        parsed = self._json_load(value, label)
        if not isinstance(parsed, list) or any(
            isinstance(x, bool) or not isinstance(x, (int, float)) for x in parsed
        ):
            raise ValueError(f"{label} must be a JSON array of numbers")

    def _connection(self) -> sqlite3.Connection:
        if self._conn is None:
            raise RuntimeError("storage is closed")
        return self._conn
