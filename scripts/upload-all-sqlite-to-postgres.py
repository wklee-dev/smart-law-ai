# -*- coding: utf-8 -*-
"""smart_law_ai.db 의 모든 사용자 테이블 → Postgres 이관.

Hanjoo 81개만이 아니라 크롤러 테이블(kotra_us_trade_* 등)까지 포함합니다.
없는 테이블은 SQLite 스키마로 CREATE TABLE IF NOT EXISTS 후 COPY 적재합니다.

사전:
  pip install psycopg2-binary

예 (개발 PC → RPA-03):
  $env:SMART_LAW_DATABASE_URL = 'postgresql://postgres@203.242.224.6:5432/smart_law_ai'
  $env:PGPASSWORD = Read-Host 'DB Password' -MaskInput
  # Hanjoo 기이관분 제외하고 나머지 전부 (건수 불일치 무시)
  python scripts/upload-all-sqlite-to-postgres.py --remaining

  python scripts/upload-all-sqlite-to-postgres.py --dry-run
  python scripts/upload-all-sqlite-to-postgres.py --only kotra_us_trade_articles,kotra_us_trade_attachments
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import re
import sqlite3
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote

import psycopg2
from psycopg2.extensions import connection as PgConnection

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SQLITE = Path(r"D:/SQLiteDB/smart_law_ai.db")
HANJOO_META = ROOT / "scripts" / "supabase" / "hanjoo_tables.json"

# 기본 제외 BLOB (용량·COPY 부담). --include-blob 으로 포함 가능.
DEFAULT_BLOB_OMIT = {
    ("foreign_case_images", "image_data"),
    ("case_images", "image_data"),
    ("clip_precedent_image", "image_data"),
    ("clip_question_image", "image_data"),
    ("article_image", "image_data"),
}

NULL_MARK = r"\N"


@dataclass
class ColInfo:
    name: str
    sqlite_type: str
    notnull: bool
    pk: int  # 0 = not pk, else 1..n order


def connect_postgres(dsn: str) -> PgConnection:
    """비밀번호는 PGPASSWORD / SUPABASE_DB_PASSWORD 로만 받습니다."""
    # Windows + 한글 로케일에서 인증 실패 메시지가 CP949로 오면
    # psycopg2가 utf-8 디코드하다 UnicodeDecodeError 가 납니다.
    os.environ.setdefault("PGCLIENTENCODING", "UTF8")
    os.environ.setdefault("LC_MESSAGES", "C")

    dsn = dsn.strip().strip('"').strip("'")
    password = (
        os.environ.get("SUPABASE_DB_PASSWORD", "").strip()
        or os.environ.get("PGPASSWORD", "").strip()
    )
    if password.startswith("[") and password.endswith("]"):
        password = password[1:-1]
    if not password:
        raise SystemExit(
            "비밀번호 환경변수가 비어 있습니다.\n"
            "  $env:PGPASSWORD = Read-Host 'DB Password' -MaskInput"
        )

    user_m = re.match(r"^[a-zA-Z0-9+.-]+://([^:/@]+)", dsn)
    if not user_m:
        raise SystemExit(
            "DSN에서 사용자명을 찾지 못했습니다.\n"
            "예: postgresql://postgres@127.0.0.1:5432/smart_law_ai"
        )
    user = unquote(user_m.group(1))
    if "@" not in dsn:
        raise SystemExit("DSN에 @ 가 없습니다.")
    tail = dsn.rsplit("@", 1)[1]
    hostport, _, rest = tail.partition("/")
    if ":" in hostport:
        host, port_s = hostport.rsplit(":", 1)
        port = int(port_s)
    else:
        host, port = hostport, 5432
    dbname = rest.split("?", 1)[0].strip("/") or "postgres"

    is_supabase = host.lower().endswith((".supabase.com", ".supabase.co"))
    is_local = host.lower() in {"localhost", "127.0.0.1", "::1"} or bool(
        re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", host)
    )
    if not is_supabase and not is_local:
        raise SystemExit(
            f"허용되지 않은 호스트입니다: {host}\n"
            "Supabase 또는 로컬/사내 IP만 사용하세요."
        )

    sslmode = "require" if is_supabase else "disable"
    if "sslmode=" in dsn:
        sm = re.search(r"sslmode=([a-zA-Z0-9-]+)", dsn)
        if sm:
            sslmode = sm.group(1)

    # RPA-03 본인 PC에서는 127.0.0.1 권장 (외부 IP는 방화벽/pg_hba 이슈)
    if host not in {"127.0.0.1", "localhost", "::1"} and not is_supabase:
        print(
            f"참고: host={host} 입니다. DB 서버 PC 자체에서 실행 중이면 "
            "127.0.0.1 사용을 권장합니다.",
            flush=True,
        )

    print(f"연결: user={user} host={host} port={port} db={dbname} sslmode={sslmode}")
    try:
        return psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            dbname=dbname,
            sslmode=sslmode,
            client_encoding="UTF8",
            options="-c client_encoding=UTF8 -c lc_messages=C",
        )
    except UnicodeDecodeError as e:
        raise SystemExit(
            "Postgres 연결 중 인코딩 오류입니다 (보통 비밀번호/pg_hba 실패 메시지가 "
            "한글 CP949라서 발생).\n"
            "  1) RPA-03에서는 URL을 127.0.0.1 로:\n"
            "     $env:SMART_LAW_DATABASE_URL = 'postgresql://postgres@127.0.0.1:5432/smart_law_ai'\n"
            "  2) $env:PGCLIENTENCODING = 'UTF8'\n"
            "  3) 비밀번호 다시 확인\n"
            f"원본: {e}"
        ) from e


def list_sqlite_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT name, sql FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        """
    ).fetchall()
    out: list[str] = []
    for name, sql in rows:
        s = (sql or "").upper()
        if "VIRTUAL TABLE" in s:
            print(f"  skip virtual: {name}")
            continue
        out.append(str(name))
    return out


def pragma_columns(conn: sqlite3.Connection, table: str) -> list[ColInfo]:
    rows = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
    if not rows:
        raise SystemExit(f"SQLite에 테이블 없음: {table}")
    # cid, name, type, notnull, dflt_value, pk
    return [
        ColInfo(
            name=str(r[1]),
            sqlite_type=str(r[2] or "TEXT"),
            notnull=bool(r[3]),
            pk=int(r[5] or 0),
        )
        for r in rows
    ]


def map_pg_type(sqlite_type: str) -> str:
    t = (sqlite_type or "TEXT").strip().upper()
    base = t.split("(")[0].strip()
    if base in {
        "INT",
        "INTEGER",
        "TINYINT",
        "SMALLINT",
        "MEDIUMINT",
        "BIGINT",
        "INT2",
        "INT8",
    }:
        return "bigint"
    if base in {"REAL", "DOUBLE", "FLOAT"} or t.startswith("DOUBLE"):
        return "double precision"
    if base in {"BOOLEAN", "BOOL"}:
        return "boolean"
    if base == "BLOB" or "BLOB" in t:
        return "bytea"
    if base in {"NUMERIC", "DECIMAL"} or t.startswith("NUMERIC") or t.startswith("DECIMAL"):
        return "numeric"
    return "text"


def is_blob_col(table: str, col: ColInfo, include_blob: bool) -> bool:
    if include_blob:
        return False
    if (table, col.name) in DEFAULT_BLOB_OMIT:
        return True
    return map_pg_type(col.sqlite_type) == "bytea"


def pk_has_nulls(conn: sqlite3.Connection, table: str, cols: list[ColInfo]) -> bool:
    pk_cols = [c.name for c in cols if c.pk > 0]
    if not pk_cols:
        return False
    where = " OR ".join(f'"{n}" IS NULL' for n in pk_cols)
    n = conn.execute(f'SELECT COUNT(*) FROM "{table}" WHERE {where}').fetchone()[0]
    return int(n) > 0


def select_columns(
    conn: sqlite3.Connection,
    table: str,
    *,
    include_blob: bool,
) -> tuple[list[ColInfo], bool]:
    """반환: (적재 컬럼, sqlite_rowid PK 사용 여부)."""
    cols = pragma_columns(conn, table)
    use_rowid_pk = not any(c.pk > 0 for c in cols)
    # Postgres PK는 NULL 불가 — SQLite에 NULL PK가 있으면 rowid PK로 전환
    if not use_rowid_pk and pk_has_nulls(conn, table, cols):
        print(f"  [{table}] PK에 NULL 있음 → sqlite_rowid PK 사용", flush=True)
        use_rowid_pk = True
        cols = [
            ColInfo(c.name, c.sqlite_type, notnull=False, pk=0) if c.pk > 0 else c
            for c in cols
        ]
    kept = [c for c in cols if not is_blob_col(table, c, include_blob)]
    return kept, use_rowid_pk


def build_create_sql(
    table: str,
    cols: list[ColInfo],
    *,
    use_rowid_pk: bool,
) -> str:
    lines: list[str] = []
    if use_rowid_pk:
        lines.append('  "sqlite_rowid" bigint NOT NULL')
    for c in cols:
        pg_t = map_pg_type(c.sqlite_type)
        # PK/rowid 테이블이 아니면 NOT NULL은 유지. rowid PK면 원본 NOT NULL 유지.
        nn = " NOT NULL" if c.notnull and c.pk == 0 else ""
        if c.pk > 0:
            nn = " NOT NULL"
        lines.append(f'  "{c.name}" {pg_t}{nn}')

    pk_cols = [c.name for c in sorted((c for c in cols if c.pk > 0), key=lambda x: x.pk)]
    if use_rowid_pk:
        pk = 'PRIMARY KEY ("sqlite_rowid")'
    elif pk_cols:
        pk = "PRIMARY KEY (" + ", ".join(f'"{n}"' for n in pk_cols) + ")"
    else:
        pk = ""

    body = ",\n".join(lines + ([pk] if pk else []))
    return f'CREATE TABLE IF NOT EXISTS public."{table}" (\n{body}\n);'


def pg_table_exists(pg: PgConnection, table: str) -> bool:
    with pg.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = %s
            """,
            (table,),
        )
        return cur.fetchone() is not None


def pg_columns(pg: PgConnection, table: str) -> set[str]:
    with pg.cursor() as cur:
        cur.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            """,
            (table,),
        )
        return {str(r[0]) for r in cur.fetchall()}


def ensure_table(
    pg: PgConnection,
    table: str,
    cols: list[ColInfo],
    *,
    use_rowid_pk: bool,
    recreate: bool = False,
) -> None:
    if recreate and pg_table_exists(pg, table):
        with pg.cursor() as cur:
            cur.execute(f'DROP TABLE IF EXISTS public."{table}" CASCADE')
        pg.commit()
        print(f"  [{table}] DROP 후 재생성", flush=True)

    # NULL PK → rowid PK 로 바뀌었는데 기존 테이블에 sqlite_rowid 없으면 재생성
    if (
        use_rowid_pk
        and pg_table_exists(pg, table)
        and "sqlite_rowid" not in pg_columns(pg, table)
    ):
        with pg.cursor() as cur:
            cur.execute(f'DROP TABLE IF EXISTS public."{table}" CASCADE')
        pg.commit()
        print(f"  [{table}] rowid PK용으로 DROP 후 재생성", flush=True)

    ddl = build_create_sql(table, cols, use_rowid_pk=use_rowid_pk)
    with pg.cursor() as cur:
        cur.execute(ddl)
    pg.commit()

    existing = pg_columns(pg, table)
    with pg.cursor() as cur:
        if use_rowid_pk and "sqlite_rowid" not in existing:
            cur.execute(
                f'ALTER TABLE public."{table}" '
                f'ADD COLUMN IF NOT EXISTS "sqlite_rowid" bigint'
            )
        for c in cols:
            if c.name in existing:
                continue
            pg_t = map_pg_type(c.sqlite_type)
            cur.execute(
                f'ALTER TABLE public."{table}" '
                f'ADD COLUMN IF NOT EXISTS "{c.name}" {pg_t}'
            )
    pg.commit()


def sqlite_count(conn: sqlite3.Connection, table: str) -> int:
    return int(conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])


def pg_count(pg: PgConnection, table: str) -> int:
    with pg.cursor() as cur:
        cur.execute(f'SELECT COUNT(*) FROM "{table}"')
        return int(cur.fetchone()[0])


def set_session_timeouts(pg: PgConnection) -> None:
    with pg.cursor() as cur:
        cur.execute("SET statement_timeout = 0")
        cur.execute("SET idle_in_transaction_session_timeout = 0")
    pg.commit()


def cell(v: object) -> str:
    if v is None:
        return NULL_MARK
    if isinstance(v, (bytes, memoryview)):
        # bytea hex for COPY CSV — only when --include-blob
        b = bytes(v)
        return r"\x" + b.hex()
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def copy_table(
    sqlite_conn: sqlite3.Connection,
    pg: PgConnection,
    table: str,
    cols: list[ColInfo],
    *,
    use_rowid_pk: bool,
    batch_rows: int,
    batch_bytes: int,
) -> int:
    names = [c.name for c in cols]
    if use_rowid_pk:
        copy_names = ["sqlite_rowid", *names]
        select_list = "rowid AS sqlite_rowid, " + ", ".join(f'"{n}"' for n in names)
    else:
        copy_names = names
        select_list = ", ".join(f'"{n}"' for n in names)

    total = sqlite_count(sqlite_conn, table)
    if total == 0:
        print(f"  [{table}] 0건 — skip")
        return 0

    # PG에 실제 있는 컬럼만
    existing = pg_columns(pg, table)
    use_names = [n for n in copy_names if n in existing]
    if not use_names:
        raise RuntimeError(f"{table}: Postgres에 복사할 컬럼이 없습니다")
    if len(use_names) != len(copy_names):
        missing = [n for n in copy_names if n not in existing]
        print(f"  [{table}] PG에 없는 컬럼 제외: {missing}")

    # SELECT는 전체 copy_names 순서, COPY는 use_names만 — 인덱스 매핑
    idx = [copy_names.index(n) for n in use_names]
    col_list = ", ".join(f'"{n}"' for n in use_names)
    copy_sql = (
        f'COPY "{table}" ({col_list}) FROM STDIN '
        f"WITH (FORMAT csv, NULL '{NULL_MARK}')"
    )

    cur_s = sqlite_conn.execute(f'SELECT {select_list} FROM "{table}"')
    uploaded = 0
    t0 = time.time()
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    pending = 0

    def flush() -> None:
        nonlocal buf, writer, pending, uploaded
        if pending == 0:
            return
        buf.seek(0)
        with pg.cursor() as cur:
            cur.copy_expert(copy_sql, buf)
        pg.commit()
        uploaded += pending
        pending = 0
        buf = io.StringIO()
        writer = csv.writer(buf, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
        elapsed = max(time.time() - t0, 0.001)
        print(
            f"  [{table}] {uploaded:,}/{total:,} "
            f"({100.0 * uploaded / total:5.1f}%) "
            f"{uploaded / elapsed:,.0f} rows/s",
            flush=True,
        )

    while True:
        rows = cur_s.fetchmany(1000)
        if not rows:
            break
        for row in rows:
            vals = [cell(row[i]) for i in idx]
            writer.writerow(vals)
            pending += 1
            if pending >= batch_rows or buf.tell() >= batch_bytes:
                flush()
    flush()
    return uploaded


def resolve_dsn(cli_dsn: str) -> str:
    return (
        cli_dsn.strip()
        or os.environ.get("SMART_LAW_DATABASE_URL", "").strip()
        or os.environ.get("SUPABASE_DB_URL", "").strip()
        or os.environ.get("DATABASE_URL", "").strip()
    )


def main() -> None:
    ap = argparse.ArgumentParser(
        description="smart_law_ai.db 전체 테이블 → Postgres 이관"
    )
    ap.add_argument("--sqlite", type=Path, default=DEFAULT_SQLITE)
    ap.add_argument("--dsn", default="")
    ap.add_argument("--batch-rows", type=int, default=10_000)
    ap.add_argument("--batch-mb", type=float, default=8.0)
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--only", default=None, help="쉼표 구분 테이블만")
    ap.add_argument("--exclude", default=None, help="쉼표 구분 제외")
    ap.add_argument(
        "--exclude-hanjoo",
        action="store_true",
        help="이미 올린 Hanjoo 81테이블(hanjoo_tables.json) 제외",
    )
    ap.add_argument(
        "--remaining",
        action="store_true",
        help="기이관 Hanjoo 제외 + 건수검증 생략하고 나머지 전부 이관",
    )
    ap.add_argument("--truncate", action="store_true", help="적재 전 대상 테이블 TRUNCATE")
    ap.add_argument("--skip-existing", action="store_true", help="건수 같으면 skip")
    ap.add_argument(
        "--no-count-check",
        action="store_true",
        help="적재 후 SQLite/PG 건수 불일치여도 실패로 치지 않음",
    )
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--include-blob",
        action="store_true",
        help="BLOB 컬럼도 bytea로 적재 (기본은 제외)",
    )
    ap.add_argument(
        "--write-ddl",
        type=Path,
        default=None,
        help="생성 DDL을 파일로 저장 (적재와 별개로 항상 작성 가능)",
    )
    ap.add_argument(
        "--no-create",
        action="store_true",
        help="테이블 자동 생성/컬럼 추가 안 함 (이미 PG에 있어야 함)",
    )
    ap.add_argument(
        "--recreate",
        action="store_true",
        help="대상 테이블을 DROP 후 재생성(스키마 불일치 시)",
    )
    args = ap.parse_args()
    if args.remaining:
        args.exclude_hanjoo = True
        args.no_count_check = True

    dsn = resolve_dsn(args.dsn)
    if not args.sqlite.exists():
        raise SystemExit(f"SQLite 없음: {args.sqlite}")
    if not dsn:
        raise SystemExit(
            "DSN 필요: --dsn 또는 SMART_LAW_DATABASE_URL / SUPABASE_DB_URL / DATABASE_URL"
        )

    sqlite_conn = sqlite3.connect(f"file:{args.sqlite.as_posix()}?mode=ro", uri=True)
    all_tables = list_sqlite_tables(sqlite_conn)
    tables = list(all_tables)

    if args.only:
        want = [x.strip() for x in args.only.split(",") if x.strip()]
        unknown = [t for t in want if t not in set(all_tables)]
        if unknown:
            raise SystemExit(f"--only 알 수 없는 테이블: {unknown}")
        tables = want

    skip: set[str] = set()
    if args.exclude:
        skip |= {x.strip() for x in args.exclude.split(",") if x.strip()}
    if args.exclude_hanjoo:
        if not HANJOO_META.exists():
            raise SystemExit(f"Hanjoo 메타 없음: {HANJOO_META}")
        import json

        hanjoo = set(json.loads(HANJOO_META.read_text(encoding="utf-8"))["tables"])
        # 스키마에만 있는 storage_file_map 도 이미 생성됐을 수 있음
        hanjoo.add("storage_file_map")
        skip |= hanjoo
        print(f"Hanjoo 제외: {len(hanjoo)}개")
    if skip:
        tables = [t for t in tables if t not in skip]

    print("SQLite:", args.sqlite)
    print(f"대상 테이블: {len(tables)} / 전체 {len(all_tables)}")

    # DDL 미리 수집
    ddl_parts: list[str] = [
        "-- auto-generated from smart_law_ai.db",
        "create schema if not exists public;",
        "set search_path to public;",
        "",
    ]
    table_meta: dict[str, tuple[list[ColInfo], bool]] = {}
    for t in tables:
        cols, use_rowid = select_columns(
            sqlite_conn, t, include_blob=args.include_blob
        )
        table_meta[t] = (cols, use_rowid)
        ddl_parts.append(build_create_sql(t, cols, use_rowid_pk=use_rowid))
        ddl_parts.append("")
        if args.dry_run:
            print(f"  SQLite {t}: {sqlite_count(sqlite_conn, t):,}")

    if args.write_ddl:
        args.write_ddl.parent.mkdir(parents=True, exist_ok=True)
        args.write_ddl.write_text("\n".join(ddl_parts), encoding="utf-8")
        print("DDL 저장:", args.write_ddl)

    print("Postgres 연결 중…")
    pg = connect_postgres(dsn)
    pg.autocommit = False
    set_session_timeouts(pg)

    if not args.no_create:
        for t in tables:
            cols, use_rowid = table_meta[t]
            ensure_table(
                pg,
                t,
                cols,
                use_rowid_pk=use_rowid,
                recreate=args.recreate,
            )
        print("스키마 ensure 완료")
    else:
        missing = [t for t in tables if not pg_table_exists(pg, t)]
        if missing:
            raise SystemExit(
                "Postgres에 없는 테이블:\n  "
                + ", ".join(missing)
                + "\n--no-create 를 빼거나 DDL을 먼저 실행하세요."
            )

    if args.dry_run:
        present = 0
        absent = 0
        for t in tables:
            if pg_table_exists(pg, t):
                present += 1
                print(f"  PG {t}: {pg_count(pg, t):,}")
            else:
                absent += 1
                print(f"  PG {t}: (없음)")
        print(f"dry-run 종료 — PG 존재 {present}, 없음 {absent} (적재 없음)")
        sqlite_conn.close()
        pg.close()
        return

    if args.truncate:
        # FK 대비 CASCADE, 역순
        names = ", ".join(f'"{t}"' for t in reversed(tables))
        with pg.cursor() as cur:
            cur.execute(f"TRUNCATE TABLE {names} RESTART IDENTITY CASCADE")
        pg.commit()
        print("TRUNCATE 완료")

    batch_bytes = int(args.batch_mb * 1024 * 1024)
    ok = 0
    failed: list[str] = []

    for t in tables:
        cols, use_rowid = table_meta[t]
        for attempt in range(1, args.retries + 2):
            try:
                if pg.closed:
                    print("  Postgres 재연결…", flush=True)
                    pg = connect_postgres(dsn)
                    pg.autocommit = False
                    set_session_timeouts(pg)
                    if not args.no_create:
                        ensure_table(
                            pg,
                            t,
                            cols,
                            use_rowid_pk=use_rowid,
                            recreate=args.recreate,
                        )

                sc, pc = sqlite_count(sqlite_conn, t), pg_count(pg, t)
                if args.skip_existing and sc == pc and sc > 0:
                    print(f"  [{t}] skip-existing ({pc:,})")
                    ok += 1
                    break
                if pc > 0 and not args.truncate:
                    with pg.cursor() as cur:
                        cur.execute(f'TRUNCATE TABLE "{t}" RESTART IDENTITY CASCADE')
                    pg.commit()
                    print(f"  [{t}] 기존 {pc:,}건 비우고 재적재")

                print(f"▶ {t}", flush=True)
                n = copy_table(
                    sqlite_conn,
                    pg,
                    t,
                    cols,
                    use_rowid_pk=use_rowid,
                    batch_rows=args.batch_rows,
                    batch_bytes=batch_bytes,
                )
                pc = pg_count(pg, t)
                if pc != sc and not args.no_count_check:
                    print(f"  !! 건수 불일치 SQLite={sc:,} PG={pc:,}", flush=True)
                    failed.append(t)
                else:
                    if pc != sc:
                        print(
                            f"  OK {n:,}건 (건수 차이 무시 SQLite={sc:,} PG={pc:,})",
                            flush=True,
                        )
                    else:
                        print(f"  OK {n:,}건", flush=True)
                    ok += 1
                break
            except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:
                try:
                    pg.close()
                except Exception:
                    pass
                if attempt > args.retries:
                    print(f"  !! [{t}] 연결 실패(재시도 소진): {e}", flush=True)
                    failed.append(t)
                    break
                wait = 30 * attempt
                print(
                    f"  !! [{t}] 연결 끊김 — {wait}초 후 재시도 "
                    f"({attempt}/{args.retries}): {e}",
                    flush=True,
                )
                time.sleep(wait)
            except Exception as e:
                try:
                    pg.rollback()
                except Exception:
                    pass
                print(f"  !! [{t}] 실패: {e}", flush=True)
                failed.append(t)
                break

    print(f"완료: {ok}/{len(tables)} 테이블")
    if failed:
        print("실패 테이블: " + ", ".join(failed))
    sqlite_conn.close()
    try:
        pg.close()
    except Exception:
        pass
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
