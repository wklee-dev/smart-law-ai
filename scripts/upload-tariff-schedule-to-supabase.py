# -*- coding: utf-8 -*-
"""tariff_schedule.db → Supabase(Postgres) 일괄 업로드.

대용량(item_detail 수백만 건)이므로 INSERT 대신 COPY(CSV 스트림)를 사용합니다.

필수:
  pip install psycopg2-binary   # 이미 있으면 생략
  환경변수 SUPABASE_DB_URL 또는 --dsn
    예) postgresql://postgres.[REF]:[PASSWORD]@aws-0-xx.pooler.supabase.com:5432/postgres
    Session mode pooler 또는 Direct connection 권장

예시:
  set SUPABASE_DB_URL=postgresql://...
  python scripts/upload-tariff-schedule-to-supabase.py --dry-run
  python scripts/upload-tariff-schedule-to-supabase.py --truncate
  python scripts/upload-tariff-schedule-to-supabase.py --only tariff_section,tariff_chapter
  python scripts/upload-tariff-schedule-to-supabase.py --skip-existing
"""

from __future__ import annotations

import argparse
import csv
import io
import os
import sqlite3
import sys
import time
from pathlib import Path

import psycopg2
from psycopg2.extensions import connection as PgConnection

DEFAULT_SQLITE = Path(r"D:/SQLiteDB/supabase_importV2/tariff_schedule.db")

# FK/화면 의존 순서 (export-tariff-schedule-supabase.py 와 동일)
TABLES = [
    "tariff_section",
    "tariff_chapter",
    "tariff_heading",
    "tariff_item",
    "tariff_item_detail",
    "tariff_item_detail_state",
    "tariff_req_condition",
    "tariff_req_strategic",
    "tariff_domestic_tax",
    "tariff_origin_marking",
]


def sqlite_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    rows = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
    if not rows:
        raise SystemExit(f"SQLite에 테이블 없음: {table}")
    return [r[1] for r in rows]


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


def truncate_tables(pg: PgConnection, tables: list[str]) -> None:
    # 자식→부모 역순으로 비움 (FK 있으면 CASCADE로 안전)
    names = ", ".join(f'"{t}"' for t in reversed(tables))
    with pg.cursor() as cur:
        cur.execute(f"TRUNCATE TABLE {names} RESTART IDENTITY CASCADE")
    pg.commit()
    print(f"TRUNCATE 완료: {', '.join(reversed(tables))}")


def copy_table(
    sqlite_conn: sqlite3.Connection,
    pg: PgConnection,
    table: str,
    *,
    batch_rows: int,
) -> int:
    cols = sqlite_columns(sqlite_conn, table)
    col_list = ", ".join(f'"{c}"' for c in cols)
    total = sqlite_count(sqlite_conn, table)
    if total == 0:
        print(f"  [{table}] 0건 — skip")
        return 0

    sql = f'SELECT {col_list} FROM "{table}"'
    cur_s = sqlite_conn.execute(sql)
    uploaded = 0
    t0 = time.time()
    copy_sql = f'COPY "{table}" ({col_list}) FROM STDIN WITH (FORMAT csv)'

    while True:
        rows = cur_s.fetchmany(batch_rows)
        if not rows:
            break

        buf = io.StringIO()
        writer = csv.writer(
            buf,
            lineterminator="\n",
            quoting=csv.QUOTE_MINIMAL,
        )
        for row in rows:
            writer.writerow(["" if v is None else v for v in row])
        buf.seek(0)

        with pg.cursor() as cur:
            cur.copy_expert(copy_sql, buf)
        pg.commit()

        uploaded += len(rows)
        elapsed = max(time.time() - t0, 0.001)
        rate = uploaded / elapsed
        pct = 100.0 * uploaded / total
        print(
            f"  [{table}] {uploaded:,}/{total:,} ({pct:5.1f}%) "
            f"{rate:,.0f} rows/s",
            flush=True,
        )

    return uploaded


def parse_only(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    names = [x.strip() for x in raw.split(",") if x.strip()]
    unknown = [n for n in names if n not in TABLES]
    if unknown:
        raise SystemExit(f"--only 알 수 없는 테이블: {unknown}")
    return names


def main() -> None:
    ap = argparse.ArgumentParser(
        description="tariff_schedule.db → Supabase COPY 업로드"
    )
    ap.add_argument("--sqlite", type=Path, default=DEFAULT_SQLITE)
    ap.add_argument(
        "--dsn",
        default=os.environ.get("SUPABASE_DB_URL")
        or os.environ.get("DATABASE_URL")
        or "",
        help="Postgres URI (기본: 환경변수 SUPABASE_DB_URL)",
    )
    ap.add_argument(
        "--batch-rows",
        type=int,
        default=20_000,
        help="COPY 한 번에 보낼 행 수 (기본 20000)",
    )
    ap.add_argument(
        "--only",
        default=None,
        help="쉼표 구분 테이블만 (예: tariff_section,tariff_chapter)",
    )
    ap.add_argument(
        "--truncate",
        action="store_true",
        help="업로드 전 대상 테이블 TRUNCATE CASCADE",
    )
    ap.add_argument(
        "--skip-existing",
        action="store_true",
        help="Postgres 건수가 SQLite와 같으면 해당 테이블 건너뜀",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="연결·건수만 확인, 적재 안 함",
    )
    args = ap.parse_args()

    if not args.sqlite.exists():
        raise SystemExit(f"SQLite 없음: {args.sqlite}")
    if not args.dsn:
        raise SystemExit(
            "DSN 필요: --dsn 또는 환경변수 SUPABASE_DB_URL\n"
            "예) postgresql://postgres.xxx:PASSWORD@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"
        )

    tables = parse_only(args.only) or list(TABLES)

    print("SQLite:", args.sqlite)
    print("대상 테이블:", ", ".join(tables))
    print("batch_rows:", args.batch_rows)

    sqlite_conn = sqlite3.connect(str(args.sqlite))
    src_counts = {t: sqlite_count(sqlite_conn, t) for t in tables}
    for t, n in src_counts.items():
        print(f"  SQLite {t}: {n:,}")

    print("Postgres 연결 중…")
    pg = psycopg2.connect(args.dsn)
    pg.autocommit = False
    set_session_timeouts(pg)

    for t in tables:
        if not pg_table_exists(pg, t):
            raise SystemExit(
                f"Postgres에 public.{t} 없음. "
                "Supabase에 테이블을 먼저 만든 뒤 다시 실행하세요."
            )
        print(f"  PG     {t}: {pg_count(pg, t):,}")

    if args.dry_run:
        print("dry-run — 종료")
        pg.close()
        sqlite_conn.close()
        return

    if args.truncate:
        truncate_tables(pg, tables)

    grand = 0
    t_all = time.time()
    for t in tables:
        src_n = src_counts[t]
        if args.skip_existing and not args.truncate:
            dst_n = pg_count(pg, t)
            if dst_n == src_n and src_n > 0:
                print(f"[{t}] skip-existing ({dst_n:,}건 일치)")
                continue
            if dst_n > 0 and dst_n != src_n:
                raise SystemExit(
                    f"[{t}] Postgres {dst_n:,}건 ≠ SQLite {src_n:,}건. "
                    "--truncate 후 재실행하거나 해당 테이블만 비우세요."
                )

        print(f"[{t}] 업로드 시작 ({src_n:,}건)")
        n = copy_table(
            sqlite_conn, pg, t, batch_rows=args.batch_rows
        )
        dst_n = pg_count(pg, t)
        if dst_n != src_n:
            raise SystemExit(
                f"[{t}] 건수 불일치 SQLite={src_n:,} PG={dst_n:,}"
            )
        print(f"[{t}] 완료 {n:,}건")
        grand += n

    elapsed = time.time() - t_all
    print(f"전체 완료: {grand:,}건 / {elapsed:.1f}s")
    pg.close()
    sqlite_conn.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n중단됨", file=sys.stderr)
        sys.exit(130)
