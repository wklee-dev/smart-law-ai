# -*- coding: utf-8 -*-
"""로컬 smart_law_ai.db → Supabase(Postgres) COPY 업로드 (Hanjoo 조회 81테이블).

사전:
  1) scripts/supabase/create_hanjoo_tables.sql 을 SQL Editor에서 실행
  2) pip install psycopg2-binary
  3) Session pooler(5432) 연결 문자열을 환경변수로만 설정 (채팅·파일에 비밀번호 쓰지 말 것)

예:
  $env:SUPABASE_DB_URL = Read-Host "DSN" -MaskInput
  python scripts/upload-hanjoo-to-supabase.py --dry-run
  python scripts/upload-hanjoo-to-supabase.py --only laws,law_versions
  python scripts/upload-hanjoo-to-supabase.py --skip-existing
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path
from urllib.parse import unquote

import psycopg2
from psycopg2.extensions import connection as PgConnection

ROOT = Path(__file__).resolve().parents[1]
META_PATH = ROOT / "scripts" / "supabase" / "hanjoo_tables.json"
DEFAULT_SQLITE = Path(r"D:/SQLiteDB/smart_law_ai.db")

BLOB_OMIT = {
    ("foreign_case_images", "image_data"),
    ("case_images", "image_data"),
}


def load_tables() -> list[str]:
    meta = json.loads(META_PATH.read_text(encoding="utf-8"))
    return list(meta["tables"])


# SQLite에 PK가 없어 Postgres에 sqlite_rowid 를 둔 테이블
ROWID_AS_PK = {"jangchi_code"}


def sqlite_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    rows = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
    if not rows:
        raise SystemExit(f"SQLite에 테이블 없음: {table}")
    cols = [r[1] for r in rows if (table, r[1]) not in BLOB_OMIT]
    if table in ROWID_AS_PK:
        cols = ["sqlite_rowid", *cols]
    return cols


def sqlite_count(conn: sqlite3.Connection, table: str) -> int:
    return int(conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])


def pg_count(pg: PgConnection, table: str) -> int:
    with pg.cursor() as cur:
        cur.execute(f'SELECT COUNT(*) FROM "{table}"')
        return int(cur.fetchone()[0])


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


def set_session_timeouts(pg: PgConnection) -> None:
    with pg.cursor() as cur:
        cur.execute("SET statement_timeout = 0")
        cur.execute("SET idle_in_transaction_session_timeout = 0")
    pg.commit()


NULL_MARK = r"\N"


def cell(v: object) -> str:
    if v is None:
        return NULL_MARK
    if isinstance(v, (bytes, memoryview)):
        # BLOB은 스키마에서 제외했지만 방어
        return NULL_MARK
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


def copy_table(
    sqlite_conn: sqlite3.Connection,
    pg: PgConnection,
    table: str,
    *,
    batch_rows: int,
    batch_bytes: int,
) -> int:
    cols = sqlite_columns(sqlite_conn, table)
    col_list = ", ".join(f'"{c}"' for c in cols)
    total = sqlite_count(sqlite_conn, table)
    if total == 0:
        print(f"  [{table}] 0건 — skip")
        return 0

    if table in ROWID_AS_PK:
        data_cols = [c for c in cols if c != "sqlite_rowid"]
        select_list = "rowid AS sqlite_rowid, " + ", ".join(
            f'"{c}"' for c in data_cols
        )
    else:
        select_list = col_list
    sql = f'SELECT {select_list} FROM "{table}"'
    cur_s = sqlite_conn.execute(sql)
    uploaded = 0
    t0 = time.time()
    copy_sql = (
        f'COPY "{table}" ({col_list}) FROM STDIN '
        f"WITH (FORMAT csv, NULL '{NULL_MARK}')"
    )

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
            writer.writerow([cell(v) for v in row])
            pending += 1
            if pending >= batch_rows or buf.tell() >= batch_bytes:
                flush()
    flush()
    return uploaded


def connect_postgres(dsn: str) -> PgConnection:
    """비밀번호는 SUPABASE_DB_PASSWORD 또는 PGPASSWORD 로만 받습니다.

    URI에 비밀번호를 넣으면(@ # ! 등) 호스트가 깨지므로, URL 안의 비밀번호는
    무시하고 호스트·포트·DB명만 추출합니다.
    Supabase와 로컬 PostgreSQL(RPA-03 등) 모두 지원합니다.
    """
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
            "  $env:PGPASSWORD = Read-Host 'DB Password' -MaskInput\n"
            "  (또는 $env:SUPABASE_DB_PASSWORD = ...)"
        )

    # 사용자: postgresql://USER...  (콜론·@ 앞)
    user_m = re.match(r"^[a-zA-Z0-9+.-]+://([^:/@]+)", dsn)
    if not user_m:
        raise SystemExit(
            "DSN에서 사용자명을 찾지 못했습니다.\n"
            "예(로컬): postgresql://postgres@127.0.0.1:5432/smart_law_ai\n"
            "예(Supabase): postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-....pooler.supabase.com:5432/postgres"
        )
    user = unquote(user_m.group(1))

    # 호스트: 비밀번호에 @ 가 있어도 마지막 @ 뒤가 host:port/db
    if "@" not in dsn:
        raise SystemExit(
            "DSN에 @ 가 없습니다. 예: postgresql://postgres@127.0.0.1:5432/smart_law_ai"
        )
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
            "Supabase 또는 로컬/사내 IP(예: 127.0.0.1)만 사용하세요."
        )

    sslmode = "require" if is_supabase else "disable"
    if "sslmode=" in dsn:
        sm = re.search(r"sslmode=([a-zA-Z0-9-]+)", dsn)
        if sm:
            sslmode = sm.group(1)

    print(f"연결: user={user} host={host} port={port} db={dbname} sslmode={sslmode}")
    return psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        dbname=dbname,
        sslmode=sslmode,
    )


def main() -> None:
    tables_all = load_tables()
    ap = argparse.ArgumentParser(description="smart_law_ai.db → Supabase Hanjoo 테이블 업로드")
    ap.add_argument("--sqlite", type=Path, default=DEFAULT_SQLITE)
    ap.add_argument(
        "--dsn",
        default=os.environ.get("SUPABASE_DB_URL")
        or os.environ.get("DATABASE_URL")
        or "",
    )
    ap.add_argument("--batch-rows", type=int, default=10_000)
    ap.add_argument("--batch-mb", type=float, default=8.0, help="COPY 1회 최대 크기(MB)")
    ap.add_argument("--retries", type=int, default=3, help="연결 끊김 시 테이블별 재시도")
    ap.add_argument("--only", default=None, help="쉼표 구분 테이블만")
    ap.add_argument("--truncate", action="store_true")
    ap.add_argument("--skip-existing", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not META_PATH.exists():
        raise SystemExit(f"메타 없음: {META_PATH}")
    if not args.sqlite.exists():
        raise SystemExit(f"SQLite 없음: {args.sqlite}")
    if not args.dsn:
        raise SystemExit(
            "DSN 필요: 환경변수 SUPABASE_DB_URL 또는 --dsn\n"
            "권장:\n"
            "  $env:SUPABASE_DB_URL = '<Connect에서 복사한 URI — 비밀번호는 [YOUR-PASSWORD] 그대로>'\n"
            "  $env:SUPABASE_DB_PASSWORD = Read-Host 'DB Password' -MaskInput"
        )

    if args.only:
        tables = [x.strip() for x in args.only.split(",") if x.strip()]
        unknown = [t for t in tables if t not in tables_all]
        if unknown:
            raise SystemExit(f"--only 알 수 없는 테이블: {unknown}")
    else:
        tables = list(tables_all)

    print("SQLite:", args.sqlite)
    print("테이블:", len(tables), "개")
    sqlite_conn = sqlite3.connect(f"file:{args.sqlite.as_posix()}?mode=ro", uri=True)
    for t in tables:
        print(f"  SQLite {t}: {sqlite_count(sqlite_conn, t):,}")

    print("Postgres 연결 중…")
    pg = connect_postgres(args.dsn)
    pg.autocommit = False
    set_session_timeouts(pg)

    missing = [t for t in tables if not pg_table_exists(pg, t)]
    if missing:
        raise SystemExit(
            "Postgres에 없는 테이블:\n  "
            + ", ".join(missing)
            + "\n먼저 scripts/supabase/create_hanjoo_tables.sql 을 SQL Editor에서 실행하세요."
        )

    if args.dry_run:
        for t in tables:
            print(f"  PG {t}: {pg_count(pg, t):,}")
        print("dry-run 종료 (적재 없음)")
        return

    if args.truncate:
        names = ", ".join(f'"{t}"' for t in reversed(tables))
        with pg.cursor() as cur:
            cur.execute(f"TRUNCATE TABLE {names} RESTART IDENTITY CASCADE")
        pg.commit()
        print("TRUNCATE 완료")

    batch_bytes = int(args.batch_mb * 1024 * 1024)
    ok = 0
    failed: list[str] = []
    for t in tables:
        for attempt in range(1, args.retries + 2):
            try:
                if pg.closed:
                    print("  Postgres 재연결…", flush=True)
                    pg = connect_postgres(args.dsn)
                    pg.autocommit = False
                    set_session_timeouts(pg)
                sc, pc = sqlite_count(sqlite_conn, t), pg_count(pg, t)
                if args.skip_existing and sc == pc and sc > 0:
                    print(f"  [{t}] skip-existing ({pc:,})")
                    ok += 1
                    break
                if pc > 0:
                    # 중간에 끊겨 일부만 들어간 테이블은 비우고 다시 적재
                    with pg.cursor() as cur:
                        cur.execute(f'TRUNCATE TABLE "{t}" RESTART IDENTITY CASCADE')
                    pg.commit()
                    print(f"  [{t}] 기존 {pc:,}건 비우고 재적재")
                print(f"▶ {t}", flush=True)
                n = copy_table(
                    sqlite_conn, pg, t,
                    batch_rows=args.batch_rows, batch_bytes=batch_bytes,
                )
                pc = pg_count(pg, t)
                if pc != sc:
                    print(f"  !! 건수 불일치 SQLite={sc:,} PG={pc:,}", flush=True)
                    failed.append(t)
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
                print(f"  !! [{t}] 연결 끊김 — {wait}초 후 재시도 ({attempt}/{args.retries}): {e}", flush=True)
                time.sleep(wait)
            except psycopg2.Error as e:
                pg.rollback()
                print(f"  !! [{t}] 실패: {e}", flush=True)
                failed.append(t)
                break

    print(f"완료: {ok}/{len(tables)} 테이블")
    if failed:
        print("실패 테이블: " + ", ".join(failed))
    sqlite_conn.close()
    pg.close()
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
