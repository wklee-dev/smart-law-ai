# -*- coding: utf-8 -*-
"""laws / law_versions / law_articles / law_article_items 의 NULL·중복 id 수리.

Postgres PK 적재 전 SQLite에서 실행하세요.
  python scripts/fix-law-table-ids.py --sqlite D:/SQLiteDB/smart_law_ai.db
  python scripts/fix-law-table-ids.py --sqlite C:/SQLiteDB/smart_law_ai.db --apply
"""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


TABLES = ("laws", "law_versions", "law_articles", "law_article_items")


def used_ids(conn: sqlite3.Connection, table: str) -> set[int]:
    rows = conn.execute(
        f'SELECT id FROM "{table}" WHERE id IS NOT NULL'
    ).fetchall()
    return {int(r[0]) for r in rows}


def next_id(used: set[int], start: int) -> int:
    n = start
    while n in used:
        n += 1
    used.add(n)
    return n


def fill_null_ids(conn: sqlite3.Connection, table: str) -> tuple[int, list[tuple[int, int]]]:
    """NULL id → 가능하면 rowid, 충돌 시 새 번호. returns (count, [(rowid, new_id)])"""
    used = used_ids(conn, table)
    null_rows = conn.execute(
        f'SELECT rowid FROM "{table}" WHERE id IS NULL ORDER BY rowid'
    ).fetchall()
    start = (max(used) if used else 0) + 1
    assigned: list[tuple[int, int]] = []
    for (rid,) in null_rows:
        rid = int(rid)
        if rid not in used:
            new_id = rid
            used.add(new_id)
        else:
            new_id = next_id(used, start)
            start = new_id + 1
        conn.execute(f'UPDATE "{table}" SET id = ? WHERE rowid = ?', (new_id, rid))
        assigned.append((rid, new_id))
    return len(assigned), assigned


def fix_duplicate_item_ids(conn: sqlite3.Connection) -> int:
    """law_article_items 중복 id: 하나만 유지, 나머지는 새 id + 같은 조문의 parent 재매핑."""
    used = used_ids(conn, "law_article_items")
    start = (max(used) if used else 0) + 1
    dups = conn.execute(
        """
        SELECT id FROM law_article_items
         WHERE id IS NOT NULL
         GROUP BY id HAVING COUNT(*) > 1
         ORDER BY id
        """
    ).fetchall()
    changed = 0
    for (dup_id,) in dups:
        dup_id = int(dup_id)
        rows = conn.execute(
            """
            SELECT rowid, law_article_id
              FROM law_article_items
             WHERE id = ?
             ORDER BY CASE WHEN rowid = id THEN 0 ELSE 1 END, rowid
            """,
            (dup_id,),
        ).fetchall()
        # 첫 행 유지
        keep_rowid = int(rows[0][0])
        for rowid, law_article_id in rows[1:]:
            rowid = int(rowid)
            new_id = next_id(used, start)
            start = new_id + 1
            conn.execute(
                "UPDATE law_article_items SET id = ? WHERE rowid = ?",
                (new_id, rowid),
            )
            # 이동한 행과 같은 조문에 속한 자식만 parent 갱신
            conn.execute(
                """
                UPDATE law_article_items
                   SET parent_item_id = ?
                 WHERE parent_item_id = ?
                   AND law_article_id = ?
                   AND rowid != ?
                """,
                (new_id, dup_id, law_article_id, keep_rowid),
            )
            changed += 1
    return changed


def fix_rowid_foreign_keys(conn: sqlite3.Connection) -> None:
    """부모가 id≠rowid 인데 자식이 rowid를 가리키는 경우 보정."""
    cur = conn.execute(
        """
        UPDATE law_article_items
           SET law_article_id = (
             SELECT a.id FROM law_articles a
              WHERE a.rowid = law_article_items.law_article_id
           )
         WHERE law_article_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM law_articles a2
              WHERE a2.id = law_article_items.law_article_id
           )
           AND EXISTS (
             SELECT 1 FROM law_articles a3
              WHERE a3.rowid = law_article_items.law_article_id
           )
        """
    )
    print(f"  remapped item→article(rowid): {cur.rowcount}")
    cur = conn.execute(
        """
        UPDATE law_articles
           SET law_version_id = (
             SELECT v.id FROM law_versions v
              WHERE v.rowid = law_articles.law_version_id
           )
         WHERE law_version_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM law_versions v2
              WHERE v2.id = law_articles.law_version_id
           )
           AND EXISTS (
             SELECT 1 FROM law_versions v3
              WHERE v3.rowid = law_articles.law_version_id
           )
        """
    )
    print(f"  remapped article→version(rowid): {cur.rowcount}")
    cur = conn.execute(
        """
        UPDATE law_versions
           SET law_id = (
             SELECT l.id FROM laws l
              WHERE l.rowid = law_versions.law_id
           )
         WHERE law_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM laws l2 WHERE l2.id = law_versions.law_id
           )
           AND EXISTS (
             SELECT 1 FROM laws l3 WHERE l3.rowid = law_versions.law_id
           )
        """
    )
    print(f"  remapped version→law(rowid): {cur.rowcount}")


def report(conn: sqlite3.Connection) -> None:
    for t in TABLES:
        n = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        nulls = conn.execute(
            f'SELECT COUNT(*) FROM "{t}" WHERE id IS NULL'
        ).fetchone()[0]
        dups = conn.execute(
            f"""
            SELECT COUNT(*) FROM (
              SELECT id FROM "{t}" WHERE id IS NOT NULL
              GROUP BY id HAVING COUNT(*) > 1
            )
            """
        ).fetchone()[0]
        print(f"  {t}: rows={n} null_id={nulls} dup_groups={dups}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", type=Path, required=True)
    ap.add_argument(
        "--apply",
        action="store_true",
        help="실제 UPDATE 적용 (없으면 점검만)",
    )
    args = ap.parse_args()
    if not args.sqlite.exists():
        raise SystemExit(f"SQLite 없음: {args.sqlite}")

    conn = sqlite3.connect(str(args.sqlite))
    conn.execute("PRAGMA busy_timeout=60000")
    print("BEFORE")
    report(conn)

    if not args.apply:
        print("\n점검만 수행했습니다. 적용하려면 --apply 를 붙이세요.")
        return

    print("\nAPPLYING…")
    try:
        conn.execute("BEGIN IMMEDIATE")
        for t in ("laws", "law_versions", "law_articles", "law_article_items"):
            n, _ = fill_null_ids(conn, t)
            print(f"  filled null ids: {t} = {n}")
        n_dup = fix_duplicate_item_ids(conn)
        print(f"  remapped duplicate item ids: {n_dup}")
        fix_rowid_foreign_keys(conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    print("\nAFTER")
    report(conn)
    # FK orphan summary (id 기준)
    print("\nFK orphans (should shrink for null-id parents):")
    print(
        "  versions→laws",
        conn.execute(
            """
            SELECT COUNT(*) FROM law_versions v
            LEFT JOIN laws l ON l.id = v.law_id
            WHERE v.law_id IS NOT NULL AND l.id IS NULL
            """
        ).fetchone()[0],
    )
    print(
        "  articles→versions",
        conn.execute(
            """
            SELECT COUNT(*) FROM law_articles a
            LEFT JOIN law_versions v ON v.id = a.law_version_id
            WHERE a.law_version_id IS NOT NULL AND v.id IS NULL
            """
        ).fetchone()[0],
    )
    print(
        "  items→articles",
        conn.execute(
            """
            SELECT COUNT(*) FROM law_article_items i
            LEFT JOIN law_articles a ON a.id = i.law_article_id
            WHERE i.law_article_id IS NOT NULL AND a.id IS NULL
            """
        ).fetchone()[0],
    )
    print("완료")


if __name__ == "__main__":
    main()
