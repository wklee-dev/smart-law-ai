# -*- coding: utf-8 -*-
"""Postgres 내 첨부 절대경로 드라이브 일괄 변경.

예: D:\\SQLiteDB\\... → C:\\SQLiteDB\\...
     D:/SQLiteDB/...  → C:/SQLiteDB/...

RPA-03:
  $env:SMART_LAW_DATABASE_URL = 'postgresql://postgres@127.0.0.1:5432/smart_law_ai'
  $env:PGPASSWORD = Read-Host 'DB Password' -MaskInput
  python scripts/update-attach-root-drive.py
  python scripts/update-attach-root-drive.py --apply
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from urllib.parse import unquote

import psycopg2
from psycopg2.extensions import connection as PgConnection

OLD_ROOTS = [
    r"D:\SQLiteDB",
    r"D:/SQLiteDB",
    r"d:\SQLiteDB",
    r"d:/SQLiteDB",
]
# 슬래시 스타일 유지한 치환쌍
REPLACEMENTS = [
    (r"D:\SQLiteDB", r"C:\SQLiteDB"),
    (r"D:/SQLiteDB", r"C:/SQLiteDB"),
    (r"d:\SQLiteDB", r"C:\SQLiteDB"),
    (r"d:/SQLiteDB", r"C:/SQLiteDB"),
]


def connect(dsn: str) -> PgConnection:
    os.environ.setdefault("PGCLIENTENCODING", "UTF8")
    dsn = dsn.strip().strip('"').strip("'")
    password = (
        os.environ.get("PGPASSWORD", "").strip()
        or os.environ.get("SUPABASE_DB_PASSWORD", "").strip()
    )
    if not password:
        raise SystemExit(
            "PGPASSWORD 필요: $env:PGPASSWORD = Read-Host 'DB Password' -MaskInput"
        )
    user_m = re.match(r"^[a-zA-Z0-9+.-]+://([^:/@]+)", dsn)
    if not user_m or "@" not in dsn:
        raise SystemExit("DSN 형식 오류. 예: postgresql://postgres@127.0.0.1:5432/smart_law_ai")
    user = unquote(user_m.group(1))
    tail = dsn.rsplit("@", 1)[1]
    hostport, _, rest = tail.partition("/")
    if ":" in hostport:
        host, port_s = hostport.rsplit(":", 1)
        port = int(port_s)
    else:
        host, port = hostport, 5432
    dbname = rest.split("?", 1)[0].strip("/") or "postgres"
    print(f"연결: user={user} host={host} port={port} db={dbname}")
    return psycopg2.connect(
        host=host,
        port=port,
        user=user,
        password=password,
        dbname=dbname,
        sslmode="disable",
        client_encoding="UTF8",
        options="-c client_encoding=UTF8 -c lc_messages=C",
    )


def text_columns(pg: PgConnection) -> list[tuple[str, str]]:
    with pg.cursor() as cur:
        cur.execute(
            """
            SELECT table_name, column_name
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND data_type IN ('text', 'character varying', 'character', 'citext')
            ORDER BY table_name, column_name
            """
        )
        return [(str(r[0]), str(r[1])) for r in cur.fetchall()]


def count_matches(pg: PgConnection, table: str, col: str) -> int:
    # LIKE 패턴: D:\SQLiteDB% 와 D:/SQLiteDB%
    clauses = []
    params: list[str] = []
    for root in OLD_ROOTS:
        clauses.append(f'"{col}" LIKE %s')
        params.append(root + "%")
    sql = f'SELECT COUNT(*) FROM "{table}" WHERE {" OR ".join(clauses)}'
    with pg.cursor() as cur:
        try:
            cur.execute(sql, params)
            return int(cur.fetchone()[0])
        except Exception:
            pg.rollback()
            return 0


def apply_replace(pg: PgConnection, table: str, col: str) -> int:
    total = 0
    with pg.cursor() as cur:
        for old, new in REPLACEMENTS:
            # replace() 는 리터럴 부분 치환
            cur.execute(
                f'''
                UPDATE "{table}"
                SET "{col}" = replace("{col}", %s, %s)
                WHERE "{col}" LIKE %s
                ''',
                (old, new, old + "%"),
            )
            total += cur.rowcount
    pg.commit()
    return total


def main() -> None:
    ap = argparse.ArgumentParser(description="D:\\SQLiteDB → C:\\SQLiteDB 경로 일괄 변경")
    ap.add_argument(
        "--dsn",
        default=os.environ.get("SMART_LAW_DATABASE_URL")
        or os.environ.get("DATABASE_URL")
        or "",
    )
    ap.add_argument(
        "--apply",
        action="store_true",
        help="실제 UPDATE (없으면 dry-run)",
    )
    args = ap.parse_args()
    if not args.dsn:
        raise SystemExit("SMART_LAW_DATABASE_URL 또는 --dsn 필요")

    pg = connect(args.dsn)
    cols = text_columns(pg)
    print(f"텍스트 컬럼 스캔: {len(cols)}개")

    hits: list[tuple[str, str, int]] = []
    for table, col in cols:
        n = count_matches(pg, table, col)
        if n > 0:
            hits.append((table, col, n))
            print(f"  {table}.{col}: {n:,}건")

    if not hits:
        print("D:\\SQLiteDB / D:/SQLiteDB 경로를 포함한 행이 없습니다.")
        pg.close()
        return

    print(f"대상 컬럼 {len(hits)}개, 행 합계 {sum(h[2] for h in hits):,}건")
    if not args.apply:
        print("dry-run 종료. 적용하려면 --apply 를 붙이세요.")
        pg.close()
        return

    updated = 0
    for table, col, _ in hits:
        n = apply_replace(pg, table, col)
        print(f"  UPDATED {table}.{col}: {n:,}")
        updated += n

    # 검증
    left = 0
    for table, col, _ in hits:
        left += count_matches(pg, table, col)
    print(f"완료: UPDATE 영향 {updated:,}건, 잔여 D: 경로 {left:,}건")
    pg.close()
    if left:
        sys.exit(1)


if __name__ == "__main__":
    main()
