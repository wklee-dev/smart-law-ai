# -*- coding: utf-8 -*-
"""속견표(hs_quick_reference) 전용 SQLite — Supabase 업로드용 + 워드 설명서."""

from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.shared import Pt

# export-hs-info-submit-db.py 와 동일 (Uni-PASS 속견표 류 약칭)
HS_CHAPTER_SHORT_LABELS: dict[str, str] = {
    "01": "산동물",
    "02": "육과식용설육",
    "03": "어패류",
    "04": "낙농품·조란·천연",
    "05": "기타 동물성 생산품",
    "06": "산수목·꽃",
    "07": "채소",
    "08": "과실·견과류",
    "09": "커피·향신료",
    "10": "곡물",
    "11": "밀가루·전분",
    "12": "채유용종자·인삼",
    "13": "식물성엑스",
    "14": "기타식물성 생산품",
    "15": "동식물성유지",
    "16": "육·어류 조제품",
    "17": "당류 설탕과자",
    "18": "코코아초코렛",
    "19": "곡물·곡분의 주제품과빵류",
    "20": "채소·과실의 조제품",
    "21": "기타의 조제식료품",
    "22": "음료·주류·식초",
    "23": "조제사료",
    "24": "담배",
    "25": "토석류·소금",
    "26": "광·슬랙·회",
    "27": "광물성 연료 에너지",
    "28": "무기화합물",
    "29": "유기화합물",
    "30": "의료용품",
    "31": "비료",
    "32": "염료·안료, 페인트·잉크",
    "33": "향료 화장품",
    "34": "비누, 계면활성제, 왁스",
    "35": "카세인 알부민 변성전분 효소",
    "36": "화약류·성냥",
    "37": "필름인화지 사진용재료",
    "38": "각종 화학공업 생산품",
    "39": "플라스틱과 그 제품",
    "40": "고무와 그 제품",
    "41": "원피가죽",
    "42": "가죽제품",
    "43": "모피·모피제품",
    "44": "목재·목탄",
    "45": "코르크와 그 제품",
    "46": "조물재료의 제품",
    "47": "펄프",
    "48": "지와 판지",
    "49": "서적·신문 인쇄물",
    "50": "견·견사 견직물",
    "51": "양모·수모",
    "52": "면·면사 면직물",
    "53": "마류의사와직물",
    "54": "인조 필라멘트 섬유",
    "55": "인조스테이플 섬유",
    "56": "워딩부직포",
    "57": "양탄자",
    "58": "특수·직물",
    "59": "침투 도포한 직물",
    "60": "편물",
    "61": "의류(편물제)",
    "62": "의류(편물제외)",
    "63": "기타 섬유제품,넝마",
    "64": "신발류",
    "65": "모자류",
    "66": "우산·지팡이",
    "67": "조제 우모 인조제품",
    "68": "석·시멘트 석면제품",
    "69": "도자 제품",
    "70": "유리",
    "71": "귀석·반귀석,귀금속",
    "72": "철강",
    "73": "철강제품",
    "74": "동과그제품",
    "75": "니켈과 그 제품",
    "76": "알루미늄과 그 제품",
    "77": "(유보)",
    "78": "연과 그 제품",
    "79": "아연과 그 제품",
    "80": "주석과 그 제품",
    "81": "기타의 비금속",
    "82": "비금속제공구·스푼·포크",
    "83": "각종 비금속 제품",
    "84": "보일러 기계류",
    "85": "전기기기 TV·VTR",
    "86": "철도차량",
    "87": "일반차량",
    "88": "항공기",
    "89": "선박",
    "90": "광학/의료 측정·검사",
    "91": "시계",
    "92": "악기",
    "93": "무기",
    "94": "가구류 조명기구",
    "95": "완구·운동용품",
    "96": "잡품",
    "97": "예술품 골동품",
}

DEFAULT_OUT_DIR = Path(r"D:/SQLiteDB/supabase_importV2")
DB_NAME = "hs_quick_reference.db"
DOC_NAME = "속견표_테이블설명서_V1.0.docx"


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def set_run_font(run, size: int = 10) -> None:
    run.font.name = "맑은 고딕"
    run.font.size = Pt(size)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")


def build_db(path: Path) -> int:
    if path.exists():
        path.unlink()
    conn = sqlite3.connect(str(path))
    conn.executescript(
        """
        CREATE TABLE hs_quick_reference (
          chapter_code TEXT PRIMARY KEY,
          short_label TEXT NOT NULL,
          grid_row INTEGER NOT NULL,
          grid_col INTEGER NOT NULL,
          note TEXT
        );
        CREATE INDEX idx_hs_qr_grid ON hs_quick_reference(grid_row, grid_col);

        CREATE TABLE package_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        """
    )
    rows = []
    for code, label in HS_CHAPTER_SHORT_LABELS.items():
        n = int(code)
        rows.append(
            (
                code,
                label,
                (n // 10) * 10,
                n % 10,
                "Uni-PASS 속견표 류 약칭",
            )
        )
    conn.executemany(
        """
        INSERT INTO hs_quick_reference
          (chapter_code, short_label, grid_row, grid_col, note)
        VALUES (?,?,?,?,?)
        """,
        rows,
    )
    meta = {
        "package_name": "속견표 (hs_quick_reference) — Supabase import",
        "package_version": "V1.0",
        "table": "hs_quick_reference",
        "row_count": str(len(rows)),
        "ui_path": "/item-classification/quick-reference",
        "exported_at_utc": utc_now(),
        "supabase_note": "Postgres 이관 시 chapter_code text PK, short_label text, grid_row/grid_col int4 권장",
    }
    conn.executemany(
        "INSERT INTO package_meta(key, value) VALUES (?, ?)",
        list(meta.items()),
    )
    conn.commit()
    conn.close()
    return len(rows)


def build_docx(db_path: Path, doc_path: Path, row_count: int) -> None:
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "맑은 고딕"
    style.font.size = Pt(10)
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")

    h0 = doc.add_heading("속견표 (hs_quick_reference) 테이블 설명서", level=0)
    for r in h0.runs:
        set_run_font(r, 14)

    for line in [
        "문서 버전: V1.0",
        f"DB 파일: {db_path.name}",
        f"경로: {db_path}",
        "용도: Supabase 업로드용 속견표 전용 패키지",
        "화면: 스마트 법령 AI · HS정보 · 속견표 (/item-classification/quick-reference)",
        f"데이터 건수: {row_count}건 (HS 류 01–97)",
    ]:
        p = doc.add_paragraph()
        run = p.add_run(line)
        set_run_font(run)

    doc.add_heading("1. 개요", level=1)
    p = doc.add_paragraph()
    run = p.add_run(
        "속견표는 HS 류(chapter) 01–97의 짧은 품목군 명칭을 10×10 그리드로 보여 주는 "
        "참조 테이블입니다. Uni-PASS 속견표와 동일한 약칭을 사용합니다. "
        "셀 클릭 시 관세율표 해당 류로 이동하는 UI와 연동됩니다."
    )
    set_run_font(run)

    doc.add_heading("2. 테이블 목록", level=1)
    t = doc.add_table(rows=3, cols=3)
    t.style = "Table Grid"
    headers = ["테이블", "역할", "건수"]
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = ""
        run = cell.paragraphs[0].add_run(h)
        run.bold = True
        set_run_font(run, 9)
    body = [
        ["hs_quick_reference", "속견표 본문 (Supabase 이관 대상)", str(row_count)],
        ["package_meta", "패키지 메타 (이관 시 선택)", "수 건"],
    ]
    for ri, row in enumerate(body):
        for ci, val in enumerate(row):
            cell = t.rows[ri + 1].cells[ci]
            cell.text = ""
            run = cell.paragraphs[0].add_run(val)
            set_run_font(run, 9)

    doc.add_heading("3. hs_quick_reference 레이아웃", level=1)
    t2 = doc.add_table(rows=6, cols=4)
    t2.style = "Table Grid"
    col_headers = ["컬럼", "타입", "키", "설명"]
    for i, h in enumerate(col_headers):
        cell = t2.rows[0].cells[i]
        cell.text = ""
        run = cell.paragraphs[0].add_run(h)
        run.bold = True
        set_run_font(run, 9)
    cols = [
        ["chapter_code", "TEXT", "PK", "HS 류 코드 2자리 (01–97)"],
        ["short_label", "TEXT", "NOT NULL", "그리드 셀에 표시되는 짧은 명칭"],
        ["grid_row", "INTEGER", "", "그리드 행 (0, 10, …, 90)"],
        ["grid_col", "INTEGER", "", "그리드 열 (0–9). 류번호 = grid_row + grid_col"],
        ["note", "TEXT", "", "비고 (출처 등)"],
    ]
    for ri, row in enumerate(cols):
        for ci, val in enumerate(row):
            cell = t2.rows[ri + 1].cells[ci]
            cell.text = ""
            run = cell.paragraphs[0].add_run(val)
            set_run_font(run, 9)

    doc.add_heading("4. Supabase(Postgres) 권장 DDL", level=1)
    p = doc.add_paragraph()
    run = p.add_run(
        "create table public.hs_quick_reference (\n"
        "  chapter_code text primary key,\n"
        "  short_label text not null,\n"
        "  grid_row integer not null,\n"
        "  grid_col integer not null,\n"
        "  note text\n"
        ");\n"
        "create index idx_hs_qr_grid on public.hs_quick_reference (grid_row, grid_col);"
    )
    set_run_font(run, 9)

    doc.add_heading("5. 전체 데이터 (HS 류 01–97)", level=1)
    conn = sqlite3.connect(str(db_path))
    all_rows = conn.execute(
        "SELECT chapter_code, short_label, grid_row, grid_col, note "
        "FROM hs_quick_reference ORDER BY chapter_code"
    ).fetchall()
    conn.close()
    t3 = doc.add_table(rows=1 + len(all_rows), cols=5)
    t3.style = "Table Grid"
    for i, h in enumerate(
        ["chapter_code", "short_label", "grid_row", "grid_col", "note"]
    ):
        cell = t3.rows[0].cells[i]
        cell.text = ""
        run = cell.paragraphs[0].add_run(h)
        run.bold = True
        set_run_font(run, 9)
    for ri, row in enumerate(all_rows):
        for ci, val in enumerate(row):
            cell = t3.rows[ri + 1].cells[ci]
            cell.text = ""
            run = cell.paragraphs[0].add_run(str(val) if val is not None else "")
            set_run_font(run, 9)

    doc.add_heading("6. 업로드 안내", level=1)
    for line in [
        "· SQLite → CSV/JSON 추출 후 Supabase Table Editor 또는 supabase db 로 이관",
        "· package_meta 는 앱 운영에 불필요하면 이관하지 않아도 됩니다",
        "· chapter_code 는 항상 2자리 문자열로 유지 (예: '01', 숫자 1 아님)",
    ]:
        p = doc.add_paragraph()
        run = p.add_run(line)
        set_run_font(run)

    doc_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(doc_path))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)
    db_path = args.out_dir / DB_NAME
    doc_path = args.out_dir / DOC_NAME
    n = build_db(db_path)
    build_docx(db_path, doc_path, n)
    print("DB ", db_path, round(db_path.stat().st_size / 1024, 1), "KB", "rows", n)
    print("DOC", doc_path, round(doc_path.stat().st_size / 1024, 1), "KB")


if __name__ == "__main__":
    main()
