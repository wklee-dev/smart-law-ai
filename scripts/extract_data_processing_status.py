# -*- coding: utf-8 -*-
"""Extract data processing status dashboard from Manus Excel (리스트 sheet)."""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
    import openpyxl

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = Path(
    r"D:/Manus/법령정보및관세율,품목분류사례 처리현황.xlsx"
)
XLSX = Path(os.environ.get("DATA_PROCESSING_STATUS_XLSX", DEFAULT_XLSX))
OUT = ROOT / "app/lib/data-processing-status.json"
PROJECT_COPY = ROOT / "docs/dashboard/data-processing-status.xlsx"

EXCLUDED_TARGETS = frozenset({"씨엘"})

COLS: list[tuple[str, str]] = [
    ("category", "구분"),
    ("progress", "진행사항"),
    ("name", "대상"),
    ("extraProgress", "추가진행사항"),
    ("remarks", "비고"),
]


def main() -> None:
    if not XLSX.exists():
        raise FileNotFoundError(f"Excel not found: {XLSX}")

    if XLSX.resolve() != PROJECT_COPY.resolve():
        PROJECT_COPY.parent.mkdir(parents=True, exist_ok=True)
        PROJECT_COPY.write_bytes(XLSX.read_bytes())

    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    ws = wb["리스트"]

    rows: list[dict[str, str]] = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not any(c is not None and str(c).strip() for c in row):
            continue
        item: dict[str, str] = {}
        for i, (key, _label) in enumerate(COLS):
            val = row[i] if i < len(row) else None
            item[key] = "" if val is None else str(val).strip()
        if not item["category"] and not item["progress"] and not item["name"]:
            continue
        if item["name"] in EXCLUDED_TARGETS:
            continue
        rows.append(item)

    wb.close()

    excel_mtime = XLSX.stat().st_mtime if XLSX.exists() else None
    from datetime import datetime, timezone

    payload = {
        "source": str(XLSX),
        "sheet": "리스트",
        "columns": [{"key": k, "label": l} for k, l in COLS],
        "items": rows,
        "syncedAt": datetime.now(timezone.utc).isoformat(),
        "excelModifiedAt": (
            datetime.fromtimestamp(excel_mtime, timezone.utc).isoformat()
            if excel_mtime is not None
            else None
        ),
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} ({len(rows)} items)")


if __name__ == "__main__":
    main()
