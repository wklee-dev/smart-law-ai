"""Export data/api-management-list.json to Excel."""
import json
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Font

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data" / "api-management-list.json"
OUT_PATH = ROOT / "data" / "api-management-list.xlsx"

HEADERS = [
    "구분",
    "분류",
    "정렬순서",
    "제공API명",
    "법령약칭명",
    "법령ID",
    "파일타입",
    "최종수신일",
    "조항호목최종수신",
    "행정규칙본문최종수신",
]


def main() -> None:
    items = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "API관리"

    header_font = Font(bold=True)
    for col, title in enumerate(HEADERS, start=1):
        cell = ws.cell(row=1, column=col, value=title)
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for row_idx, item in enumerate(items, start=2):
        ws.cell(row=row_idx, column=1, value=item.get("division", ""))
        ws.cell(row=row_idx, column=2, value=item.get("category", ""))
        ws.cell(row=row_idx, column=3, value=item.get("uploadOrder", ""))
        ws.cell(row=row_idx, column=4, value=item.get("apiName", ""))
        ws.cell(row=row_idx, column=5, value=item.get("lawShortName", ""))
        law_id = item.get("lawId", "")
        ws.cell(row=row_idx, column=6, value=law_id)
        ws.cell(row=row_idx, column=7, value=item.get("fileType", ""))
        ws.cell(row=row_idx, column=8, value=item.get("updatedAt", ""))
        ws.cell(row=row_idx, column=9, value=item.get("lastReceivedEflawJosub", ""))
        ws.cell(row=row_idx, column=10, value=item.get("lastReceivedAdmrulBody", ""))

    ws.column_dimensions["A"].width = 10
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions["C"].width = 8
    ws.column_dimensions["D"].width = 52
    ws.column_dimensions["E"].width = 16
    ws.column_dimensions["F"].width = 10
    ws.column_dimensions["G"].width = 8
    ws.column_dimensions["H"].width = 18
    ws.column_dimensions["I"].width = 18
    ws.column_dimensions["J"].width = 18

    wb.save(OUT_PATH)
    print(f"exported {len(items)} rows -> {OUT_PATH}")


if __name__ == "__main__":
    main()
