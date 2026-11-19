# -*- coding: utf-8 -*-
"""
원천 SQLite DB → D:/SQLiteDB/smart_law_ai.db 테이블 이관.

- 대상에 없는 테이블: CREATE + 데이터/인덱스 복사
- 동일 스키마 기존 테이블: INSERT OR IGNORE / OR REPLACE 로 보강
- 스키마·이름 충돌: 아래 RENAME_MAP 적용 후 복사
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

SMART = Path(r"D:\SQLiteDB\smart_law_ai.db")
LOG = Path(r"D:\SQLiteDB\migrate_to_smart_law_ai.log")

# source_db_label -> { source_table: dest_table }
RENAME_MAP: dict[str, dict[str, str]] = {
    "hsforeigncase.db": {
        "case_images": "foreign_case_images",
        "crawl_history": "foreign_crawl_history",
    },
    "clip_admin_rule.db": {
        "admin_rule": "clip_ar_rule",
        "admin_rule_annex": "clip_ar_annex",
        "admin_rule_attachment": "clip_ar_attachment",
        "admin_rule_history": "clip_ar_history",
    },
    "clip_precedent.db": {
        "crawl_meta": "clip_precedent_crawl_meta",
    },
    "clip_question.db": {
        "crawl_meta": "clip_question_crawl_meta",
    },
}

# 이미 smart에 있고 스키마가 같아 보강만 하는 소스
MERGE_SOURCES = {
    "admin_rules.db",
}

# clip_admin_rule 의 조약 테이블은 이미 smart에 있음 → 스킵(건수 충분 시)
SKIP_IF_EXISTS_NONEMPTY = {
    "clip_admin_rule.db": {
        "clip_treaties",
        "clip_treaty_attachments",
        "clip_treaty_crawl_runs",
    },
}

SOURCES: list[tuple[str, Path]] = [
    ("clip_question.db", Path(r"D:\SQLiteDB\clip_question.db")),
    ("clip_precedent.db", Path(r"D:\SQLiteDB\clip_precedent.db")),
    ("clip_admin_rule.db", Path(r"D:\SQLiteDB\clip_admin_rule.db")),
    ("unipass_bunsuk.db", Path(r"D:\SQLiteDB\unipass_bunsuk.db")),
    ("hs_manual_complete.db", Path(r"D:\SQLiteDB\hs_manual_complete.db")),
    ("admin_rules.db", Path(r"D:\SQLiteDB\admin_rules.db")),
    ("domestic_hs_class.db", Path(r"D:\SQLiteDB\domestic_hs_class.db")),
    ("tariff.db", Path(r"D:\SQLiteDB\tariff.db")),
    ("hsforeigncase.db", Path(r"D:\SQLiteDB\hsforeigncase.db")),
]


def log(msg: str) -> None:
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def table_names(conn: sqlite3.Connection) -> set[str]:
    return {
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }


def table_sql(conn: sqlite3.Connection, table: str) -> str | None:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return row[0] if row and row[0] else None


def table_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in conn.execute(f'PRAGMA table_info("{table}")')]


def row_count(conn: sqlite3.Connection, table: str) -> int:
    return int(conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])


def rewrite_create_sql(create_sql: str, src_table: str, dest_table: str) -> str:
    # REPLACE first occurrence of table name in CREATE TABLE statement
    import re

    def repl(m: re.Match[str]) -> str:
        quote = m.group(1) or ""
        return f"CREATE TABLE IF NOT EXISTS {quote}{dest_table}{quote}"

    out = re.sub(
        rf'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?){re.escape(src_table)}\1',
        repl,
        create_sql,
        count=1,
        flags=re.IGNORECASE,
    )
    if "IF NOT EXISTS" not in out.upper():
        out = out.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS", 1)
    return out


def copy_indexes(
    src: sqlite3.Connection,
    dest: sqlite3.Connection,
    src_table: str,
    dest_table: str,
) -> int:
    rows = src.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
        (src_table,),
    ).fetchall()
    n = 0
    existing = {
        r[0]
        for r in dest.execute(
            "SELECT name FROM sqlite_master WHERE type='index'"
        )
    }
    for name, sql in rows:
        if not sql:
            continue
        new_name = name
        if src_table != dest_table:
            new_name = name.replace(src_table, dest_table)
            if new_name == name:
                new_name = f"{dest_table}_{name}"
        if new_name in existing:
            continue
        new_sql = sql
        if src_table != dest_table:
            new_sql = sql.replace(f'"{src_table}"', f'"{dest_table}"')
            new_sql = new_sql.replace(f" {src_table} ", f" {dest_table} ")
            new_sql = new_sql.replace(f"ON {src_table}", f"ON {dest_table}")
            new_sql = new_sql.replace(f"on {src_table}", f"on {dest_table}")
            # index name
            import re

            new_sql = re.sub(
                rf'INDEX\s+("?){re.escape(name)}\1',
                f'INDEX "{new_name}"',
                new_sql,
                count=1,
                flags=re.IGNORECASE,
            )
        if "IF NOT EXISTS" not in new_sql.upper():
            new_sql = new_sql.replace("CREATE INDEX", "CREATE INDEX IF NOT EXISTS", 1)
            new_sql = new_sql.replace(
                "CREATE UNIQUE INDEX", "CREATE UNIQUE INDEX IF NOT EXISTS", 1
            )
        try:
            dest.execute(new_sql)
            n += 1
        except sqlite3.Error as e:
            log(f"  index skip {new_name}: {e}")
    return n


def migrate_table(
    dest: sqlite3.Connection,
    label: str,
    src_table: str,
    dest_table: str,
    *,
    mode: str,
) -> dict:
    """mode: copy | merge"""
    t0 = time.time()
    src_n = int(
        dest.execute(f'SELECT COUNT(*) FROM src."{src_table}"').fetchone()[0]
    )
    dest_exists = dest_table in table_names(dest)

    if mode == "copy":
        if dest_exists and row_count(dest, dest_table) >= src_n and src_n > 0:
            log(
                f"  SKIP {src_table}→{dest_table}: already has {row_count(dest, dest_table)} >= {src_n}"
            )
            return {
                "src": src_table,
                "dest": dest_table,
                "action": "skip_enough",
                "src_n": src_n,
                "dest_n": row_count(dest, dest_table),
            }

        create = table_sql(
            sqlite3.connect(f"file:{SOURCES_BY_LABEL[label].as_posix()}?mode=ro", uri=True),
            src_table,
        )
        # use attached for create sql
        create_row = dest.execute(
            "SELECT sql FROM src.sqlite_master WHERE type='table' AND name=?",
            (src_table,),
        ).fetchone()
        create = create_row[0] if create_row else None
        if not create:
            raise RuntimeError(f"no CREATE SQL for {src_table}")

        if not dest_exists:
            dest.execute(rewrite_create_sql(create, src_table, dest_table))
            dest.commit()

        # if dest empty or fewer rows, replace contents when counts differ a lot
        dest_n_before = row_count(dest, dest_table) if dest_table in table_names(dest) else 0
        if dest_n_before == 0:
            cols = table_columns(dest, dest_table)
            # use intersection with source cols
            src_cols = [
                r[1]
                for r in dest.execute(f'PRAGMA src.table_info("{src_table}")')
            ]
            use_cols = [c for c in cols if c in src_cols]
            col_list = ", ".join(f'"{c}"' for c in use_cols)
            dest.execute(
                f'INSERT INTO "{dest_table}" ({col_list}) SELECT {col_list} FROM src."{src_table}"'
            )
            dest.commit()
        elif dest_n_before < src_n:
            # try insert or ignore for missing
            cols = table_columns(dest, dest_table)
            src_cols = [
                r[1]
                for r in dest.execute(f'PRAGMA src.table_info("{src_table}")')
            ]
            use_cols = [c for c in cols if c in src_cols]
            col_list = ", ".join(f'"{c}"' for c in use_cols)
            try:
                dest.execute(
                    f'INSERT OR IGNORE INTO "{dest_table}" ({col_list}) '
                    f'SELECT {col_list} FROM src."{src_table}"'
                )
                dest.commit()
            except sqlite3.Error as e:
                log(f"  INSERT OR IGNORE failed, replacing table: {e}")
                dest.execute(f'DROP TABLE "{dest_table}"')
                dest.execute(rewrite_create_sql(create, src_table, dest_table))
                dest.execute(
                    f'INSERT INTO "{dest_table}" ({col_list}) SELECT {col_list} FROM src."{src_table}"'
                )
                dest.commit()

        # indexes from attached src
        src_conn = sqlite3.connect(
            f"file:{SOURCES_BY_LABEL[label].as_posix()}?mode=ro", uri=True
        )
        try:
            idx_n = copy_indexes(src_conn, dest, src_table, dest_table)
            dest.commit()
        finally:
            src_conn.close()

        dest_n = row_count(dest, dest_table)
        elapsed = round(time.time() - t0, 1)
        log(
            f"  OK {src_table}→{dest_table}: {src_n} → {dest_n} ({elapsed}s, indexes+={idx_n})"
        )
        return {
            "src": src_table,
            "dest": dest_table,
            "action": "copy",
            "src_n": src_n,
            "dest_n": dest_n,
            "sec": elapsed,
        }

    # merge mode
    if not dest_exists:
        return migrate_table(dest, label, src_table, dest_table, mode="copy")

    dest_cols = table_columns(dest, dest_table)
    src_cols = [r[1] for r in dest.execute(f'PRAGMA src.table_info("{src_table}")')]
    use_cols = [c for c in dest_cols if c in src_cols]
    if not use_cols:
        log(f"  SKIP merge {src_table}: no common columns")
        return {"src": src_table, "dest": dest_table, "action": "skip_schema"}

    before = row_count(dest, dest_table)
    col_list = ", ".join(f'"{c}"' for c in use_cols)
    try:
        dest.execute(
            f'INSERT OR IGNORE INTO "{dest_table}" ({col_list}) '
            f'SELECT {col_list} FROM src."{src_table}"'
        )
        dest.commit()
    except sqlite3.Error as e:
        log(f"  merge IGNORE failed {src_table}: {e}; trying REPLACE")
        dest.execute(
            f'INSERT OR REPLACE INTO "{dest_table}" ({col_list}) '
            f'SELECT {col_list} FROM src."{src_table}"'
        )
        dest.commit()
    after = row_count(dest, dest_table)
    elapsed = round(time.time() - t0, 1)
    log(f"  MERGE {src_table}: {before} → {after} (src {src_n}, {elapsed}s)")
    return {
        "src": src_table,
        "dest": dest_table,
        "action": "merge",
        "src_n": src_n,
        "dest_n": after,
        "sec": elapsed,
    }


SOURCES_BY_LABEL = {k: v for k, v in SOURCES}


def migrate_one(dest: sqlite3.Connection, label: str, path: Path) -> list[dict]:
    if not path.exists():
        log(f"MISSING {label}")
        return [{"error": "missing", "label": label}]

    log(f"=== {label} ({path}) ===")
    dest.execute(f"ATTACH DATABASE '{path.as_posix()}' AS src")
    try:
        src_tables = [
            r[0]
            for r in dest.execute(
                "SELECT name FROM src.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        renames = RENAME_MAP.get(label, {})
        skip_nonempty = SKIP_IF_EXISTS_NONEMPTY.get(label, set())
        results = []
        for src_table in src_tables:
            dest_table = renames.get(src_table, src_table)
            if src_table in skip_nonempty and dest_table in table_names(dest):
                if row_count(dest, dest_table) > 0:
                    log(f"  SKIP existing nonempty {dest_table}")
                    results.append(
                        {
                            "src": src_table,
                            "dest": dest_table,
                            "action": "skip_exists",
                        }
                    )
                    continue
            mode = "merge" if label in MERGE_SOURCES and dest_table == src_table else "copy"
            # if renamed, always copy
            if dest_table != src_table:
                mode = "copy"
            try:
                results.append(
                    migrate_table(dest, label, src_table, dest_table, mode=mode)
                )
            except Exception as e:
                log(f"  FAIL {src_table}→{dest_table}: {e}")
                results.append(
                    {
                        "src": src_table,
                        "dest": dest_table,
                        "action": "fail",
                        "error": str(e),
                    }
                )
        return results
    finally:
        try:
            dest.execute("DETACH DATABASE src")
        except sqlite3.Error:
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--only",
        nargs="*",
        help="특정 소스 파일명만 (예: clip_question.db tariff.db)",
    )
    args = parser.parse_args()
    only = set(args.only) if args.only else None

    log(f"START migrate → {SMART}")
    dest = sqlite3.connect(str(SMART))
    dest.execute("PRAGMA journal_mode=WAL")
    dest.execute("PRAGMA synchronous=NORMAL")
    dest.execute("PRAGMA temp_store=MEMORY")
    dest.execute("PRAGMA cache_size=-800000")  # ~800MB
    dest.execute("PRAGMA busy_timeout=600000")

    summary = {}
    try:
        for label, path in SOURCES:
            if only and label not in only:
                continue
            summary[label] = migrate_one(dest, label, path)
    finally:
        dest.close()

    report = Path(r"d:\CursorProject\smart-law-ai\_migrate_report.json")
    report.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"DONE report={report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
