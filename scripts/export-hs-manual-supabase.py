# -*- coding: utf-8 -*-
"""HS해설서(hs_manual_*) 전용 SQLite — Supabase 업로드용 + 워드 설명서."""

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
DB_NAME = "hs_manual.db"
DOC_NAME = "HS해설서_테이블설명서_V1.0.docx"

TABLES = ["hs_manual_meta", "hs_manual_content", "hs_manual_gnpr"]

COLUMN_HELP: dict[str, dict[str, str]] = {
    "hs_manual_meta": {
        "id": "PK (AUTOINCREMENT)",
        "aply_year": "적용연도 (예: 2022)",
        "manl_orgn_tpcd": "구분 코드 (예: WCO)",
        "manl_orgn_tpcd_nm": "구분명 (화면 구분 필터)",
        "manl_ut_tpcd": "단위 코드 (부/류/호 등)",
        "manl_ut_tpcd_nm": "단위명 (화면 단위1 컬럼)",
        "manl_ut_sgn": "HS 분류 기호 (화면 HS분류)",
        "display_title": "표시 제목·내용 요약",
        "rgsr_dt": "등록일시",
        "created_at": "적재일시",
    },
    "hs_manual_content": {
        "id": "PK (AUTOINCREMENT)",
        "meta_id": "hs_manual_meta.id FK",
        "content_type": "본문 유형 (부해설/류해설/호해설 등)",
        "lang_code": "언어 코드 (KO/EN 등)",
        "content_text": "해설 본문",
        "created_at": "적재일시",
    },
    "hs_manual_gnpr": {
        "id": "PK (AUTOINCREMENT)",
        "aply_year": "적용연도",
        "gnpr_srno": "통칙 일련번호",
        "lang_code": "언어 코드",
        "content_text": "통칙 본문",
        "created_at": "적재일시",
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
    if cur.rowcount is not None and cur.rowcount >= 0:
        return cur.rowcount
    return int(dst.execute(f"SELECT COUNT(*) FROM main.{name}").fetchone()[0])


def build_db(src: Path, out: Path) -> dict[str, int]:
    if out.exists():
        out.unlink()
    dst = sqlite3.connect(str(out))
    dst.execute("PRAGMA journal_mode=OFF")
    dst.execute("PRAGMA synchronous=OFF")
    dst.execute("ATTACH DATABASE ? AS src", (str(src),))
    counts: dict[str, int] = {}
    for name in TABLES:
        print(f"copy {name} …")
        counts[name] = copy_table(dst, name)

    year_rows = dst.execute(
        "SELECT manl_orgn_tpcd_nm, aply_year, COUNT(*) "
        "FROM hs_manual_meta GROUP BY 1,2 ORDER BY 1,2"
    ).fetchall()
    meta = {
        "package_name": "HS해설서 (hs_manual_*) — Supabase import",
        "package_version": "V1.0",
        "tables": ",".join(TABLES),
        "source_db": str(src),
        "ui_path": "/item-classification/hs-explanatory",
        "exported_at_utc": utc_now(),
        "row_counts": json.dumps(counts, ensure_ascii=False),
        "meta_by_division_year": json.dumps(
            [{"division": a, "year": y, "count": c} for a, y, c in year_rows],
            ensure_ascii=False,
        ),
        "join_note": "상세: hs_manual_meta.id = hs_manual_content.meta_id; "
        "통칙: hs_manual_gnpr.aply_year = hs_manual_meta.aply_year",
        "supabase_note": "Postgres 이관 시 id bigint PK, meta_id FK, "
        "content_text text, UNIQUE(aply_year, manl_ut_tpcd, manl_ut_sgn) 유지 권장",
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
    dst.execute("VACUUM")
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

    add_heading(doc, "HS해설서 (hs_manual_*) 테이블 설명서", 0)
    for line in [
        "문서 버전: V1.0",
        f"DB 파일: {db_path.name}",
        f"경로: {db_path}",
        f"원본 DB: {pkg.get('source_db', '')}",
        "용도: Supabase 업로드용 HS해설서 전용 패키지",
        "화면: 스마트 법령 AI · HS정보 · HS해설서 (/item-classification/hs-explanatory)",
        f"내보냄(UTC): {pkg.get('exported_at_utc', '')}",
    ]:
        add_para(doc, line)

    add_heading(doc, "1. 개요", 1)
    add_para(
        doc,
        "HS해설서는 WCO 등 구분·적용연도별 부/류/호 해설 메타(hs_manual_meta), "
        "본문(hs_manual_content), 통칙(hs_manual_gnpr)으로 구성됩니다. "
        "목록은 meta를, 상세 탭(통칙·부해설·류해설·호해설)은 content/gnpr를 사용합니다. "
        "본 워드에는 레이아웃·건수·샘플만 수록하며, 전체 본문은 SQLite DB에 있습니다.",
    )

    add_heading(doc, "2. 테이블 목록", 1)
    add_table(
        doc,
        ["테이블", "역할", "건수"],
        [
            ["hs_manual_meta", "목록·메타 (구분/연도/단위/HS분류)", f"{counts['hs_manual_meta']:,}"],
            ["hs_manual_content", "부·류·호 해설 본문", f"{counts['hs_manual_content']:,}"],
            ["hs_manual_gnpr", "통칙 본문", f"{counts['hs_manual_gnpr']:,}"],
            ["package_meta", "패키지 메타 (이관 시 선택)", "수 건"],
        ],
    )

    add_heading(doc, "3. 구분·적용연도별 meta 건수", 1)
    year_rows = conn.execute(
        "SELECT manl_orgn_tpcd_nm, aply_year, COUNT(*) AS c "
        "FROM hs_manual_meta GROUP BY 1,2 ORDER BY 1,2"
    ).fetchall()
    add_table(
        doc,
        ["구분", "적용연도", "건수"],
        [[r["manl_orgn_tpcd_nm"] or "", r["aply_year"], f"{r['c']:,}"] for r in year_rows],
    )

    add_heading(doc, "4. 테이블 레이아웃", 1)
    for name in TABLES:
        add_heading(doc, f"4.{TABLES.index(name) + 1} {name}", 2)
        add_para(doc, f"건수: {counts[name]:,}")
        cols = conn.execute(f"PRAGMA table_info({name})").fetchall()
        help_map = COLUMN_HELP.get(name, {})
        rows = []
        for c in cols:
            pk = "PK" if c["pk"] else ""
            rows.append([c["name"], c["type"] or "", pk, help_map.get(c["name"], "")])
        add_table(doc, ["컬럼", "타입", "키", "설명"], rows)

    add_heading(doc, "5. 조인·화면 매핑", 1)
    for line in [
        "· 목록: hs_manual_meta (구분=manl_orgn_tpcd_nm, 연도=aply_year, "
        "단위=manl_ut_tpcd_nm, HS분류=manl_ut_sgn, 내용=display_title)",
        "· 상세 본문: hs_manual_content.meta_id = hs_manual_meta.id",
        "· 통칙: hs_manual_gnpr WHERE aply_year = 선택 메타의 aply_year",
        "· UNIQUE(meta): (aply_year, manl_ut_tpcd, manl_ut_sgn)",
        "· UNIQUE(content): (meta_id, content_type, lang_code)",
        "· UNIQUE(gnpr): (aply_year, gnpr_srno, lang_code)",
    ]:
        add_para(doc, line)

    add_heading(doc, "6. Supabase(Postgres) 권장 DDL", 1)
    add_para(
        doc,
        "create table public.hs_manual_meta (\n"
        "  id bigint generated by default as identity primary key,\n"
        "  aply_year text not null,\n"
        "  manl_orgn_tpcd text,\n"
        "  manl_orgn_tpcd_nm text,\n"
        "  manl_ut_tpcd text not null,\n"
        "  manl_ut_tpcd_nm text,\n"
        "  manl_ut_sgn text not null,\n"
        "  display_title text,\n"
        "  rgsr_dt text,\n"
        "  created_at timestamptz default now(),\n"
        "  unique (aply_year, manl_ut_tpcd, manl_ut_sgn)\n"
        ");\n"
        "create index idx_meta_year on public.hs_manual_meta (aply_year);\n"
        "create index idx_meta_tpcd on public.hs_manual_meta (manl_ut_tpcd);\n"
        "create index idx_meta_sgn on public.hs_manual_meta (manl_ut_sgn);\n\n"
        "create table public.hs_manual_content (\n"
        "  id bigint generated by default as identity primary key,\n"
        "  meta_id bigint not null references public.hs_manual_meta(id),\n"
        "  content_type text not null,\n"
        "  lang_code text not null,\n"
        "  content_text text,\n"
        "  created_at timestamptz default now(),\n"
        "  unique (meta_id, content_type, lang_code)\n"
        ");\n"
        "create index idx_content_meta on public.hs_manual_content (meta_id);\n\n"
        "create table public.hs_manual_gnpr (\n"
        "  id bigint generated by default as identity primary key,\n"
        "  aply_year text not null,\n"
        "  gnpr_srno text not null,\n"
        "  lang_code text not null,\n"
        "  content_text text,\n"
        "  created_at timestamptz default now(),\n"
        "  unique (aply_year, gnpr_srno, lang_code)\n"
        ");\n"
        "create index idx_gnpr_year on public.hs_manual_gnpr (aply_year);",
        size=9,
    )

    add_heading(doc, "7. 샘플 데이터 (각 테이블 상위 5건)", 1)
    # meta sample
    add_heading(doc, "7.1 hs_manual_meta", 2)
    meta_sample = conn.execute(
        "SELECT id, aply_year, manl_orgn_tpcd_nm, manl_ut_tpcd_nm, manl_ut_sgn, "
        "substr(COALESCE(display_title,''),1,80) AS title "
        "FROM hs_manual_meta ORDER BY id LIMIT 5"
    ).fetchall()
    add_table(
        doc,
        ["id", "aply_year", "구분", "단위", "HS분류", "display_title(앞80자)"],
        [
            [
                str(r["id"]),
                r["aply_year"] or "",
                r["manl_orgn_tpcd_nm"] or "",
                r["manl_ut_tpcd_nm"] or "",
                r["manl_ut_sgn"] or "",
                r["title"] or "",
            ]
            for r in meta_sample
        ],
    )

    add_heading(doc, "7.2 hs_manual_content", 2)
    content_sample = conn.execute(
        "SELECT id, meta_id, content_type, lang_code, "
        "substr(COALESCE(content_text,''),1,60) AS preview "
        "FROM hs_manual_content ORDER BY id LIMIT 5"
    ).fetchall()
    add_table(
        doc,
        ["id", "meta_id", "content_type", "lang_code", "content_text(앞60자)"],
        [
            [
                str(r["id"]),
                str(r["meta_id"]),
                r["content_type"] or "",
                r["lang_code"] or "",
                r["preview"] or "",
            ]
            for r in content_sample
        ],
    )

    add_heading(doc, "7.3 hs_manual_gnpr", 2)
    gnpr_sample = conn.execute(
        "SELECT id, aply_year, gnpr_srno, lang_code, "
        "substr(COALESCE(content_text,''),1,60) AS preview "
        "FROM hs_manual_gnpr ORDER BY id LIMIT 5"
    ).fetchall()
    add_table(
        doc,
        ["id", "aply_year", "gnpr_srno", "lang_code", "content_text(앞60자)"],
        [
            [
                str(r["id"]),
                r["aply_year"] or "",
                r["gnpr_srno"] or "",
                r["lang_code"] or "",
                r["preview"] or "",
            ]
            for r in gnpr_sample
        ],
    )

    add_heading(doc, "8. 업로드 안내", 1)
    for line in [
        "· 전체 데이터는 DB 파일(hs_manual.db)에 포함되어 있습니다 "
        f"(meta {counts['hs_manual_meta']:,} · content {counts['hs_manual_content']:,} · "
        f"gnpr {counts['hs_manual_gnpr']:,}).",
        "· content_text 용량이 크므로 CSV보다 SQLite→Postgres 도구 또는 청크 적재를 권장합니다.",
        "· 이관 순서: hs_manual_meta → hs_manual_content → hs_manual_gnpr "
        "(content.meta_id FK 때문).",
        "· package_meta 는 앱 운영에 불필요하면 이관하지 않아도 됩니다.",
        "· id 값을 유지해 이관하면 meta_id 조인이 그대로 동작합니다.",
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
