"""SQLite persistence for KOTRA US trade-policy articles."""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

ARTICLE_TABLE = "kotra_us_trade_articles"
ATTACHMENT_TABLE = "kotra_us_trade_attachments"
RUN_TABLE = "kotra_us_trade_crawl_runs"
_RESERVED_NAMES = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _safe_name(value: str, fallback: str = "article") -> str:
    # Keep unicode letters (including non-Korean names), but never permit path syntax/control chars.
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f\x7f]+', "_", str(value or ""))
    text = re.sub(r"\s+", " ", text).strip(" .")
    if not text:
        text = fallback
    if text.upper().split(".", 1)[0] in _RESERVED_NAMES:
        text = "_" + text
    return text[:180] or fallback


class Storage:
    """Owns only the KOTRA tables and never alters unrelated tables."""

    def __init__(self, db_path: str = r"D:\SQLiteDB\smart_law_ai.db", download_dir: str = r"C:\SQLiteDB\downloads\KOTRA\미국통상정책") -> None:
        self.db_path = str(db_path)
        self.download_dir = Path(download_dir)
        self.conn: Optional[sqlite3.Connection] = None

    def __enter__(self) -> "Storage":
        self.open(); return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def open(self) -> None:
        if self.conn is not None: return
        path = Path(self.db_path)
        if str(path.parent) not in ("", "."): path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path)); self.conn.row_factory = sqlite3.Row
        try:
            self.conn.execute("PRAGMA foreign_keys=ON"); self.ensure_schema()
        except Exception:
            self.close()
            raise

    def close(self) -> None:
        if self.conn is not None: self.conn.close(); self.conn = None

    def _db(self) -> sqlite3.Connection:
        if self.conn is None: self.open()
        assert self.conn is not None
        return self.conn

    def ensure_schema(self) -> None:
        self._db().executescript(f"""
        CREATE TABLE IF NOT EXISTS {ARTICLE_TABLE} (
            article_id TEXT PRIMARY KEY, title TEXT NOT NULL, published_date TEXT, url TEXT,
            body_html TEXT, body_text TEXT, author TEXT, office TEXT, keywords TEXT,
            raw_list_json TEXT,
            collected_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS {ATTACHMENT_TABLE} (
            article_id TEXT NOT NULL, file_id TEXT NOT NULL, filename TEXT NOT NULL,
            stored_path TEXT, url TEXT, status TEXT NOT NULL, error_message TEXT,
            collected_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            PRIMARY KEY (article_id, file_id),
            FOREIGN KEY (article_id) REFERENCES {ARTICLE_TABLE}(article_id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS {RUN_TABLE} (
            run_id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL,
            finished_at TEXT, status TEXT NOT NULL, pages INTEGER NOT NULL DEFAULT 0,
            articles INTEGER NOT NULL DEFAULT 0, article_failures INTEGER NOT NULL DEFAULT 0,
            attachment_failures INTEGER NOT NULL DEFAULT 0, error_message TEXT
        );
        """); self._db().commit()
        # Databases created by earlier crawler versions lack this column.  Only the
        # dedicated KOTRA table is migrated; unrelated tables (including crawl_runs)
        # are intentionally left untouched.
        columns = {row[1] for row in self._db().execute(f"PRAGMA table_info({ARTICLE_TABLE})")}
        if "raw_list_json" not in columns:
            self._db().execute(f"ALTER TABLE {ARTICLE_TABLE} ADD COLUMN raw_list_json TEXT")
            self._db().commit()

    def start_run(self) -> int:
        cur = self._db().execute(f"INSERT INTO {RUN_TABLE}(started_at,status) VALUES (?,?)", (_now(), "running"))
        self._db().commit(); return int(cur.lastrowid)

    def finish_run(self, run_id: int, status: str, pages: int, articles: int, attachment_failures: int = 0, error_message: str = "", article_failures: int = 0) -> None:
        self._db().execute(f"UPDATE {RUN_TABLE} SET finished_at=?,status=?,pages=?,articles=?,article_failures=?,attachment_failures=?,error_message=? WHERE run_id=?", (_now(), status, pages, articles, article_failures, attachment_failures, error_message, run_id)); self._db().commit()

    def upsert_article(self, article: Dict[str, Any]) -> None:
        aid = str(article.get("article_id") or "")
        if not aid: raise ValueError("article_id is required")
        now = _now(); keywords = article.get("keywords")
        if isinstance(keywords, (list, tuple, set)): keywords = ", ".join(str(x) for x in keywords)
        raw_list = article.get("raw_list")
        raw_list_json = json.dumps(raw_list, ensure_ascii=False, separators=(",", ":")) if isinstance(raw_list, dict) else None
        self._db().execute(f"""INSERT INTO {ARTICLE_TABLE}
        (article_id,title,published_date,url,body_html,body_text,author,office,keywords,raw_list_json,collected_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET
        title=excluded.title,published_date=excluded.published_date,url=excluded.url,body_html=excluded.body_html,
        body_text=excluded.body_text,author=excluded.author,office=excluded.office,keywords=excluded.keywords,
        raw_list_json=excluded.raw_list_json,updated_at=excluded.updated_at""",
        (aid, str(article.get("title") or ""), article.get("published_date"), article.get("url"), article.get("body_html"), article.get("body_text"), article.get("author"), article.get("office"), keywords, raw_list_json, now, now)); self._db().commit()

    def upsert_attachment(self, article_id: str, attachment: Dict[str, Any], stored_path: Optional[str] = None, status: str = "downloaded", error_message: str = "") -> None:
        fid = str(attachment.get("file_id") or hashlib.sha256(str(attachment.get("url") or attachment.get("filename") or "file").encode("utf-8")).hexdigest()[:32]); now = _now()
        self._db().execute(f"""INSERT INTO {ATTACHMENT_TABLE}
        (article_id,file_id,filename,stored_path,url,status,error_message,collected_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(article_id,file_id) DO UPDATE SET filename=excluded.filename,
        stored_path=excluded.stored_path,url=excluded.url,status=excluded.status,error_message=excluded.error_message,updated_at=excluded.updated_at""",
        (str(article_id), fid, str(attachment.get("filename") or fid), stored_path, attachment.get("url"), status, error_message, now, now)); self._db().commit()

    def attachment_path(self, article_id: str, filename: str, file_id: Optional[str] = None, url: Optional[str] = None) -> Path:
        aid = str(article_id); identity = str(file_id or url or filename)
        digest = hashlib.sha256((aid + "\0" + identity).encode("utf-8")).hexdigest()[:16]
        clean_filename = re.sub(r'[<>:"/\\|?*\x00-\x1f\x7f]+', "_", str(filename or "attachment"))
        raw_suffix = Path(clean_filename).suffix
        suffix = _safe_name(raw_suffix[1:], "")[:20] if raw_suffix else ""
        suffix = ("." + suffix) if suffix else ""
        stem = _safe_name(clean_filename[:-len(raw_suffix)] if raw_suffix else clean_filename, "attachment")[:120]
        article_hash = hashlib.sha256(aid.encode("utf-8")).hexdigest()[:8]
        folder = self.download_dir / f"{_safe_name(aid)[:80]}_{article_hash}"
        folder.mkdir(parents=True, exist_ok=True)
        return folder / f"{stem}_{digest}{suffix}"

    def count_articles(self) -> int:
        return int(self._db().execute(f"SELECT COUNT(*) FROM {ARTICLE_TABLE}").fetchone()[0])
