"""법령ID 없는 API 목록 행에 엑셀(법령ID) 값을 반영합니다."""
import json
import re
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data" / "api-management-list.json"

EXCEL_SOURCES = [
    ROOT / "data" / "api-management-list.xlsx",
    Path(r"d:\HJCustoms\프로젝트\01.진행중\05.VectorDB\법령별법령id.xlsx"),
]

HEADER_MAP = {
    "구분": "division",
    "분류": "category",
    "정렬순서": "uploadOrder",
    "제공API명": "apiName",
    "법령약칭명": "lawShortName",
    "법령ID": "lawId",
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


def norm_api_name(raw) -> str:
    return re.sub(r"\s+", "", str(raw or "").replace("\xa0", " ").strip())


def load_excel_maps() -> tuple[dict[str, tuple[str, str]], dict[str, tuple[str, str]]]:
    """exact apiName → (lawId, lawShortName), normalized name → same"""
    by_exact: dict[str, tuple[str, str]] = {}
    by_norm: dict[str, tuple[str, str]] = {}

    for xlsx in EXCEL_SOURCES:
        if not xlsx.is_file():
            print(f"skip (not found): {xlsx}")
            continue

        wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        wb.close()

        if not rows:
            continue

        header = [str(c).strip() if c is not None else "" for c in rows[0]]
        col: dict[str, int] = {}
        for i, h in enumerate(header):
            if h in HEADER_MAP:
                col[HEADER_MAP[h]] = i

        if "apiName" not in col or "lawId" not in col:
            print(f"skip (bad header): {xlsx}")
            continue

        count = 0
        for row in rows[1:]:
            if not row:
                continue
            api_idx = col["apiName"]
            id_idx = col["lawId"]
            short_idx = col.get("lawShortName")

            api_name = str(row[api_idx] or "").strip().replace("\xa0", " ")
            law_id = norm_law_id(row[id_idx] if id_idx < len(row) else None)
            law_short = ""
            if short_idx is not None and short_idx < len(row) and row[short_idx]:
                law_short = str(row[short_idx]).strip()

            if not api_name or not law_id:
                continue

            pair = (law_id, law_short)
            by_exact[api_name] = pair
            by_norm[norm_api_name(api_name)] = pair
            count += 1

        print(f"loaded {count} law ids from {xlsx.name}")

    return by_exact, by_norm


def main() -> None:
    if not JSON_PATH.is_file():
        raise SystemExit(f"json not found: {JSON_PATH}")

    by_exact, by_norm = load_excel_maps()
    items = json.loads(JSON_PATH.read_text(encoding="utf-8"))

    updated = 0
    still_missing: list[str] = []

    for item in items:
        if str(item.get("lawId", "")).strip():
            continue

        api_name = str(item.get("apiName", "")).strip()
        hit = by_exact.get(api_name) or by_norm.get(norm_api_name(api_name))
        if not hit:
            still_missing.append(api_name)
            continue

        law_id, law_short = hit
        item["lawId"] = law_id
        if law_short and not str(item.get("lawShortName", "")).strip():
            item["lawShortName"] = law_short
        updated += 1

    JSON_PATH.write_text(
        json.dumps(items, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"updated lawId for {updated} rows")
    print(f"still missing lawId: {len(still_missing)}")
    if still_missing:
        out = ROOT / "data" / "api-management-missing-law-id.txt"
        out.write_text("\n".join(still_missing) + "\n", encoding="utf-8")
        print(f"missing list -> {out}")


if __name__ == "__main__":
    main()
