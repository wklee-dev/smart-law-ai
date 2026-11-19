# -*- coding: utf-8 -*-
"""HS정보 제출용 SQLite 테이블 설명서(Word) 생성."""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt

DEFAULT_DB = Path(r"D:/Manus/HS정보_제출패키지/hs_info_submit.db")
DEFAULT_OUT = Path(r"D:/Manus/HS정보_제출패키지/HS정보_테이블설명서_V1.0.docx")

# 메뉴 → 테이블 매핑 (전달용 설명)
MENU_MAP = [
    (
        "속견표",
        "/item-classification/quick-reference",
        ["hs_quick_reference"],
        "HS 류(01–97) 약칭 그리드.",
    ),
    (
        "HS해설서",
        "/item-classification/hs-explanatory",
        ["hs_manual_meta", "hs_manual_content", "hs_manual_gnpr"],
        "WCO 등 구분·적용연도별 부/류/호 해설 및 통칙(gnpr).",
    ),
    (
        "관세율표",
        "/item-classification/tariff-schedule",
        ["tariff_section", "tariff_chapter", "tariff_heading", "tariff_item"],
        "부·류·호·세번 계층. (패키지에 포함된 경우에만)",
    ),
    (
        "품목분류 국내사례",
        "/item-classification/domestic-cases",
        ["classification_cases"],
        "위원회/협의회/품목분류사례. 이미지(case_images)는 용량상 원본 DB만 유지.",
    ),
]

COLUMN_HELP: dict[str, dict[str, str]] = {
    "hs_quick_reference": {
        "chapter_code": "HS 류 코드 2자리 (01–97)",
        "short_label": "속견표 셀에 표시되는 짧은 품목군 명칭",
        "grid_row": "그리드 행 (0,10,…,90)",
        "grid_col": "그리드 열 (0–9)",
        "note": "비고",
    },
    "hs_manual_meta": {
        "id": "PK",
        "aply_year": "적용연도",
        "manl_orgn_tpcd": "구분 코드 (예: WCO)",
        "manl_orgn_tpcd_nm": "구분명",
        "manl_ut_tpcd": "단위 코드 (부/류/호 등)",
        "manl_ut_tpcd_nm": "단위명",
        "manl_ut_sgn": "HS 분류 기호",
        "display_title": "표시 제목",
        "rgsr_dt": "등록일시",
        "created_at": "적재일시",
    },
    "hs_manual_content": {
        "id": "PK",
        "meta_id": "hs_manual_meta.id FK",
        "content_type": "본문 유형",
        "lang_code": "언어 코드",
        "content_text": "해설 본문",
        "created_at": "적재일시",
    },
    "hs_manual_gnpr": {
        "id": "PK",
        "aply_year": "적용연도",
        "gnpr_srno": "통칙 일련",
        "lang_code": "언어 코드",
        "content_text": "통칙 본문",
        "created_at": "적재일시",
    },
    "tariff_section": {
        "year": "연도",
        "country_code": "국가코드",
        "country_name": "국가명",
        "section_code": "부 코드",
        "section_name": "부 명칭",
        "crawled_at": "수집일시",
        "record_uuid": "레코드 UUID",
    },
    "tariff_chapter": {
        "year": "연도",
        "country_code": "국가코드",
        "country_name": "국가명",
        "section_code": "부 코드",
        "section_name": "부 명칭",
        "chapter_code": "류 코드",
        "chapter_name": "류 명칭(국문)",
        "chapter_name_en": "류 명칭(영문)",
        "crawled_at": "수집일시",
        "record_uuid": "레코드 UUID",
    },
    "tariff_heading": {
        "year": "연도",
        "country_code": "국가코드",
        "country_name": "국가명",
        "section_code": "부 코드",
        "chapter_code": "류 코드",
        "heading_code": "호 코드(4자리)",
        "heading_name": "호 명칭(국문)",
        "heading_name_en": "호 명칭(영문)",
        "crawled_at": "수집일시",
        "record_uuid": "레코드 UUID",
    },
    "tariff_item": {
        "year": "연도",
        "country_code": "국가코드",
        "country_name": "국가명",
        "section_code": "부 코드",
        "chapter_code": "류 코드",
        "heading_code": "호 코드",
        "hs_code": "세번(HSK)",
        "hs_code_6": "6단위 HS",
        "item_name": "품명(국문)",
        "item_name_en": "품명(영문)",
        "basic_rate": "기본세율",
        "elastic_rate": "탄력세율",
        "record_uuid": "레코드 UUID",
    },
    "classification_cases": {
        "id": "PK",
        "committee_type": "A 위원회 / B 협의회 / C 품목분류사례",
        "committee_name": "위원회 한글명",
        "rrdc_no": "검토서번호",
        "reff_no": "참조번호",
        "enfr_dt": "시행일자",
        "cstm_nm": "시행기관",
        "dtrm_hs_sgn": "결정세번",
        "cmdt_nm": "품명",
        "cmdt_desc": "물품설명",
        "dtrm_rsn_cn": "결정사유",
        "imge_cnt": "이미지 건수(원본 DB 기준)",
        "detail_html": "상세 HTML",
        "crawled_at": "수집일시",
    },
    "package_meta": {
        "key": "메타 키",
        "value": "메타 값",
    },
}


def set_run_font(run, name: str = "맑은 고딕", size: int = 10) -> None:
    run.font.name = name
    run.font.size = Pt(size)
    r = run._element
    r.rPr.rFonts.set(qn("w:eastAsia"), name)


def add_heading(doc: Document, text: str, level: int = 1) -> None:
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        set_run_font(run, size=14 if level == 0 else 12 if level == 1 else 11)


def add_para(doc: Document, text: str, bold: bool = False) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = bold
    set_run_font(run)


def add_table(doc: Document, headers: list[str], rows: list[list[str]]) -> None:
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Table Grid"
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = ""
        run = cell.paragraphs[0].add_run(h)
        run.bold = True
        set_run_font(run, size=9)
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = t.rows[ri + 1].cells[ci]
            cell.text = ""
            run = cell.paragraphs[0].add_run(val)
            set_run_font(run, size=9)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    if not args.db.exists():
        raise SystemExit(f"DB 없음: {args.db} (먼저 export-hs-info-submit-db.py 실행)")

    conn = sqlite3.connect(str(args.db))
    conn.row_factory = sqlite3.Row
    meta = {
        r["key"]: r["value"]
        for r in conn.execute("SELECT key, value FROM package_meta").fetchall()
    }
    tables = [
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "맑은 고딕"
    style.font.size = Pt(10)
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")

    add_heading(doc, "HS정보 제출용 SQLite 테이블 설명서", 0)
    add_para(doc, f"문서 버전: {meta.get('package_version', 'V1.0')}")
    add_para(doc, f"패키지: {meta.get('package_name', '')}")
    add_para(doc, f"DB 파일: {args.db.name}")
    add_para(doc, f"원본 DB: {meta.get('source_db', '')}")
    add_para(doc, f"내보냄(UTC): {meta.get('exported_at_utc', '')}")
    add_para(
        doc,
        f"대상 화면: {meta.get('ui_menus', '속견표 · HS해설서 · 품목분류 국내사례')} "
        "(스마트 법령 AI 관리자 메뉴 HS정보)",
    )

    add_heading(doc, "1. 개요", 1)
    add_para(
        doc,
        "본 DB는 smart_law_ai.db 에서 HS정보 관련 핵심 테이블을 분리한 제출용 패키지입니다. "
        "다른 시스템에 이관하거나 검수용으로 전달할 때 사용합니다.",
    )

    add_heading(doc, "2. 메뉴 ↔ 테이블 매핑", 1)
    present = set(tables)
    map_rows = []
    for menu, path, tbls, note in MENU_MAP:
        if not any(t in present for t in tbls):
            continue
        map_rows.append([menu, path, ", ".join(tbls), note])
    add_table(doc, ["메뉴", "경로", "테이블", "설명"], map_rows)

    add_heading(doc, "3. 포함·제외 범위", 1)
    add_para(doc, f"관세율표 세번 필터: {meta.get('tariff_item_filter', '')}")
    try:
        excluded = json.loads(meta.get("excluded", "[]"))
    except json.JSONDecodeError:
        excluded = [meta.get("excluded", "")]
    for e in excluded:
        add_para(doc, f"· 제외: {e}")
    try:
        counts = json.loads(meta.get("row_counts", "{}"))
    except json.JSONDecodeError:
        counts = {}
    if counts:
        add_heading(doc, "4. 테이블별 건수", 1)
        add_table(
            doc,
            ["테이블", "건수"],
            [[k, f"{v:,}"] for k, v in sorted(counts.items())],
        )

    add_heading(doc, "5. 테이블 레이아웃", 1)
    for name in tables:
        if name == "package_meta":
            continue
        add_heading(doc, f"5.{tables.index(name)+1} {name}", 2)
        cols = conn.execute(f"PRAGMA table_info({name})").fetchall()
        n = conn.execute(f"SELECT COUNT(*) AS c FROM {name}").fetchone()["c"]
        add_para(doc, f"건수: {n:,}")
        help_map = COLUMN_HELP.get(name, {})
        rows = []
        for c in cols:
            cname = c["name"]
            ctype = c["type"] or ""
            pk = "PK" if c["pk"] else ""
            desc = help_map.get(cname, "")
            rows.append([cname, ctype, pk, desc])
        add_table(doc, ["컬럼", "타입", "키", "설명"], rows)

    add_heading(doc, "6. package_meta", 1)
    add_para(doc, "패키지 식별·내보냄 정보.")
    meta_rows = [[k, v[:200]] for k, v in meta.items()]
    add_table(doc, ["key", "value"], meta_rows)

    add_heading(doc, "7. 이용 시 참고", 1)
    add_para(
        doc,
        "· 속견표 화면의 국가·연도 콤보는 관세율표(tariff_*) 메타를 사용하며, "
        "셀 라벨은 hs_quick_reference.short_label 입니다.",
    )
    add_para(
        doc,
        "· HS해설서 상세는 hs_manual_meta.id 로 hs_manual_content / hs_manual_gnpr 를 조인합니다.",
    )
    add_para(
        doc,
        "· 관세율표는 year + country_code + section/chapter/heading/hs_code 계층으로 조회합니다.",
    )
    add_para(
        doc,
        "· 국내사례 이미지가 필요하면 원본 smart_law_ai.db 의 case_images 를 사용하세요.",
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(args.out))
    conn.close()
    print("OK", args.out)


if __name__ == "__main__":
    main()
