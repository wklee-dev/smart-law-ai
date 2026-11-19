# -*- coding: utf-8 -*-
"""
clip_precedent.db / clip_question.db → smart_law_ai.db 이관
- 대상 테이블만 ATTACH 후 INSERT OR IGNORE / REPLACE
- 이미 smart에 동일 건수가 있어도 누락분 보충
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

SMART = Path(r"D:/SQLiteDB/smart_law_ai.db")
PRECEDENT = Path(r"D:/SQLiteDB/clip_precedent.db")
QUESTION = Path(r"D:/SQLiteDB/clip_question.db")

PRECEDENT_TABLES = [
    "clip_precedent",
    "clip_precedent_attachment",
    "clip_precedent_detail",
    "clip_precedent_history",
    "clip_precedent_hs",
    "clip_precedent_image",
    "clip_precedent_law",
    "clip_precedent_crawl_meta",
]
QUESTION_TABLES = [
    "clip_question",
    "clip_question_image",
    "clip_question_crawl_meta",
]


def table_exists(conn: sqlite3.Connection, schema: str, table: str) -> bool:
    row = conn.execute(
        f"SELECT 1 FROM {schema}.sqlite_master WHERE type='table' AND name=? LIMIT 1",
        (table,),
    ).fetchone()
    return bool(row)


def ensure_table_from_source(
    conn: sqlite3.Connection, src_schema: str, table: str
) -> None:
    if table_exists(conn, "main", table):
        return
    if not table_exists(conn, src_schema, table):
        print(f"  skip create (source missing): {table}")
        return
    row = conn.execute(
        f"SELECT sql FROM {src_schema}.sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    if not row or not row[0]:
        print(f"  skip create (no ddl): {table}")
        return
    ddl = row[0]
    # CREATE TABLE name → CREATE TABLE IF NOT EXISTS name
    ddl = ddl.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ", 1)
    conn.execute(ddl)
    print(f"  created table: {table}")


def copy_table(conn: sqlite3.Connection, src_schema: str, table: str) -> dict:
    if not table_exists(conn, src_schema, table):
        return {"table": table, "src": 0, "before": 0, "after": 0, "inserted": 0}
    ensure_table_from_source(conn, src_schema, table)
    if not table_exists(conn, "main", table):
        return {"table": table, "src": 0, "before": 0, "after": 0, "inserted": 0}

    src_n = conn.execute(f'SELECT COUNT(*) FROM {src_schema}."{table}"').fetchone()[0]
    before = conn.execute(f'SELECT COUNT(*) FROM main."{table}"').fetchone()[0]

    src_cols = [
        r[1]
        for r in conn.execute(f"PRAGMA {src_schema}.table_info('{table}')").fetchall()
    ]
    dst_cols = [
        r[1]
        for r in conn.execute(f"PRAGMA main.table_info('{table}')").fetchall()
    ]
    cols = [c for c in src_cols if c in dst_cols]
    if not cols:
        print(f"  WARN no common columns: {table}")
        return {
            "table": table,
            "src": src_n,
            "before": before,
            "after": before,
            "inserted": 0,
        }

    col_sql = ", ".join(f'"{c}"' for c in cols)
    # PK 충돌 시 기존 유지(IGNORE). 필요 시 REPLACE로 바꿀 수 있음.
    sql = (
        f'INSERT OR IGNORE INTO main."{table}" ({col_sql}) '
        f'SELECT {col_sql} FROM {src_schema}."{table}"'
    )
    cur = conn.execute(sql)
    after = conn.execute(f'SELECT COUNT(*) FROM main."{table}"').fetchone()[0]
    return {
        "table": table,
        "src": src_n,
        "before": before,
        "after": after,
        "inserted": after - before,
        "changes": cur.rowcount if cur.rowcount is not None else None,
    }


def migrate(src_path: Path, schema: str, tables: list[str]) -> None:
    print(f"\n=== migrate {src_path.name} → smart_law_ai.db ===")
    if not src_path.exists():
        print("  source missing, skip")
        return
    conn = sqlite3.connect(str(SMART))
    try:
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute(f"ATTACH DATABASE ? AS {schema}", (str(src_path),))
        for table in tables:
            r = copy_table(conn, schema, table)
            print(
                f"  {r['table']}: src={r['src']} before={r['before']} "
                f"after={r['after']} +{r['inserted']}"
            )
        conn.commit()
        conn.execute(f"DETACH DATABASE {schema}")
    finally:
        conn.close()


def main() -> None:
    if not SMART.exists():
        raise SystemExit(f"smart DB 없음: {SMART}")
    migrate(PRECEDENT, "src_prec", PRECEDENT_TABLES)
    migrate(QUESTION, "src_q", QUESTION_TABLES)
    print("\nDone.")


if __name__ == "__main__":
    main()
