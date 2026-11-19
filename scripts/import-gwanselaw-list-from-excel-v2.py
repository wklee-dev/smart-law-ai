"""법령별법령id V2.xlsx → gwanselaw_list (분류 != 관세관련만 반영).

기존 DB의「관세관련」행은 유지하고, 엑셀의 그 외 분류 행으로
동일 분류·법령명 또는 법령ID가 맞는 항목을 갱신·추가합니다.

사용:
  python scripts/import-gwanselaw-list-from-excel-v2.py
  python scripts/import-gwanselaw-list-from-excel-v2.py --xlsx "d:\\path\\법령별법령id V2.xlsx"
"""
from __future__ import annotations

import argparse
import os
import sqlite3
import uuid
from collections import Counter
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = Path(
    r"d:\HJCustoms\프로젝트\01.진행중\05.VectorDB\법령별법령id V2.xlsx",
)
DEFAULT_DB = Path(
    os.environ.get("SMART_LAW_SQLITE_DB_PATH", "")
    or os.environ.get("SMART_LAW_DB_PATH", "")
    or r"D:/SQLiteDB/smart_law_ai.db",
)

HEADER_ALIASES = {
    "구분": "division",
    "분류": "category",
    "정렬순서": "uploadOrder",
    "제공API명": "apiName",
    "법령약칭명": "lawShortName",
    "법령ID": "lawId",
    "파일타입": "fileType",
    "최종수신일": "updatedAt",
    "조항호목최종수신": "lastReceivedEflawJosub",
    "행정규칙본문최종수신": "lastReceivedAdmrulBody",
}

CATEGORY_ORDER = [
    "관세관련",
    "무역관련",
    "외국환관련",
    "세관장확인관련",
    "통합공고관련",
    "내국세관련",
]


def cell_str(raw: object) -> str:
    if raw is None:
        return ""
    s = str(raw).strip()
    return "" if s.lower() == "none" else s


def norm_api_name(raw: object) -> str:
    return cell_str(raw).replace("\xa0", " ").strip()


def norm_law_id(raw: object) -> str:
    s = cell_str(raw)
    if not s:
        return ""
    digits = "".join(c for c in s if c.isdigit())
    if not digits:
        return s
    if len(digits) > 6:
        return digits
    return str(int(digits)).zfill(6)


def cell_int(raw: object, default: int = 0) -> int:
    if raw is None or raw == "":
        return default
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return default


def pick_richer(a: str, b: str) -> str:
    left, right = a.strip(), b.strip()
    if left and right:
        return left if left >= right else right
    return left or right


def category_rank(category: str) -> int:
    c = (category or "").strip()
    try:
        return CATEGORY_ORDER.index(c)
    except ValueError:
        return len(CATEGORY_ORDER)


def ensure_table(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS gwanselaw_list (
          id TEXT PRIMARY KEY NOT NULL,
          division TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          upload_order INTEGER NOT NULL DEFAULT 0,
          api_name TEXT NOT NULL DEFAULT '',
          law_short_name TEXT NOT NULL DEFAULT '',
          law_id TEXT NOT NULL DEFAULT '',
          file_type TEXT NOT NULL DEFAULT 'XML',
          portal_category TEXT NOT NULL DEFAULT '',
          updated_at TEXT NOT NULL DEFAULT '',
          last_received_eflaw_josub TEXT NOT NULL DEFAULT '',
          last_received_admrul_body TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_gwanselaw_list_law_id ON gwanselaw_list(law_id);
        CREATE INDEX IF NOT EXISTS idx_gwanselaw_list_upload_order ON gwanselaw_list(upload_order);
        """
    )


def load_db_rows(conn: sqlite3.Connection) -> list[dict]:
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    rows = cur.execute(
        """
        SELECT id, division, category, upload_order, api_name, law_short_name,
               law_id, file_type, portal_category, updated_at,
               last_received_eflaw_josub, last_received_admrul_body
        FROM gwanselaw_list
        """
    ).fetchall()
    return [dict(r) for r in rows]


def read_excel_rows(xlsx: Path) -> list[dict]:
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    if not rows:
        return []

    header = [cell_str(c) for c in rows[0]]
    col_map: dict[str, int] = {}
    for i, h in enumerate(header):
        if h in HEADER_ALIASES:
            col_map[HEADER_ALIASES[h]] = i
        elif h:
            col_map[h] = i

    def get(row: tuple, field: str, fallback_idx: int):
        idx = col_map.get(field, fallback_idx)
        return row[idx] if idx < len(row) else None

    out: list[dict] = []
    seen: set[tuple[str, str]] = set()

    for row in rows[1:]:
        if not row or not any(c is not None and str(c).strip() != "" for c in row):
            continue

        api_name = norm_api_name(get(row, "apiName", 3))
        category = cell_str(get(row, "category", 1))
        if not api_name or not category:
            continue

        key = (category, api_name)
        if key in seen:
            continue
        seen.add(key)

        ft = cell_str(get(row, "fileType", 6)).upper() or "JSON"
        if ft not in ("XML", "JSON", "CSV"):
            ft = "JSON"

        out.append(
            {
                "division": cell_str(get(row, "division", 0)) or "일반법령",
                "category": category,
                "uploadOrder": cell_int(get(row, "uploadOrder", 2), len(out) + 1),
                "apiName": api_name,
                "lawShortName": cell_str(get(row, "lawShortName", 4)),
                "lawId": norm_law_id(get(row, "lawId", 5)),
                "fileType": ft,
                "updatedAt": cell_str(get(row, "updatedAt", 7)),
                "lastReceivedEflawJosub": cell_str(get(row, "lastReceivedEflawJosub", 8)),
                "lastReceivedAdmrulBody": cell_str(
                    get(row, "lastReceivedAdmrulBody", 9)
                ),
            }
        )
    return out


def build_lookup(db_rows: list[dict]) -> dict[str, dict]:
    by_key: dict[str, dict] = {}
    for row in db_rows:
        cat = cell_str(row.get("category"))
        api = norm_api_name(row.get("api_name"))
        law_id = norm_law_id(row.get("law_id"))
        if api:
            by_key[f"cat:{cat}|api:{api}"] = row
        if law_id:
            by_key[f"law:{law_id}"] = row
    return by_key


def merge_with_existing(excel_item: dict, lookup: dict[str, dict]) -> dict:
    cat = excel_item["category"]
    api = excel_item["apiName"]
    law_id = excel_item["lawId"]

    old = lookup.get(f"cat:{cat}|api:{api}")
    if old is None and law_id:
        old = lookup.get(f"law:{law_id}")

    item_id = (old or {}).get("id") or str(uuid.uuid4())
    portal = cat

    return {
        "id": item_id,
        "division": excel_item["division"],
        "category": cat,
        "uploadOrder": excel_item["uploadOrder"],
        "apiName": api,
        "lawShortName": pick_richer(
            excel_item["lawShortName"],
            cell_str((old or {}).get("law_short_name")),
        ),
        "lawId": law_id or norm_law_id((old or {}).get("law_id")),
        "fileType": excel_item["fileType"],
        "portalCategory": portal,
        "updatedAt": pick_richer(
            excel_item["updatedAt"],
            cell_str((old or {}).get("updated_at")),
        ),
        "lastReceivedEflawJosub": pick_richer(
            excel_item["lastReceivedEflawJosub"],
            cell_str((old or {}).get("last_received_eflaw_josub")),
        ),
        "lastReceivedAdmrulBody": pick_richer(
            excel_item["lastReceivedAdmrulBody"],
            cell_str((old or {}).get("last_received_admrul_body")),
        ),
    }


def row_to_item(row: dict) -> dict:
    return {
        "id": row["id"],
        "division": row["division"],
        "category": row["category"],
        "uploadOrder": row["upload_order"],
        "apiName": row["api_name"],
        "lawShortName": row["law_short_name"],
        "lawId": row["law_id"],
        "fileType": row["file_type"],
        "portalCategory": row["portal_category"] or row["category"],
        "updatedAt": row["updated_at"],
        "lastReceivedEflawJosub": row["last_received_eflaw_josub"],
        "lastReceivedAdmrulBody": row["last_received_admrul_body"],
    }


def save_all(conn: sqlite3.Connection, items: list[dict]) -> None:
    conn.execute("DELETE FROM gwanselaw_list")
    conn.executemany(
        """
        INSERT INTO gwanselaw_list (
          id, division, category, upload_order, api_name, law_short_name,
          law_id, file_type, portal_category, updated_at,
          last_received_eflaw_josub, last_received_admrul_body
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                i["id"],
                i["division"],
                i["category"],
                i["uploadOrder"],
                i["apiName"],
                i["lawShortName"],
                i["lawId"],
                i["fileType"],
                i.get("portalCategory", i["category"]),
                i["updatedAt"],
                i["lastReceivedEflawJosub"],
                i["lastReceivedAdmrulBody"],
            )
            for i in items
        ],
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xlsx", type=Path, default=DEFAULT_XLSX)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()

    if not args.xlsx.is_file():
        raise SystemExit(f"xlsx not found: {args.xlsx}")
    if not args.db.parent.is_dir():
        raise SystemExit(f"db directory missing: {args.db.parent}")

    excel_rows = read_excel_rows(args.xlsx)
    excel_non = [r for r in excel_rows if r["category"] != "관세관련"]
    excel_customs = [r for r in excel_rows if r["category"] == "관세관련"]

    conn = sqlite3.connect(args.db)
    ensure_table(conn)
    db_rows = load_db_rows(conn)
    lookup = build_lookup(db_rows)

    # 관세관련 + 기존 DB의 비엑셀-비관세(예: 분류「법령」) 행 유지
    non_customs_law_ids = {
        item["lawId"] for item in excel_non if item["lawId"]
    }
    non_customs_keys = {
        (item["category"], item["apiName"]) for item in excel_non
    }

    kept: list[dict] = []
    for row in db_rows:
        cat = cell_str(row.get("category"))
        api = norm_api_name(row.get("api_name"))
        law_id = norm_law_id(row.get("law_id"))

        if cat == "관세관련":
            kept.append(row_to_item(row))
            continue

        # 엑셀 비관세에 동일 법령ID·분류가 있으면 엑셀 기준으로 대체
        if law_id and law_id in non_customs_law_ids:
            continue
        if (cat, api) in non_customs_keys:
            continue

        kept.append(row_to_item(row))

    merged_non = [merge_with_existing(item, lookup) for item in excel_non]
    final_map: dict[str, dict] = {item["id"]: item for item in kept}

    for item in merged_non:
        final_map[item["id"]] = item

    final = list(final_map.values())
    final.sort(
        key=lambda x: (
            category_rank(x["category"]),
            int(x["uploadOrder"] or 0),
            x["apiName"],
        )
    )
    for idx, item in enumerate(final, start=1):
        item["uploadOrder"] = idx

    save_all(conn, final)
    conn.commit()
    conn.close()

    print(f"xlsx: {args.xlsx}")
    print(f"db: {args.db}")
    print(f"엑셀 전체: {len(excel_rows)}건 (관세관련 {len(excel_customs)}, 그 외 {len(excel_non)})")
    print(f"DB 유지(관세관련·비엑셀-비관세): {len(kept)}건")
    print(f"엑셀 비관세 반영: {len(merged_non)}건")
    print(f"최종 gwanselaw_list: {len(final)}건")
    print("분류별:", dict(Counter(i["category"] for i in final)))


if __name__ == "__main__":
    main()
