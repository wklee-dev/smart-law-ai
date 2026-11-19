# -*- coding: utf-8 -*-
"""Extract import performance grid from 수입실적조회템플릿.xlsx (row 1 Korean headers)."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

try:
    import openpyxl
except ImportError:
    import subprocess

    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
    import openpyxl

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TEMPLATE = Path(
    r"D:/HJCustoms/프로젝트/01.진행중/19.HanjooGatewayAPI/설계/수입실적조회템플릿.xlsx"
)
GRID_XLSX = Path(
    os.environ.get(
        "IMPORT_PERFORMANCE_GRID_XLSX",
        DEFAULT_TEMPLATE if DEFAULT_TEMPLATE.exists() else ROOT / "docs/cas-ncom/import-performance-grid.xlsx",
    )
)
TABLE_XLSX = Path(
    os.environ.get(
        "IMPORT_PERFORMANCE_LABEL_XLSX",
        r"D:/CursorProject/HanjooGatewayAPI/docs/수입테이블.xlsx",
    )
)
OUT = ROOT / "app/lib/cas-ncom-import-performance-grid.json"
PROJECT_COPY = ROOT / "docs/cas-ncom/import-performance-grid.xlsx"

# 템플릿 한글명 → API camelCase (수입테이블과 표기가 다른 항목)
MANUAL_KEY_BY_LABEL: dict[str, str] = {
    "신고번호": "impoSingoNo",
    "관리번호": "impoKey",
    "원산지증명유무": "impoWonsanjiYn",
    "납세자사업장일련번호": "impoNapsecomno",
    "고지서납부기한1": "impoNapbuDate1",
    "고지서납부기한2": "impoNapbuDate2",
    "확정신고기한": "impoUseSinDt",
    "공통가산금2": "impoInlandFre",
    "공통사항계산된가산금2원화": "impoInlandFreWon",
    "입력자": "userNM",
    "내국세부호": "imlanNegukCode",
    "탄력실행세율": "imlanElasticSeyul",
    "공사번호": "c31",
    "MasterB/L번호": "impoMblNo",
    "B/L번호": "impoBlNo",
    "선기명_1": "impoSungiName",
    "수량_1": "impumSu",
    "수량단위_1": "impumSuDanwi",
    "란번호2": "impumLan",
    "FTA대상_1": "imlanFtaObj",
    "부가세면세과표_1": "imlanMyunGwapyo",
    "내국세_1": "imlanNegukTax",
    "교육세_1": "imlanEduTax",
    "농특세_1": "imlanNongTax",
    "부가세_1": "imlanVatTax",
}


def to_camel(name: str) -> str:
    parts = re.split(r"[_\s]+", name.strip())
    out: list[str] = []
    for i, p in enumerate(parts):
        low = p.lower()
        if not low:
            continue
        out.append(low if i == 0 else low[:1].upper() + low[1:])
    return "".join(out) if out else name


def build_label_index(xlsx: Path) -> dict[str, list[str]]:
    index: dict[str, list[str]] = {}
    if not xlsx.exists():
        return index

    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    for sn in wb.sheetnames:
        for row in wb[sn].iter_rows(min_row=3, values_only=True):
            if not row or not row[0]:
                continue
            db_col = str(row[0]).strip()
            label = str(row[1]).strip() if len(row) > 1 and row[1] else db_col
            key = to_camel(db_col)
            for variant in {label, label.split(":")[0].strip(), re.sub(r"\(.*?\)", "", label).strip()}:
                if not variant:
                    continue
                bucket = index.setdefault(variant, [])
                if key not in bucket:
                    bucket.append(key)
    wb.close()
    return index


def resolve_key(label: str, index: dict[str, list[str]]) -> str | None:
    if label in MANUAL_KEY_BY_LABEL:
        return MANUAL_KEY_BY_LABEL[label]

    if label in index:
        return index[label][0]

    for lab, keys in index.items():
        if label == lab or (len(label) >= 2 and (label in lab or lab in label)):
            return keys[0]

    return None


def infer_align(key: str) -> str | None:
    if key.endswith("Date") or key.endswith("Dt") or key.endswith("Lan") or key.endswith("Heang"):
        return "center"
    if key.endswith("Amt") or key.endswith("Su") or key.endswith("Tax") or "Won" in key or "Usd" in key:
        return "right"
    return None


def infer_mono(key: str) -> bool:
    return key in {
        "impoSingoNo",
        "imlanHs",
        "impumJajaeCode",
        "impoBlNo",
        "impoMblNo",
        "impoFileNo1",
        "impoFileNo2",
        "impoMrnNo",
    }


def read_template_headers(xlsx: Path) -> list[str]:
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    headers = [
        str(c).strip()
        for c in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
        if c is not None and str(c).strip()
    ]
    wb.close()
    return headers


def main() -> None:
    if not GRID_XLSX.exists():
        raise FileNotFoundError(f"Template Excel not found: {GRID_XLSX}")

    if GRID_XLSX.resolve() != PROJECT_COPY.resolve():
        PROJECT_COPY.parent.mkdir(parents=True, exist_ok=True)
        PROJECT_COPY.write_bytes(GRID_XLSX.read_bytes())

    label_index = build_label_index(TABLE_XLSX)
    headers = read_template_headers(GRID_XLSX)

    columns: list[dict[str, str | bool]] = []
    unresolved: list[str] = []

    for label in headers:
        key = resolve_key(label, label_index)
        if not key:
            unresolved.append(label)
            key = f"col{len(columns)}"
        col: dict[str, str | bool] = {
            "id": f"col-{len(columns)}",
            "key": key,
            "label": label,
        }
        align = infer_align(key)
        if align:
            col["align"] = align
        if infer_mono(key):
            col["mono"] = True
        columns.append(col)

    payload = {
        "source": str(GRID_XLSX),
        "sheet": "수입실적",
        "columns": columns,
        "unresolvedLabels": unresolved,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} ({len(columns)} columns, unresolved={len(unresolved)})")
    if unresolved:
        print("unresolved:", unresolved)


if __name__ == "__main__":
    main()
