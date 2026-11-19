"""uploadOrder 보정 + 분류·업로드순으로 api-management-list.json 재정렬."""
import json
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data" / "api-management-list.json"
XLSX_PATH = Path(r"d:\HJCustoms\프로젝트\01.진행중\05.VectorDB\법령별법령id.xlsx")

CATEGORY_ORDER = [
    "관세관련",
    "무역관련",
    "외국환관련",
    "세관장확인관련",
    "통합공고관련",
    "내국세관련",
]


def category_rank(category: str) -> int:
    c = (category or "").strip()
    try:
        return CATEGORY_ORDER.index(c)
    except ValueError:
        return len(CATEGORY_ORDER)


def load_excel_upload_order() -> dict[str, int]:
    if not XLSX_PATH.is_file():
        return {}
    wb = openpyxl.load_workbook(XLSX_PATH, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    if not rows:
        return {}
    header = [str(c).strip() if c else "" for c in rows[0]]
    col = {name: i for i, name in enumerate(header)}
    api_idx = col.get("제공API명", 2)
    out: dict[str, int] = {}
    order = 0
    for row in rows[1:]:
        if not row or not any(row):
            continue
        api = str(row[api_idx] or "").strip() if api_idx < len(row) else ""
        if not api:
            continue
        order += 1
        if api not in out:
            out[api] = order
    return out


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
    items = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    excel_order = load_excel_upload_order()
    fallback = max(excel_order.values(), default=0)

    for i, item in enumerate(items):
        api = (item.get("apiName") or "").strip()
        if api in excel_order:
            item["uploadOrder"] = excel_order[api]
        elif "uploadOrder" not in item or not item.get("uploadOrder"):
            fallback += 1
            item["uploadOrder"] = fallback
        else:
            item["uploadOrder"] = int(item["uploadOrder"])

    items.sort(
        key=lambda x: (
            category_rank(x.get("category", "")),
            int(x.get("uploadOrder", 0)),
            (x.get("apiName") or ""),
        )
    )

    items = [reorder_keys(x) for x in items]
    JSON_PATH.write_text(
        json.dumps(items, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"sorted {len(items)} rows -> {JSON_PATH}")


if __name__ == "__main__":
    main()
