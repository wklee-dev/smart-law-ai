# -*- coding: utf-8 -*-
"""Extract impo column labels from HanjooGatewayAPI/docs/수입테이블.xlsx"""
import json
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
    import openpyxl

XLSX = Path(r"D:/CursorProject/HanjooGatewayAPI/docs/수입테이블.xlsx")
OUT = Path(r"D:/CursorProject/smart-law-ai/app/lib/cas-ncom-impo-column-labels.json")


def to_camel(name: str) -> str:
    parts = name.strip().split("_")
    out = []
    for i, p in enumerate(parts):
        low = p.lower()
        if not low:
            continue
        out.append(low if i == 0 else low[:1].upper() + low[1:])
    return "".join(out) if out else name


def read_sheet_labels(ws) -> dict[str, str]:
    labels: dict[str, str] = {}
    for row in ws.iter_rows(min_row=3, values_only=True):
        if not row or not row[0]:
            continue
        db_col = str(row[0]).strip()
        if not db_col or db_col in ("Impo_key", "Imlan_key", "Impum_key"):
            continue
        label = str(row[1]).strip() if len(row) > 1 and row[1] else db_col
        labels[to_camel(db_col)] = label
    return labels


def main() -> None:
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    merged: dict[str, str] = {}
    for sn in wb.sheetnames:
        merged.update(read_sheet_labels(wb[sn]))
    wb.close()
    OUT.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} ({len(merged)} columns)")


if __name__ == "__main__":
    main()
