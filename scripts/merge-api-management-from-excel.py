"""Merge 법령별법령id.xlsx row 2+ into data/api-management-list.json."""
import json
import uuid
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data" / "api-management-list.json"
XLSX_PATH = Path(r"d:\HJCustoms\프로젝트\01.진행중\05.VectorDB\법령별법령id.xlsx")


def norm_law_id(raw) -> str:
    if raw is None:
        return ""
    s = str(raw).strip()
    if not s:
        return ""
    digits = "".join(c for c in s if c.isdigit())
    if not digits:
        return ""
    return digits.zfill(6)[-6:] if len(digits) <= 6 else digits


def norm_short_name(raw) -> str:
    if raw is None:
        return ""
    return str(raw).strip()


def main() -> None:
    existing = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    for item in existing:
        if "lawShortName" not in item:
            item["lawShortName"] = ""

    # Reorder keys: lawShortName before lawId
    def reorder(item: dict) -> dict:
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
        out = {}
        for k in order:
            if k in item:
                out[k] = item[k]
        for k, v in item.items():
            if k not in out:
                out[k] = v
        return out

    existing = [reorder(x) for x in existing]
    def norm_api_name(raw) -> str:
        import re

        s = str(raw or "").replace("\xa0", " ").strip()
        return re.sub(r"\s+", "", s)

    by_api = {x.get("apiName", "").strip(): x for x in existing}
    by_api_norm = {norm_api_name(x.get("apiName", "")): x for x in existing}
    by_law = {x.get("lawId", "").strip(): x for x in existing if x.get("lawId")}

    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    if not rows:
        raise SystemExit("empty sheet")

    header = [str(c).strip() if c is not None else "" for c in rows[0]]
    # Expected: 구분, 분류, 제공API명, 법령약칭명, 법령ID, 파일타입, 최종수신일
    col = {name: i for i, name in enumerate(header)}

    def cell(row, name: str, alt: int):
        idx = col.get(name, alt)
        return row[idx] if idx < len(row) else None

    added = 0
    updated = 0
    excel_row_order = 0
    for row in rows[1:]:
        if not row or not any(row):
            continue
        api_name = str(cell(row, "제공API명", 2) or "").strip()
        if not api_name:
            continue
        excel_row_order += 1
        division = str(cell(row, "구분", 0) or "").strip() or "일반법령"
        category = str(cell(row, "분류", 1) or "").strip() or "관세관련"
        short_name = norm_short_name(cell(row, "법령약칭명", 3))
        law_id = norm_law_id(cell(row, "법령ID", 4))
        ft = str(cell(row, "파일타입", 5) or "JSON").strip().upper()
        if ft not in ("XML", "JSON", "CSV"):
            ft = "JSON"
        updated_at = ""
        if len(header) > 6:
            raw_date = cell(row, "최종수신일", 6)
            if raw_date is not None:
                updated_at = str(raw_date).strip()

        item = by_api.get(api_name) or by_api_norm.get(norm_api_name(api_name))
        if item:
            if short_name:
                item["lawShortName"] = short_name
            if law_id and not str(item.get("lawId", "")).strip():
                item["lawId"] = law_id
            elif law_id:
                item["lawId"] = law_id
            item["division"] = division or item.get("division", "")
            item["category"] = category or item.get("category", "")
            item["uploadOrder"] = excel_row_order
            item["fileType"] = ft
            if updated_at:
                item["updatedAt"] = updated_at
            updated += 1
            continue

        new_item = reorder(
            {
                "id": str(uuid.uuid4()),
                "division": division,
                "category": category,
                "uploadOrder": excel_row_order,
                "apiName": api_name,
                "lawShortName": short_name,
                "lawId": law_id,
                "fileType": ft,
                "updatedAt": updated_at,
                "lastReceivedEflawJosub": "",
                "lastReceivedAdmrulBody": "",
            }
        )
        existing.append(new_item)
        by_api[api_name] = new_item
        if law_id:
            by_law[law_id] = new_item
        added += 1

    CATEGORY_ORDER = [
        "관세관련",
        "무역관련",
        "외국환관련",
        "세관장확인관련",
        "통합공고관련",
        "내국세관련",
    ]

    def category_rank(cat: str) -> int:
        c = (cat or "").strip()
        try:
            return CATEGORY_ORDER.index(c)
        except ValueError:
            return len(CATEGORY_ORDER)

    existing.sort(
        key=lambda x: (
            category_rank(x.get("category", "")),
            int(x.get("uploadOrder", 0)),
            x.get("apiName", ""),
        )
    )
    existing = [reorder(x) for x in existing]

    JSON_PATH.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"saved {JSON_PATH}")
    print(f"total={len(existing)} added={added} updated={updated}")


if __name__ == "__main__":
    main()
