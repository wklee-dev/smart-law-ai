# -*- coding: utf-8 -*-
"""관세율표(tariff_*) 전용 SQLite — Supabase 업로드용 + 워드 설명서."""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from docx.shared import Pt

DEFAULT_SRC = Path(r"D:/SQLiteDB/smart_law_ai.db")
DEFAULT_OUT_DIR = Path(r"D:/SQLiteDB/supabase_importV2")
DB_NAME = "tariff_schedule.db"
DOC_NAME = "관세율표_테이블설명서_V1.0.docx"

# 화면 계층·상세 API 의존 순서
TABLES = [
    "tariff_section",
    "tariff_chapter",
    "tariff_heading",
    "tariff_item",
    "tariff_item_detail",
    "tariff_item_detail_state",
    "tariff_req_condition",
    "tariff_req_strategic",
    "tariff_domestic_tax",
    "tariff_origin_marking",
]

COLUMN_HELP: dict[str, dict[str, str]] = {
    "tariff_section": {
        "year": "적용연도",
        "country_code": "국가코드 (KR, US, EU …)",
        "country_name": "국가명",
        "section_code": "부 코드",
        "section_name": "부 명칭",
        "crawled_at": "수집일시",
        "record_uuid": "레코드 UUID",
    },
    "tariff_chapter": {
        "year": "적용연도",
        "country_code": "국가코드",
        "country_name": "국가명",
        "section_code": "부 코드",
        "section_name": "부 명칭",
        "chapter_code": "류 코드 (01–97)",
        "chapter_name": "류 명칭(국문)",
        "chapter_name_en": "류 명칭(영문)",
        "crawled_at": "수집일시",
        "record_uuid": "레코드 UUID",
    },
    "tariff_heading": {
        "year": "적용연도",
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
        "year": "적용연도",
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
        "elastic_rate": "탄력세율(표시용)",
        "is_complete": "상세 수집 완료 여부",
        "crawled_at": "수집일시",
        "record_uuid": "레코드 UUID",
        "elastic_codes": "탄력세율 코드",
        "elastic_rates": "탄력세율 값",
        "simple_refund": "간이환급",
        "reduction": "감면",
        "origin": "원산지 관련",
        "refund_crawled": "환급 수집 여부",
        "unit_weight": "중량단위",
        "unit_qty": "수량단위",
        "unit_crawled": "단위 수집 여부",
    },
    "tariff_item_detail": {
        "record_uuid": "레코드 UUID",
        "year": "적용연도",
        "country_code": "국가코드",
        "country_name": "국가명",
        "hs_code": "세번",
        "rate_code": "세율 코드",
        "rate_value": "세율 값",
        "rate_name": "세율 명칭",
        "crawled_at": "수집일시",
    },
    "tariff_item_detail_state": {
        "year": "적용연도",
        "country_code": "국가코드",
        "hs_code": "세번",
        "origin_marking_crawled": "원산지표시 수집 여부",
        "domestic_tax_crawled": "내국세 수집 여부",
        "crawled_at": "수집일시",
    },
    "tariff_req_condition": {
        "record_uuid": "레코드 UUID",
        "year": "적용연도",
        "country_code": "국가코드",
        "country_name": "국가명",
        "hs_code": "세번",
        "req_type": "요건 유형",
        "req_category": "요건 분류",
        "req_content": "요건 내용",
        "crawled_at": "수집일시",
    },
    "tariff_req_strategic": {
        "record_uuid": "레코드 UUID",
        "year": "적용연도",
        "country_code": "국가코드",
        "country_name": "국가명",
        "hs_code": "세번",
        "cls_no": "분류번호",
        "item_name": "품명",
        "ctrl_name": "통제명",
        "model_spec": "모델·규격",
        "ctrl_detail": "통제 상세",
        "manufacturer": "제조사",
        "remark": "비고",
        "crawled_at": "수집일시",
    },
    "tariff_domestic_tax": {
        "record_uuid": "레코드 UUID",
        "year": "적용연도",
        "country_code": "국가코드",
        "country_name": "국가명",
        "hs_code": "세번",
        "tax_sequence": "내국세 순번",
        "tax_category": "세목",
        "tax_rate": "세율",
        "tax_code": "세코드",
        "taxable_base_price": "과세표준",
        "rural_special_tax_yn": "농특세 여부",
        "effective_period": "적용기간",
        "fields_json": "부가 필드 JSON",
        "crawled_at": "수집일시",
    },
    "tariff_origin_marking": {
        "record_uuid": "레코드 UUID",
        "year": "적용연도",
        "country_code": "국가코드",
        "country_name": "국가명",
        "hs_code": "세번",
        "target_yn": "대상 여부",
        "origin_marking_target": "원산지표시 대상",
        "appropriate_marking_method": "적정 표시방법",
        "details_json": "상세 JSON",
        "crawled_at": "수집일시",
    },
}


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def set_run_font(run, size: int = 10) -> None:
    run.font.name = "맑은 고딕"
    run.font.size = Pt(size)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")


def add_para(doc: Document, text: str, bold: bool = False, size: int = 10) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = bold
    set_run_font(run, size)


def add_heading(doc: Document, text: str, level: int = 1) -> None:
    h = doc.add_heading(text, level=level)
    for run in h.runs:
        set_run_font(run, 14 if level == 0 else 12 if level == 1 else 11)


def add_table(doc: Document, headers: list[str], rows: list[list[str]]) -> None:
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Table Grid"
    for i, h in enumerate(headers):
        cell = t.rows[0].cells[i]
        cell.text = ""
        run = cell.paragraphs[0].add_run(h)
        run.bold = True
        set_run_font(run, 9)
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            cell = t.rows[ri + 1].cells[ci]
            cell.text = ""
            run = cell.paragraphs[0].add_run(val)
            set_run_font(run, 9)


def copy_table(dst: sqlite3.Connection, name: str) -> int:
    create = dst.execute(
        "SELECT sql FROM src.sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()
    if not create or not create[0]:
        raise SystemExit(f"소스에 테이블 없음: {name}")
    dst.execute(f"DROP TABLE IF EXISTS main.{name}")
    dst.execute(create[0])
    print(f"  INSERT {name} …", flush=True)
    cur = dst.execute(f"INSERT INTO main.{name} SELECT * FROM src.{name}")
    for idx in dst.execute(
        "SELECT sql FROM src.sqlite_master "
        "WHERE type='index' AND tbl_name=? AND sql IS NOT NULL",
        (name,),
    ).fetchall():
        try:
            dst.execute(idx[0])
        except sqlite3.OperationalError:
            pass
    dst.commit()
    if cur.rowcount is not None and cur.rowcount >= 0:
        return cur.rowcount
    return int(dst.execute(f"SELECT COUNT(*) FROM main.{name}").fetchone()[0])


def build_db(src: Path, out: Path) -> dict[str, int]:
    if out.exists():
        out.unlink()
    dst = sqlite3.connect(str(out))
    dst.execute("PRAGMA journal_mode=OFF")
    dst.execute("PRAGMA synchronous=OFF")
    dst.execute("PRAGMA temp_store=MEMORY")
    dst.execute("ATTACH DATABASE ? AS src", (str(src),))
    counts: dict[str, int] = {}
    for name in TABLES:
        print(f"copy {name} …", flush=True)
        counts[name] = copy_table(dst, name)
        print(f"  → {counts[name]:,} rows", flush=True)

    # 화면 조회용 보조 인덱스
    print("indexes …", flush=True)
    dst.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_ts_country_year
          ON tariff_section(country_code, year);
        CREATE INDEX IF NOT EXISTS idx_tc_country_year_sec
          ON tariff_chapter(country_code, year, section_code);
        CREATE INDEX IF NOT EXISTS idx_th_country_year_ch
          ON tariff_heading(country_code, year, chapter_code);
        CREATE INDEX IF NOT EXISTS idx_ti_country_year_hd
          ON tariff_item(country_code, year, heading_code);
        CREATE INDEX IF NOT EXISTS idx_tid_hs
          ON tariff_item_detail(country_code, year, hs_code);
        CREATE INDEX IF NOT EXISTS idx_trc_hs
          ON tariff_req_condition(country_code, year, hs_code);
        CREATE INDEX IF NOT EXISTS idx_trs_hs
          ON tariff_req_strategic(country_code, year, hs_code);
        """
    )

    countries = dst.execute(
        "SELECT country_code, MAX(country_name), COUNT(DISTINCT year), COUNT(*) "
        "FROM tariff_section GROUP BY country_code ORDER BY country_code"
    ).fetchall()
    item_by_country = dst.execute(
        "SELECT country_code, COUNT(*) FROM tariff_item "
        "GROUP BY country_code ORDER BY COUNT(*) DESC"
    ).fetchall()

    meta = {
        "package_name": "관세율표 (tariff_*) — Supabase import",
        "package_version": "V1.0",
        "tables": ",".join(TABLES),
        "source_db": str(src),
        "ui_path": "/item-classification/tariff-schedule",
        "exported_at_utc": utc_now(),
        "row_counts": json.dumps(counts, ensure_ascii=False),
        "section_countries": json.dumps(
            [
                {
                    "country_code": a,
                    "country_name": b,
                    "year_count": c,
                    "section_rows": d,
                }
                for a, b, c, d in countries
            ],
            ensure_ascii=False,
        ),
        "item_by_country_top": json.dumps(
            [{"country_code": a, "count": c} for a, c in item_by_country[:20]],
            ensure_ascii=False,
        ),
        "hierarchy_note": "부(section) → 류(chapter) → 호(heading) → 세번(item); "
        "상세: item_detail / req_condition / req_strategic / domestic_tax / origin_marking",
        "supabase_note": "대용량(item·item_detail·req_condition). "
        "이관 순서: section→chapter→heading→item→부가테이블. "
        "복합 PK (year, country_code, …) 유지 권장.",
    }
    dst.execute("DROP TABLE IF EXISTS package_meta")
    dst.execute(
        "CREATE TABLE package_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    )
    dst.executemany(
        "INSERT INTO package_meta(key, value) VALUES (?, ?)",
        list(meta.items()),
    )
    dst.commit()
    dst.execute("DETACH DATABASE src")
    # 대용량이라 VACUUM 생략 (이미 신규 파일에 INSERT)
    dst.close()
    return counts


def build_docx(db_path: Path, doc_path: Path, counts: dict[str, int]) -> None:
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    pkg = {
        r["key"]: r["value"]
        for r in conn.execute("SELECT key, value FROM package_meta").fetchall()
    }

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "맑은 고딕"
    style.font.size = Pt(10)
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")

    add_heading(doc, "관세율표 (tariff_*) 테이블 설명서", 0)
    for line in [
        "문서 버전: V1.0",
        f"DB 파일: {db_path.name}",
        f"경로: {db_path}",
        f"원본 DB: {pkg.get('source_db', '')}",
        "용도: Supabase 업로드용 관세율표 전용 패키지 (전체 국가·연도)",
        "화면: 스마트 법령 AI · HS정보 · 관세율표 "
        "(/item-classification/tariff-schedule)",
        f"내보냄(UTC): {pkg.get('exported_at_utc', '')}",
    ]:
        add_para(doc, line)

    add_heading(doc, "1. 개요", 1)
    add_para(
        doc,
        "관세율표는 국가·연도별 부(section)·류(chapter)·호(heading)·세번(item) 계층과 "
        "세율상세·요건·내국세·원산지표시 부가 테이블로 구성됩니다. "
        "좌측 국가·연도 목록은 tariff_section 기준으로 구성되고, "
        "부·류 목록은 section/chapter, 세번·세율은 item 및 item_detail 등을 사용합니다. "
        "본 워드에는 레이아웃·건수·샘플만 수록하며, 전체 데이터는 SQLite DB에 있습니다.",
    )

    add_heading(doc, "2. 테이블 목록·건수", 1)
    roles = {
        "tariff_section": "부 목록 (국가·연도 네비)",
        "tariff_chapter": "류 목록",
        "tariff_heading": "호 목록",
        "tariff_item": "세번·기본세율",
        "tariff_item_detail": "세율상세 (rate_code별)",
        "tariff_item_detail_state": "상세 수집 상태",
        "tariff_req_condition": "요건 확인",
        "tariff_req_strategic": "전략물자 등",
        "tariff_domestic_tax": "내국세",
        "tariff_origin_marking": "원산지표시",
    }
    add_table(
        doc,
        ["테이블", "역할", "건수"],
        [
            [name, roles.get(name, ""), f"{counts[name]:,}"]
            for name in TABLES
        ]
        + [["package_meta", "패키지 메타 (이관 시 선택)", "수 건"]],
    )

    add_heading(doc, "3. 국가·연도 (tariff_section)", 1)
    country_rows = conn.execute(
        "SELECT country_code, MAX(country_name) AS nm, "
        "COUNT(DISTINCT year) AS yc, MIN(year) AS y0, MAX(year) AS y1, COUNT(*) AS c "
        "FROM tariff_section GROUP BY country_code ORDER BY country_code"
    ).fetchall()
    add_table(
        doc,
        ["country_code", "country_name", "연도수", "min year", "max year", "부 행수"],
        [
            [
                r["country_code"],
                r["nm"] or "",
                str(r["yc"]),
                str(r["y0"]),
                str(r["y1"]),
                f"{r['c']:,}",
            ]
            for r in country_rows
        ],
    )

    add_heading(doc, "4. tariff_item 국가별 건수 (상위)", 1)
    item_top = conn.execute(
        "SELECT country_code, COUNT(*) AS c FROM tariff_item "
        "GROUP BY country_code ORDER BY c DESC LIMIT 15"
    ).fetchall()
    add_table(
        doc,
        ["country_code", "건수"],
        [[r["country_code"], f"{r['c']:,}"] for r in item_top],
    )

    add_heading(doc, "5. 테이블 레이아웃", 1)
    for i, name in enumerate(TABLES, start=1):
        add_heading(doc, f"5.{i} {name}", 2)
        add_para(doc, f"건수: {counts[name]:,}")
        cols = conn.execute(f"PRAGMA table_info({name})").fetchall()
        help_map = COLUMN_HELP.get(name, {})
        rows = []
        for c in cols:
            pk = f"PK{c['pk']}" if c["pk"] else ""
            rows.append([c["name"], c["type"] or "", pk, help_map.get(c["name"], "")])
        add_table(doc, ["컬럼", "타입", "키", "설명"], rows)

    add_heading(doc, "6. 계층·화면 매핑", 1)
    for line in [
        "· 국가·연도 네비: tariff_section (country_code, year)",
        "· 부·류 목록: tariff_section ⨝ tariff_chapter "
        "(year, country_code, section_code)",
        "· 호 목록: tariff_heading (year, country_code, chapter_code)",
        "· 세번 목록: tariff_item (year, country_code, heading_code)",
        "· 품목 상세: tariff_item + tariff_item_detail + "
        "tariff_req_condition + tariff_req_strategic "
        "(+ domestic_tax / origin_marking)",
        "· 공통 키: (year, country_code) + 계층 코드 / hs_code",
    ]:
        add_para(doc, line)

    add_heading(doc, "7. Supabase(Postgres) 권장 DDL (핵심)", 1)
    add_para(
        doc,
        "create table public.tariff_section (\n"
        "  year integer not null,\n"
        "  country_code text not null,\n"
        "  country_name text,\n"
        "  section_code text not null,\n"
        "  section_name text,\n"
        "  crawled_at text,\n"
        "  record_uuid text,\n"
        "  primary key (year, country_code, section_code)\n"
        ");\n"
        "create table public.tariff_chapter (\n"
        "  year integer not null,\n"
        "  country_code text not null,\n"
        "  country_name text,\n"
        "  section_code text,\n"
        "  section_name text,\n"
        "  chapter_code text not null,\n"
        "  chapter_name text,\n"
        "  chapter_name_en text,\n"
        "  crawled_at text,\n"
        "  record_uuid text,\n"
        "  primary key (year, country_code, chapter_code)\n"
        ");\n"
        "create table public.tariff_heading (\n"
        "  year integer not null,\n"
        "  country_code text not null,\n"
        "  country_name text,\n"
        "  section_code text,\n"
        "  chapter_code text,\n"
        "  heading_code text not null,\n"
        "  heading_name text,\n"
        "  heading_name_en text,\n"
        "  crawled_at text,\n"
        "  record_uuid text,\n"
        "  primary key (year, country_code, heading_code)\n"
        ");\n"
        "create table public.tariff_item (\n"
        "  year integer not null,\n"
        "  country_code text not null,\n"
        "  country_name text,\n"
        "  section_code text,\n"
        "  chapter_code text,\n"
        "  heading_code text,\n"
        "  hs_code text not null,\n"
        "  hs_code_6 text,\n"
        "  item_name text,\n"
        "  item_name_en text,\n"
        "  basic_rate text,\n"
        "  elastic_rate text,\n"
        "  -- … 기타 컬럼은 SQLite PRAGMA / 본 DB 스키마와 동일\n"
        "  primary key (year, country_code, hs_code)\n"
        ");\n"
        "-- tariff_item_detail PK: (year, country_code, hs_code, rate_code)\n"
        "-- 부가 테이블 DDL 은 DB PRAGMA table_info 와 동일하게 생성",
        size=9,
    )

    add_heading(doc, "8. 샘플 데이터", 1)
    add_heading(doc, "8.1 tariff_section (KR 최근)", 2)
    sec = conn.execute(
        "SELECT year, country_code, section_code, "
        "substr(COALESCE(section_name,''),1,50) AS nm "
        "FROM tariff_section WHERE country_code='KR' "
        "ORDER BY year DESC, section_code LIMIT 5"
    ).fetchall()
    add_table(
        doc,
        ["year", "country_code", "section_code", "section_name(앞50자)"],
        [
            [str(r["year"]), r["country_code"], r["section_code"], r["nm"] or ""]
            for r in sec
        ],
    )

    add_heading(doc, "8.2 tariff_chapter (KR 2026)", 2)
    ch = conn.execute(
        "SELECT year, section_code, chapter_code, "
        "substr(COALESCE(chapter_name,''),1,40) AS nm "
        "FROM tariff_chapter WHERE country_code='KR' AND year=2026 "
        "ORDER BY chapter_code LIMIT 5"
    ).fetchall()
    add_table(
        doc,
        ["year", "section_code", "chapter_code", "chapter_name(앞40자)"],
        [
            [
                str(r["year"]),
                r["section_code"] or "",
                r["chapter_code"],
                r["nm"] or "",
            ]
            for r in ch
        ],
    )

    add_heading(doc, "8.3 tariff_item (KR 2026 상위)", 2)
    it = conn.execute(
        "SELECT year, hs_code, basic_rate, "
        "substr(COALESCE(item_name,''),1,40) AS nm "
        "FROM tariff_item WHERE country_code='KR' AND year=2026 "
        "ORDER BY hs_code LIMIT 5"
    ).fetchall()
    add_table(
        doc,
        ["year", "hs_code", "basic_rate", "item_name(앞40자)"],
        [
            [str(r["year"]), r["hs_code"], r["basic_rate"] or "", r["nm"] or ""]
            for r in it
        ],
    )

    add_heading(doc, "9. 업로드 안내", 1)
    total = sum(counts.values())
    for line in [
        f"· 전체 행 수 합계: {total:,} "
        f"(item {counts['tariff_item']:,} · "
        f"item_detail {counts['tariff_item_detail']:,} · "
        f"req_condition {counts['tariff_req_condition']:,} 포함).",
        "· 이관 순서: section → chapter → heading → item → "
        "item_detail / req_* / domestic_tax / origin_marking.",
        "· 복합 PK·코드 값을 그대로 유지하세요 (조인 키).",
        "· item_detail·req_condition 은 수백만 건이므로 "
        "CSV보다 pgloader / COPY / 청크 적재를 권장합니다.",
        "· package_meta 는 앱 운영에 불필요하면 이관하지 않아도 됩니다.",
        "· VACUUM 은 생략했습니다. 필요 시 이관 후 Postgres 측에서 정리하세요.",
    ]:
        add_para(doc, line)

    conn.close()
    doc_path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(doc_path))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    args = ap.parse_args()
    if not args.src.exists():
        raise SystemExit(f"소스 DB 없음: {args.src}")

    args.out_dir.mkdir(parents=True, exist_ok=True)
    db_path = args.out_dir / DB_NAME
    doc_path = args.out_dir / DOC_NAME

    print("SRC", args.src)
    print("OUT", db_path)
    counts = build_db(args.src, db_path)
    print("DOC", doc_path)
    build_docx(db_path, doc_path, counts)

    mb = db_path.stat().st_size / (1024 * 1024)
    print("DB ", db_path, f"{mb:.1f} MB", "counts", counts)
    print("DOC", doc_path, round(doc_path.stat().st_size / 1024, 1), "KB")


if __name__ == "__main__":
    main()
