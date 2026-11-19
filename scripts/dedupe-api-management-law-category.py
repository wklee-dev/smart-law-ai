"""분류를「법령」으로 통일하고, 동일 법령ID 행을 하나로 병합."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data" / "api-management-list.json"

FIELD_ORDER = [
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


def norm_law_id(raw: object) -> str:
    d = "".join(c for c in str(raw or "").strip() if c.isdigit())
    if not d:
        return ""
    if len(d) > 6:
        return d
    n = int(d)
    return str(n).zfill(6)


def pick_text(a: str, b: str) -> str:
    a = (a or "").strip()
    b = (b or "").strip()
    if a and b:
        return a if a >= b else b
    return a or b


def merge_rows(keep: dict, other: dict) -> dict:
    out = {**keep}
    out["category"] = "법령"
    out["lawShortName"] = pick_text(
        str(keep.get("lawShortName", "")),
        str(other.get("lawShortName", "")),
    )
    out["updatedAt"] = pick_text(
        str(keep.get("updatedAt", "")),
        str(other.get("updatedAt", "")),
    )
    out["lastReceivedEflawJosub"] = pick_text(
        str(keep.get("lastReceivedEflawJosub", "")),
        str(other.get("lastReceivedEflawJosub", "")),
    )
    out["lastReceivedAdmrulBody"] = pick_text(
        str(keep.get("lastReceivedAdmrulBody", "")),
        str(other.get("lastReceivedAdmrulBody", "")),
    )
    ao = int(keep.get("uploadOrder") or 0)
    bo = int(other.get("uploadOrder") or 0)
    if ao and bo:
        out["uploadOrder"] = min(ao, bo)
    elif bo:
        out["uploadOrder"] = bo
    return out


def reorder_keys(item: dict) -> dict:
    out = {k: item[k] for k in FIELD_ORDER if k in item}
    for k, v in item.items():
        if k not in out:
            out[k] = v
    return out


def main() -> None:
    items = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    before = len(items)

    merged: dict[str, dict] = {}
    order: list[str] = []

    for item in items:
        row = {**item, "category": "법령"}
        law_id = norm_law_id(row.get("lawId"))
        if law_id:
            key = f"law:{law_id}"
        else:
            key = f"no-law:{row.get('id', row.get('apiName', ''))}"

        if key not in merged:
            merged[key] = row
            order.append(key)
        else:
            merged[key] = merge_rows(merged[key], row)

    result = [reorder_keys(merged[k]) for k in order]
    result.sort(
        key=lambda x: (
            int(x.get("uploadOrder") or 0),
            str(x.get("apiName") or ""),
        )
    )

    for index, row in enumerate(result, start=1):
        row["uploadOrder"] = index

    JSON_PATH.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"merged {before} -> {len(result)} rows -> {JSON_PATH}")


if __name__ == "__main__":
    main()
