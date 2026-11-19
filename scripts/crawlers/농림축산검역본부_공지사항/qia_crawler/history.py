"""수집 이력 관리(SQLite: D:\\SQLiteDB\\smart_law_ai.db).

같은 DB 파일을 다른 수집기(예: 조세심판원 소식)와 함께 사용할 수 있도록
테이블 이름에 `qia_notice_` 접두사를 붙이고, 기본키는 (게시판, 게시글ID) 복합키로 둔다.

 - 게시글 ID 기반 중복 차단(1차)
 - 제목+등록일 해시 기반 '내용 중복' 차단(2차, ID가 달라도 같은 글이면 스킵)
 - 실행(run) 단위 로그 기록으로 누적 현황 파악
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any

from .config import BOARD_TYPE
from .parser import PostDetail
from .utils import content_key, now_kst, normalize_title

TABLE_POSTS = "qia_notice_posts"
TABLE_RUNS = "qia_notice_runs"

# 프로그램이 만드는 테이블의 컬럼 정의(기존 DB에 같은 이름의 다른 테이블이 있으면 중단)
POSTS_COLUMNS = (
    "board_type", "post_id", "board_no", "title", "title_norm", "content_key",
    "dept", "writer", "posted_date", "views", "url", "has_attachment",
    "attachment_count", "attachments", "body_path", "raw_path", "body_chars", "crawled_at",
)
RUNS_COLUMNS = (
    "run_id", "board_type", "started_at", "finished_at", "from_page", "to_page",
    "pages", "listed", "new_posts", "skipped_known", "skipped_dup",
    "downloaded", "failed", "report_path",
)

SCHEMA = f"""
CREATE TABLE IF NOT EXISTS {TABLE_POSTS} (
    board_type       TEXT NOT NULL,
    post_id          TEXT NOT NULL,
    board_no         TEXT,
    title            TEXT NOT NULL,
    title_norm       TEXT,
    content_key      TEXT,
    dept             TEXT,
    writer           TEXT,
    posted_date      TEXT,
    views            TEXT,
    url              TEXT,
    has_attachment   INTEGER DEFAULT 0,
    attachment_count INTEGER DEFAULT 0,
    attachments      TEXT,
    body_path        TEXT,
    raw_path         TEXT,
    body_chars       INTEGER DEFAULT 0,
    crawled_at       TEXT NOT NULL,
    PRIMARY KEY (board_type, post_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qia_notice_content
    ON {TABLE_POSTS}(board_type, content_key);
CREATE INDEX IF NOT EXISTS idx_qia_notice_date
    ON {TABLE_POSTS}(board_type, posted_date);

CREATE TABLE IF NOT EXISTS {TABLE_RUNS} (
    run_id        INTEGER PRIMARY KEY,
    board_type    TEXT,
    started_at    TEXT,
    finished_at   TEXT,
    from_page     INTEGER,
    to_page       INTEGER,
    pages         INTEGER,
    listed        INTEGER,
    new_posts     INTEGER,
    skipped_known INTEGER,
    skipped_dup   INTEGER,
    downloaded    INTEGER,
    failed        INTEGER,
    report_path   TEXT
);
"""


class History:
    """게시판 단위 수집 이력 저장소."""

    def __init__(self, db_path: Path, board_type: str = BOARD_TYPE) -> None:
        self.db_path = Path(db_path)
        self.board_type = board_type
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path, timeout=15)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA busy_timeout = 10000")
        self.conn.executescript(SCHEMA)
        self.conn.commit()
        self._verify_schema()

    # ------------------------------------------------------------------
    def _verify_schema(self) -> None:
        """기존 DB를 공유할 때 같은 이름의 다른 테이블을 건드리지 않도록 구조를 확인한다.

        CREATE TABLE IF NOT EXISTS 는 이미 있는 테이블을 변경하지 않으므로,
        컬럼 구성이 다르면 이후 INSERT가 실패한다. 그 전에 명확히 알려준다.
        """
        for table, expected in ((TABLE_POSTS, POSTS_COLUMNS), (TABLE_RUNS, RUNS_COLUMNS)):
            actual = tuple(
                row["name"] for row in self.conn.execute(f"PRAGMA table_info({table})")
            )
            if not actual:
                continue
            if set(actual) != set(expected):
                raise RuntimeError(
                    f"기존 DB에 '{table}' 테이블이 다른 구조로 존재합니다.\n"
                    f"  - 기존 컬럼: {', '.join(actual)}\n"
                    f"  - 필요 컬럼: {', '.join(expected)}\n"
                    "기존 테이블은 수정하지 않았습니다. --db 로 다른 DB 파일을 지정하거나, "
                    "해당 테이블을 백업한 뒤 이름을 변경하고 다시 실행하세요."
                )

    # ------------------------------------------------------------------
    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "History":
        return self

    def __exit__(self, *exc_info) -> None:
        self.close()

    # ------------------------------------------------------------------
    def is_known(self, post_id: str) -> bool:
        cur = self.conn.execute(
            f"SELECT 1 FROM {TABLE_POSTS} WHERE board_type = ? AND post_id = ?",
            (self.board_type, post_id),
        )
        return cur.fetchone() is not None

    def is_duplicate_content(self, title: str, posted_date: str) -> bool:
        key = content_key(title, posted_date)
        cur = self.conn.execute(
            f"SELECT 1 FROM {TABLE_POSTS} WHERE board_type = ? AND content_key = ?",
            (self.board_type, key),
        )
        return cur.fetchone() is not None

    def save(
        self,
        detail: PostDetail,
        *,
        board_no: str,
        body_path: str | None,
        raw_path: str | None,
        board_type: str | None = None,
        crawled_at: str | None = None,
    ) -> None:
        board = board_type or self.board_type
        attachments = [
            {
                "file_id": a.file_id,
                "name": a.name,
                "url": a.url,
                "local_path": a.local_path,
                "size": a.size,
                "status": a.status,
            }
            for a in detail.attachments
        ]
        self.conn.execute(
            f"""
            INSERT INTO {TABLE_POSTS} (
                board_type, post_id, board_no, title, title_norm, content_key,
                dept, writer, posted_date, views, url, has_attachment,
                attachment_count, attachments, body_path, raw_path, body_chars, crawled_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(board_type, post_id) DO UPDATE SET
                board_no = excluded.board_no,
                title = excluded.title,
                title_norm = excluded.title_norm,
                content_key = excluded.content_key,
                dept = excluded.dept,
                writer = excluded.writer,
                posted_date = excluded.posted_date,
                views = excluded.views,
                url = excluded.url,
                has_attachment = excluded.has_attachment,
                attachment_count = excluded.attachment_count,
                attachments = excluded.attachments,
                body_path = excluded.body_path,
                raw_path = excluded.raw_path,
                body_chars = excluded.body_chars,
                crawled_at = excluded.crawled_at
            """,
            (
                board,
                detail.post_id,
                board_no,
                detail.title,
                normalize_title(detail.title),
                content_key(detail.title, detail.posted_date),
                detail.dept,
                detail.writer,
                detail.posted_date,
                detail.views,
                detail.url,
                1 if detail.attachments else 0,
                len(detail.attachments),
                json.dumps(attachments, ensure_ascii=False),
                body_path,
                raw_path,
                len(detail.body_text or ""),
                crawled_at or now_kst().isoformat(timespec="seconds"),
            ),
        )
        self.conn.commit()

    def start_run(self, from_page: int, to_page: int) -> int:
        cur = self.conn.execute(
            f"INSERT INTO {TABLE_RUNS} (board_type, started_at, from_page, to_page) VALUES (?,?,?,?)",
            (self.board_type, now_kst().isoformat(timespec="seconds"), from_page, to_page),
        )
        self.conn.commit()
        return int(cur.lastrowid)

    def finish_run(self, run_id: int, **stats: Any) -> None:
        fields = {
            "finished_at": now_kst().isoformat(timespec="seconds"),
            "pages": stats.get("pages", 0),
            "listed": stats.get("listed", 0),
            "new_posts": stats.get("new_posts", 0),
            "skipped_known": stats.get("skipped_known", 0),
            "skipped_dup": stats.get("skipped_dup", 0),
            "downloaded": stats.get("downloaded", 0),
            "failed": stats.get("failed", 0),
            "report_path": stats.get("report_path"),
        }
        assignments = ", ".join(f"{key} = ?" for key in fields)
        self.conn.execute(
            f"UPDATE {TABLE_RUNS} SET {assignments} WHERE run_id = ?",
            (*fields.values(), run_id),
        )
        self.conn.commit()

    # ------------------------------------------------------------------
    def count(self) -> int:
        return int(
            self.conn.execute(
                f"SELECT COUNT(*) FROM {TABLE_POSTS} WHERE board_type = ?", (self.board_type,)
            ).fetchone()[0]
        )

    def recent(self, limit: int = 20) -> list[sqlite3.Row]:
        return list(
            self.conn.execute(
                f"""
                SELECT post_id, board_no, title, posted_date, writer,
                       attachment_count, crawled_at
                FROM {TABLE_POSTS}
                WHERE board_type = ?
                ORDER BY crawled_at DESC, post_id DESC LIMIT ?
                """,
                (self.board_type, limit),
            )
        )

    def all_posts(self) -> list[sqlite3.Row]:
        return list(
            self.conn.execute(
                f"""
                SELECT board_no, title, dept, writer, posted_date, views,
                       attachment_count, attachments, url, body_path, crawled_at
                FROM {TABLE_POSTS}
                WHERE board_type = ?
                ORDER BY posted_date DESC, CAST(board_no AS INTEGER) DESC
                """,
                (self.board_type,),
            )
        )

    def reset(self) -> None:
        self.conn.execute(f"DELETE FROM {TABLE_POSTS} WHERE board_type = ?", (self.board_type,))
        self.conn.commit()
