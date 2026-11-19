"""Import data/api-management-list.xlsx → api-management-list.json (엑셀 기준 전체 동기화)."""
import json
import uuid
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data" / "api-management-list.json"
XLSX_PATH = ROOT / "data" / "api-management-list.xlsx"

CATEGORY_ORDER = [
    "관세관련",
    "무역관련",
    "외국환관련",
    "세관장확인관련",
    "통합공고관련",
    "내국세관련",
]

# export-api-management-to-excel.py 와 동일한 헤더
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


def norm_law_id(raw) -> str:
    if raw is None:
        return ""
    s = str(raw).strip()
    if not s or s.lower() == "none":
        return ""
    digits = "".join(c for c in s if c.isdigit())
    if not digits:
        return s
    if len(digits) > 6:
        return digits
    return str(int(digits)).zfill(6)


def cell_str(raw) -> str:
    if raw is None:
        return ""
    s = str(raw).strip()
    return "" if s.lower() == "none" else s


def norm_api_name(raw) -> str:
    """NBSP·공백 정규화 (동일 법령명 중복 행 방지)."""
    return cell_str(raw).replace("\xa0", " ").strip()


def cell_int(raw, default: int = 0) -> int:
    if raw is None or raw == "":
        return default
    try:
        return int(float(raw))
    except (TypeError, ValueError):
        return default


def category_rank(category: str) -> int:
    c = (category or "").strip()
    try:
        return CATEGORY_ORDER.index(c)
    except ValueError:
        return len(CATEGORY_ORDER)


def reorder_keys(item: dict) -> dict:
    order = [
        "id",
        "division",
        "category",
        "uploadOrder",
        "apiName",
        "lawShortName",
        "lawId",
        "fileType",
        "updatedAt",
        "lastReceivedEflawJosub",
        "lastReceivedAdmrulBody",
    ]
    out = {k: item[k] for k in order if k in item}
    for k, v in item.items():
        if k not in out:
            out[k] = v
    return out


def main() -> None:
    if not XLSX_PATH.is_file():
        raise SystemExit(f"xlsx not found: {XLSX_PATH}")

    def row_key(category: str, api_name: str) -> tuple[str, str]:
        return (category.strip(), norm_api_name(api_name))

    old_by_key: dict[tuple[str, str], dict] = {}
    if JSON_PATH.is_file():
        for item in json.loads(JSON_PATH.read_text(encoding="utf-8")):
            api = norm_api_name(item.get("apiName"))
            cat = cell_str(item.get("category"))
            if api:
                old_by_key[row_key(cat, api)] = item

    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if not rows:
        raise SystemExit("empty sheet")

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
    seen_keys: set[tuple[str, str]] = set()

    for row in rows[1:]:
        if not row or not any(c is not None and str(c).strip() != "" for c in row):
            continue

        api_name = norm_api_name(get(row, "apiName", 3))
        category = cell_str(get(row, "category", 1)) or "관세관련"
        key = row_key(category, api_name)
        if not api_name or key in seen_keys:
            continue
        seen_keys.add(key)

        division = cell_str(get(row, "division", 0)) or "일반법령"
        upload_order = cell_int(get(row, "uploadOrder", 2), len(out) + 1)
        law_short = cell_str(get(row, "lawShortName", 4))
        law_id = norm_law_id(get(row, "lawId", 5))
        ft = cell_str(get(row, "fileType", 6)).upper() or "JSON"
        if ft not in ("XML", "JSON", "CSV"):
            ft = "JSON"
        updated_at = cell_str(get(row, "updatedAt", 7))
        last_josub = cell_str(get(row, "lastReceivedEflawJosub", 8))
        last_admrul = cell_str(get(row, "lastReceivedAdmrulBody", 9))

        old = old_by_key.get(key)
        item_id = (old.get("id") if old else None) or str(uuid.uuid4())
        if not last_josub and old:
            last_josub = cell_str(old.get("lastReceivedEflawJosub"))
        if not last_admrul and old:
            last_admrul = cell_str(old.get("lastReceivedAdmrulBody"))

        out.append(
            reorder_keys(
                {
                    "id": item_id,
                    "division": division,
                    "category": category,
                    "uploadOrder": upload_order,
                    "apiName": api_name,
                    "lawShortName": law_short,
                    "lawId": law_id,
                    "fileType": ft,
                    "updatedAt": updated_at,
                    "lastReceivedEflawJosub": last_josub,
                    "lastReceivedAdmrulBody": last_admrul,
                }
            )
        )

    out.sort(
        key=lambda x: (
            category_rank(x.get("category", "")),
            int(x.get("uploadOrder", 0)),
            x.get("apiName", ""),
        )
    )

    JSON_PATH.write_text(
        json.dumps(out, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    removed = len(old_by_key) - len(seen_keys & set(old_by_key.keys()))
    print(f"imported {len(out)} rows from {XLSX_PATH}")
    print(f"removed from json (not in xlsx): {max(0, removed)}")
    print(f"saved -> {JSON_PATH}")


if __name__ == "__main__":
    main()
