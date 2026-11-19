"""
샘플 입력 엑셀 파일 생성 스크립트
실행하면 customs_ids.xlsx 파일이 생성됩니다.
"""
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
import os

def create_sample_excel():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "통관고유부호"

    # 헤더 스타일
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=11)
    center_align = Alignment(horizontal="center", vertical="center")
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )

    headers = ["No", "회사명", "통관고유부호", "사용여부", "비고"]
    col_widths = [6, 25, 20, 10, 30]

    for col_idx, (header, width) in enumerate(zip(headers, col_widths), start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align
        cell.border = thin_border
        ws.column_dimensions[chr(64 + col_idx)].width = width

    # 샘플 데이터
    sample_data = [
        (1, "한국쓰리엠(주)", "한국쓰리엠1771019", "Y", ""),
        (2, "(주)샘플회사", "샘플회사1234567", "Y", ""),
        (3, "테스트무역(주)", "테스트무역9876543", "N", "미사용"),
    ]

    data_fill_y = PatternFill(start_color="EBF3FB", end_color="EBF3FB", fill_type="solid")
    data_fill_n = PatternFill(start_color="F2F2F2", end_color="F2F2F2", fill_type="solid")

    for row_idx, row_data in enumerate(sample_data, start=2):
        fill = data_fill_y if row_data[3] == "Y" else data_fill_n
        for col_idx, value in enumerate(row_data, start=1):
            cell = ws.cell(row=row_idx, column=col_idx, value=value)
            cell.fill = fill
            cell.alignment = center_align if col_idx in [1, 4] else Alignment(vertical="center")
            cell.border = thin_border

    ws.row_dimensions[1].height = 22
    ws.freeze_panes = "A2"

    output_path = os.path.join(os.path.dirname(__file__), "customs_ids.xlsx")
    wb.save(output_path)
    print(f"샘플 엑셀 파일 생성 완료: {output_path}")
    return output_path

if __name__ == "__main__":
    create_sample_excel()
