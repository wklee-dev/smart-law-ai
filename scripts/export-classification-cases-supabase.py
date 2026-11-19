# -*- coding: utf-8 -*-
"""품목분류 국내사례(classification_cases + case_images) — Supabase 업로드용 + 워드 설명서."""

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
DB_NAME = "classification_cases.db"
DOC_NAME = "품목분류국내사례_테이블설명서_V1.0.docx"

TABLES = ["classification_cases", "case_images"]

COLUMN_HELP: dict[str, dict[str, str]] = {
    "classification_cases": {
        "id": "PK (AUTOINCREMENT)",
        "committee_type": "탭 구분: A 위원회 / B 협의회 / C 품목분류사례",
        "committee_name": "위원회 한글명",
        "rrdc_no": "결정서(검토서)번호",
        "reff_no": "참조번호",
        "enfr_dt": "시행일자 (YYYY-MM-DD)",
        "cstm_nm": "시행기관",
        "dtrm_hs_sgn": "결정세번",
        "cmdt_nm": "품명",
        "cmdt_desc": "물품설명",
        "dtrm_rsn_cn": "결정사유",
        "imge_cnt": "이미지 건수",
        "attch_lst": "첨부파일 ID 목록",
        "prlst_clsf_case_tpcd": "품목분류사례 유형코드",
        "oppb_yn": "공개여부",
        "raw_json": "원본 JSON",
        "detail_html": "상세 HTML",
        "crawled_at": "수집일시",
    },
    "case_images": {
        "id": "PK (AUTOINCREMENT)",
        "case_id": "classification_cases.id FK",
        "attch_file_id": "첨부파일 ID",
        "image_seq": "이미지 순서 (1부터)",
        "image_data": "이미지 바이너리 (BLOB → Postgres bytea 또는 Storage)",
        "image_size": "바이트 크기",
        "content_type": "MIME (예: image/jpeg)",
        "download_status": "success / error / skipped",
        "error_msg": "오류 메시지",
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

    # 조회용 보조 인덱스 (원본에 없을 수 있음)
    dst.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_cases_committee ON classification_cases(committee_type);
        CREATE INDEX IF NOT EXISTS idx_cases_enfr ON classification_cases(enfr_dt);
        CREATE INDEX IF NOT EXISTS idx_cases_reff ON classification_cases(reff_no);
        CREATE INDEX IF NOT EXISTS idx_cases_rrdc ON classification_cases(rrdc_no);
        CREATE INDEX IF NOT EXISTS idx_case_images_case ON case_images(case_id);
        """
    )

    by_type = dst.execute(
        "SELECT committee_type, committee_name, COUNT(*) "
        "FROM classification_cases GROUP BY 1,2 ORDER BY 1"
    ).fetchall()
    img_bytes = dst.execute(
        "SELECT COALESCE(SUM(LENGTH(image_data)),0) FROM case_images"
    ).fetchone()[0]
    meta = {
        "package_name": "품목분류 국내사례 — Supabase import",
        "package_version": "V1.0",
        "tables": ",".join(TABLES),
        "source_db": str(src),
        "ui_path": "/item-classification/domestic-cases",
        "exported_at_utc": utc_now(),
        "row_counts": json.dumps(counts, ensure_ascii=False),
        "by_committee": json.dumps(
            [
                {"committee_type": a, "committee_name": b, "count": c}
                for a, b, c in by_type
            ],
            ensure_ascii=False,
        ),
        "case_images_blob_bytes": str(img_bytes),
        "join_note": "case_images.case_id = classification_cases.id",
        "supabase_note": "이관 순서: classification_cases → case_images. "
        "image_data 는 bytea 또는 Supabase Storage 권장. id 유지 시 FK 조인 유지.",
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
    print("VACUUM …")
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
    img_bytes = int(pkg.get("case_images_blob_bytes") or "0")

    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "맑은 고딕"
    style.font.size = Pt(10)
    style._element.rPr.rFonts.set(qn("w:eastAsia"), "맑은 고딕")

    add_heading(doc, "품목분류 국내사례 테이블 설명서", 0)
    for line in [
        "문서 버전: V1.0",
        f"DB 파일: {db_path.name}",
        f"경로: {db_path}",
        f"원본 DB: {pkg.get('source_db', '')}",
        "용도: Supabase 업로드용 품목분류 국내사례 전용 패키지",
        "화면: 스마트 법령 AI · HS정보 · 품목분류 국내사례 "
        "(/item-classification/domestic-cases)",
        f"내보냄(UTC): {pkg.get('exported_at_utc', '')}",
    ]:
        add_para(doc, line)

    add_heading(doc, "1. 개요", 1)
    add_para(
        doc,
        "품목분류 국내사례는 위원회결정사항(A)·협의회결정사항(B)·품목분류사례(C)를 "
        "classification_cases 에 저장하고, 썸네일·첨부 이미지는 case_images 에 "
        "BLOB으로 보관합니다. 화면 탭·참조번호·결정서번호·시행일자·품명·물품설명·결정사유 "
        "검색은 classification_cases 컬럼에 대응합니다. "
        "본 워드에는 레이아웃·건수·샘플만 수록하며, 전체 데이터·이미지는 SQLite DB에 있습니다.",
    )

    add_heading(doc, "2. 테이블 목록", 1)
    add_table(
        doc,
        ["테이블", "역할", "건수"],
        [
            [
                "classification_cases",
                "사례 본문 (목록·상세·검색)",
                f"{counts['classification_cases']:,}",
            ],
            [
                "case_images",
                f"이미지 BLOB (합계 약 {img_bytes / (1024*1024):.0f} MB)",
                f"{counts['case_images']:,}",
            ],
            ["package_meta", "패키지 메타 (이관 시 선택)", "수 건"],
        ],
    )

    add_heading(doc, "3. 위원회 유형별 건수", 1)
    by_type = conn.execute(
        "SELECT committee_type, committee_name, COUNT(*) AS c "
        "FROM classification_cases GROUP BY 1,2 ORDER BY 1"
    ).fetchall()
    add_table(
        doc,
        ["committee_type", "committee_name (화면 탭)", "건수"],
        [
            [r["committee_type"], r["committee_name"] or "", f"{r['c']:,}"]
            for r in by_type
        ],
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

    add_heading(doc, "5. 화면 필드 매핑", 1)
    for line in [
        "· 탭: committee_type (A/B/C) · committee_name",
        "· 참조번호: reff_no",
        "· 결정서번호: rrdc_no",
        "· 시행일자: enfr_dt",
        "· 품명: cmdt_nm · 물품설명: cmdt_desc · 결정사유: dtrm_rsn_cn",
        "· 검색어: 위 텍스트 컬럼 + dtrm_hs_sgn 등 OR 검색",
        "· 이미지: case_images WHERE case_id = classification_cases.id "
        "ORDER BY image_seq",
    ]:
        add_para(doc, line)

    add_heading(doc, "6. Supabase(Postgres) 권장 DDL", 1)
    add_para(
        doc,
        "create table public.classification_cases (\n"
        "  id bigint generated by default as identity primary key,\n"
        "  committee_type text not null,\n"
        "  committee_name text not null,\n"
        "  rrdc_no text,\n"
        "  reff_no text,\n"
        "  enfr_dt text,\n"
        "  cstm_nm text,\n"
        "  dtrm_hs_sgn text,\n"
        "  cmdt_nm text,\n"
        "  cmdt_desc text,\n"
        "  dtrm_rsn_cn text,\n"
        "  imge_cnt integer,\n"
        "  attch_lst text,\n"
        "  prlst_clsf_case_tpcd text,\n"
        "  oppb_yn text,\n"
        "  raw_json text,\n"
        "  detail_html text,\n"
        "  crawled_at text not null\n"
        ");\n"
        "create index idx_cases_committee on public.classification_cases (committee_type);\n"
        "create index idx_cases_enfr on public.classification_cases (enfr_dt);\n\n"
        "create table public.case_images (\n"
        "  id bigint generated by default as identity primary key,\n"
        "  case_id bigint not null references public.classification_cases(id),\n"
        "  attch_file_id text not null,\n"
        "  image_seq integer not null,\n"
        "  image_data bytea,\n"
        "  image_size integer,\n"
        "  content_type text,\n"
        "  download_status text not null,\n"
        "  error_msg text,\n"
        "  crawled_at text not null\n"
        ");\n"
        "create index idx_case_images_case on public.case_images (case_id);",
        size=9,
    )

    add_heading(doc, "7. 샘플 데이터 (각 테이블 상위 5건)", 1)
    add_heading(doc, "7.1 classification_cases", 2)
    case_sample = conn.execute(
        "SELECT id, committee_type, reff_no, rrdc_no, enfr_dt, "
        "substr(COALESCE(cmdt_nm,''),1,40) AS nm, imge_cnt "
        "FROM classification_cases ORDER BY id LIMIT 5"
    ).fetchall()
    add_table(
        doc,
        ["id", "type", "reff_no", "rrdc_no", "enfr_dt", "cmdt_nm(앞40자)", "imge_cnt"],
        [
            [
                str(r["id"]),
                r["committee_type"] or "",
                r["reff_no"] or "",
                r["rrdc_no"] or "",
                r["enfr_dt"] or "",
                r["nm"] or "",
                str(r["imge_cnt"] if r["imge_cnt"] is not None else ""),
            ]
            for r in case_sample
        ],
    )

    add_heading(doc, "7.2 case_images (메타만, BLOB 제외)", 2)
    img_sample = conn.execute(
        "SELECT id, case_id, attch_file_id, image_seq, image_size, "
        "content_type, download_status "
        "FROM case_images ORDER BY id LIMIT 5"
    ).fetchall()
    add_table(
        doc,
        [
            "id",
            "case_id",
            "attch_file_id",
            "image_seq",
            "image_size",
            "content_type",
            "download_status",
        ],
        [
            [
                str(r["id"]),
                str(r["case_id"]),
                r["attch_file_id"] or "",
                str(r["image_seq"]),
                str(r["image_size"] if r["image_size"] is not None else ""),
                r["content_type"] or "",
                r["download_status"] or "",
            ]
            for r in img_sample
        ],
    )

    add_heading(doc, "8. 업로드 안내", 1)
    for line in [
        f"· 전체 데이터: cases {counts['classification_cases']:,}건 + "
        f"images {counts['case_images']:,}건 "
        f"(image_data 합계 약 {img_bytes / (1024*1024):.0f} MB) 이 DB에 포함됩니다.",
        "· 이관 순서: classification_cases → case_images (FK).",
        "· id 값을 유지해 이관하면 case_id 조인·썸네일 API가 그대로 동작합니다.",
        "· Supabase에서는 image_data(bytea) 대신 Storage 버킷에 올리고 "
        "URL/path 컬럼을 두는 방식도 가능합니다.",
        "· package_meta 는 앱 운영에 불필요하면 이관하지 않아도 됩니다.",
        "· detail_html / raw_json / 긴 텍스트는 용량이 크므로 CSV보다 "
        "SQLite→Postgres 도구 또는 청크 적재를 권장합니다.",
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
