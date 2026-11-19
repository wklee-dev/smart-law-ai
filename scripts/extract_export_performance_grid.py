# -*- coding: utf-8 -*-
"""Extract export performance grid from 수출실적조회템플릿.xlsx (row 1 Korean headers)."""
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
    r"D:/HJCustoms/프로젝트/01.진행중/19.HanjooGatewayAPI/설계/수출실적조회템플릿.xlsx"
)
GRID_XLSX = Path(
    os.environ.get(
        "EXPORT_PERFORMANCE_GRID_XLSX",
        DEFAULT_TEMPLATE if DEFAULT_TEMPLATE.exists() else ROOT / "docs/cas-ncom/export-performance-grid.xlsx",
    )
)
TABLE_XLSX = Path(
    os.environ.get(
        "EXPORT_PERFORMANCE_LABEL_XLSX",
        r"D:/CursorProject/HanjooGatewayAPI/docs/수출테이블.xlsx",
    )
)
OUT = ROOT / "app/lib/cas-ncom-export-performance-grid.json"
PROJECT_COPY = ROOT / "docs/cas-ncom/export-performance-grid.xlsx"

# 템플릿 한글명 → API camelCase (수출테이블과 표기가 다른 항목)
MANUAL_KEY_BY_LABEL: dict[str, str] = {
    "신고번호": "expoSingoNo",
    "그룹식별부호": "expoKey",
    "과": "expoGwa",
    "신고년": "expoSingoYear",
    "신고체크디지트": "expoSingoDg",
    "제출년도": "expoYear",
    "제출번호": "expoJechlno",
    "체크디지트": "expoChkDg",
    "C/S구분": "expoGumsaGbn",
    "결제종류": "expoGyelje",
    "신고자 상호": "expoSingojaSangho",
    "수출대행자 통관고유부호": "expoSuchuljaBuho",
    "수출화주통관고유부호": "expoWhajuTong",
    "제조자 통관고유부호": "expoWhajuTong",
    "해외거래처코드": "expoGumaejaCode",
    "해외거래처상호": "expoGumaejaSangho",
    "제조장소": "expoJuso",
    "적재항 코드": "expoHangguCode",
    "운송형태": "expoUnsongType",
    "제조일자": "expoJejoDate",
    "LC번호": "expoLcNo",
    "총 란수": "expoLan",
    "결제통화단위": "expoGyeljeMoney",
    "장치장 일련번호": "expoJangchiCnt",
    "관세사실적": "expoTcaSiljuk",
    "중고여부": "expoOldYn",
    "간이환급구분": "expoWhanGan2",
    "산업단지부호": "expoIndustry",
    "포장단위": "expoPojangDanwi",
    "출항일": "expoLeaveDay",
    "선사항공사부호": "expoShipaircomcd",
    "선사항공사명": "expoShipaircomnm",
    "선편명": "expoShipairnm",
    "장치장부호": "expoJangchiCode",
    "선적여부": "expoLoadedYn",
    "선별결과": "expoSebuho",
    "정정차수": "expoChkDg",
    "순중량": "exlanJungGubun",
    "세번부호": "exlanHs",
    "송품장부호": "exlanJepumCode",
    "제품코드": "expumJepumCode",
    "란번호": "exlanLan",
    "란번호3": "expumLan",
    "행번호": "expumHaeng",
    "입력자": "userNM",
    "BL번호": "expoBlNo",
    "화물관리번호": "expoMrnNo",
    "수입신고번호-란번호": "exlanImpolanno",
    "결제금액_1": "expumGyeljeGum",
    "FOB원화": "exlanFobWon",
    "FOB달러": "exlanFobUsd",
    "결제fob": "exlanGyeljeFob",
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
            label = ""
            if len(row) > 2 and row[2]:
                label = str(row[2]).strip()
            elif len(row) > 1 and row[1] and not str(row[1]).upper().startswith("VARCHAR"):
                label = str(row[1]).strip()
            if not label:
                label = db_col
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
    if key.endswith("Date") or key.endswith("Dt") or key.endswith("Lan") or key.endswith("Haeng"):
        return "center"
    if key.endswith("Amt") or key.endswith("Su") or key.endswith("Tax") or "Won" in key or "Usd" in key:
        return "right"
    return None


def infer_mono(key: str) -> bool:
    return key in {
        "expoSingoNo",
        "exlanHs",
        "expumJepumCode",
        "expoBlNo",
        "expoMrnNo",
        "expoLcNo",
        "expoIvNo",
    }


def read_template_headers(xlsx: Path) -> tuple[str, list[str]]:
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    sheet = wb.sheetnames[0]
    ws = wb[sheet]
    headers = [
        str(c).strip()
        for c in next(ws.iter_rows(min_row=1, max_row=1, values_only=True))
        if c is not None and str(c).strip()
    ]
    wb.close()
    return sheet, headers


def main() -> None:
    if not GRID_XLSX.exists():
        raise FileNotFoundError(f"Template Excel not found: {GRID_XLSX}")

    if GRID_XLSX.resolve() != PROJECT_COPY.resolve():
        PROJECT_COPY.parent.mkdir(parents=True, exist_ok=True)
        PROJECT_COPY.write_bytes(GRID_XLSX.read_bytes())

    label_index = build_label_index(TABLE_XLSX)
    sheet, headers = read_template_headers(GRID_XLSX)

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
        "sheet": sheet,
        "columns": columns,
        "unresolvedLabels": unresolved,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT} ({len(columns)} columns, unresolved={len(unresolved)})")
    if unresolved:
        print("unresolved:", unresolved)


if __name__ == "__main__":
    main()
