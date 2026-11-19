"""Generate Word document describing smart_law_ai.db table structure."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

OUT = Path(__file__).resolve().parent.parent / "docs" / "smart_law_ai_db_schema.docx"


def add_table(doc: Document, headers: list[str], rows: list[list[str]]) -> None:
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    hdr = table.rows[0].cells
    for i, h in enumerate(headers):
        hdr[i].text = h
    for r_idx, row in enumerate(rows, start=1):
        cells = table.rows[r_idx].cells
        for c_idx, val in enumerate(row):
            cells[c_idx].text = val
    doc.add_paragraph()


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)

    doc = Document()
    title = doc.add_heading("smart_law_ai.db 테이블 구조", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    p = doc.add_paragraph()
    p.add_run(f"작성일: {date.today().isoformat()}\n")
    p.add_run("프로젝트: Smart Law AI Admin\n")
    p.add_run("DB 경로: SMART_LAW_SQLITE_DB_PATH (기본 D:/SQLiteDB/smart_law_ai.db)")

    doc.add_heading("1. 개요", level=1)
    doc.add_paragraph(
        "smart_law_ai.db는 일반법령 조회 화면(/general-law-inquiry)에서 사용하는 SQLite 데이터베이스입니다. "
        "국가법령정보센터 API에서 수집한 법령 JSON을 파싱하여 저장하며, "
        "Supabase(PostgreSQL)와 동일한 테이블 설계를 따릅니다. "
        "단, SQLite에는 벡터/RAG용 law_chunks 테이블이 없습니다."
    )

    add_table(
        doc,
        ["항목", "내용"],
        [
            ["용도", "법령 목록·구조 트리·조문 본문 조회"],
            ["현재 규모(예시)", "법령 99건, 버전 99건, 조문 9,615건, 항·호·목 48,781건"],
            ["관련 화면", "일반법령 조회 (general-law-inquiry)"],
        ],
    )

    doc.add_heading("2. 계층 구조 (핵심 테이블)", level=1)
    doc.add_paragraph(
        "laws → law_versions → law_structure_nodes / law_articles → law_article_items"
    )
    add_table(
        doc,
        ["화면 영역", "사용 테이블"],
        [
            ["왼쪽 법령 목록", "laws + law_versions (is_current = 1)"],
            ["가운데 구조 트리 (편/장/절/조)", "law_structure_nodes + law_articles"],
            ["오른쪽 본문", "law_articles + law_article_items + law_versions.raw_json"],
        ],
    )

    doc.add_heading("3. 테이블 상세", level=1)

    sections = [
        (
            "3.1 laws — 법령 마스터 (99건)",
            "법령 기본 정보. law_id는 국가법령정보센터 법령ID입니다.",
            ["컬럼", "설명"],
            [
                ["id", "내부 PK (INTEGER)"],
                ["law_id", "국가법령정보 법령ID (예: 001649)"],
                ["law_key", "법령 키"],
                ["law_name_kr", "법령명 (한글)"],
                ["law_name_hanja", "한자명"],
                ["law_name_short", "약칭"],
                ["law_type_name / law_type_code", "법종류"],
                ["ministry_name / ministry_code", "소관부처"],
                ["language", "언어"],
                ["raw_json", "API 원본 JSON (TEXT)"],
                ["created_at / updated_at", "등록·수정 시각"],
            ],
        ),
        (
            "3.2 law_versions — 시행·공포 버전 (99건)",
            "법령의 특정 공포·시행 버전. is_current=1인 행이 현행 버전입니다.",
            ["컬럼", "설명"],
            [
                ["id", "버전 PK"],
                ["law_id", "→ laws.id (FK)"],
                ["version_key", "공포번호-공포일 형태 버전 키"],
                ["promulgation_no / promulgation_date", "공포번호·공포일"],
                ["enforcement_date", "시행일"],
                ["revision_type", "제개정 구분"],
                ["article_effective_text", "조문 시행 정보 텍스트"],
                ["promulgated_law_yn", "공포법령 여부"],
                ["contact_phone / contact_department_name", "연락처·담당부서"],
                ["is_current", "현행 버전 여부 (1=현행)"],
                ["raw_json", "해당 버전 전체 API JSON"],
                ["created_at / updated_at", "등록·수정 시각"],
            ],
        ),
        (
            "3.3 law_structure_nodes — 장·절 트리 (1,052건)",
            "편·장·절 등 목차(TOC) 노드. parent_id로 계층을 구성합니다.",
            ["컬럼", "설명"],
            [
                ["id", "노드 PK"],
                ["law_version_id", "→ law_versions.id (FK)"],
                ["parent_id", "상위 노드 (자기참조)"],
                ["node_type", "CHAPTER(편/장) / SECTION(절)"],
                ["node_no / node_title / full_title", "번호·제목"],
                ["display_order / depth", "정렬·깊이"],
                ["article_no / article_key", "연결 조문"],
                ["raw_json", "노드 원본 JSON"],
            ],
        ),
        (
            "3.4 law_articles — 조문 (9,615건)",
            "개별 조문. structure_node_id로 소속 장·절과 연결됩니다.",
            ["컬럼", "설명"],
            [
                ["id", "조문 PK"],
                ["law_version_id", "→ law_versions.id (FK)"],
                ["structure_node_id", "→ law_structure_nodes.id (FK)"],
                ["article_key", "조문 고유키 (버전 내 유일)"],
                ["article_no", "조번호 (INTEGER)"],
                ["article_title / article_content", "조문 제목·내용"],
                ["article_type / article_revision_type", "조문 유형·개정 유형"],
                ["article_effective_date", "조문 시행일"],
                ["article_changed_yn 등", "변경·이동·참조 정보"],
                ["display_order", "표시 순서"],
                ["raw_json", "조문 단위 원본 JSON"],
            ],
        ),
        (
            "3.5 law_article_items — 항·호·목 (48,781건)",
            "조문 하위의 항·호·목 계층 구조.",
            ["컬럼", "설명"],
            [
                ["id", "항목 PK"],
                ["law_article_id", "→ law_articles.id (FK)"],
                ["item_level", "항 / 호 / 목 등"],
                ["parent_item_id", "상위 항목 (자기참조)"],
                ["item_no / item_content", "번호·내용"],
                ["display_order / depth", "정렬·깊이"],
                ["raw_json", "항목 원본 JSON"],
            ],
        ),
    ]

    for heading, desc, hdr, rows in sections:
        doc.add_heading(heading, level=2)
        doc.add_paragraph(desc)
        add_table(doc, hdr, rows)

    doc.add_heading("3.6 부가 테이블 (현재 데이터 0건)", level=2)
    doc.add_paragraph("API 수집·검색 이력 저장용. 스키마는 존재하나 현재 DB에는 행이 없을 수 있습니다.")
    add_table(
        doc,
        ["테이블", "용도"],
        [
            ["law_search_histories", "현행법령 목록 검색 API 이력"],
            ["law_search_items", "목록 검색 결과 행"],
            ["admrul_snapshots", "행정규칙 본문 API 스냅샷"],
            ["admrul_search_runs", "행정규칙 목록 검색 실행 이력"],
            ["admrul_list_items", "행정규칙 목록 검색 결과"],
            ["law_eflaw_josub_snapshots", "조항호목(eflawjosub) API 조회 이력"],
        ],
    )

    doc.add_heading("4. Supabase(PostgreSQL)와의 차이", level=1)
    add_table(
        doc,
        ["항목", "SQLite (smart_law_ai.db)", "Supabase"],
        [
            ["law_chunks", "없음 (벡터/RAG 미사용)", "있음 (임베딩 768차원)"],
            ["JSON 타입", "TEXT", "jsonb"],
            ["날짜", "TEXT (YYYY-MM-DD)", "date"],
            ["불린", "INTEGER (0/1)", "boolean"],
        ],
    )

    doc.add_heading("5. 조회 흐름 요약", level=1)
    flow = doc.add_paragraph()
    flow.add_run(
        "1) 법령 목록: laws JOIN law_versions WHERE is_current = 1\n"
        "2) 구조 트리: law_structure_nodes + law_articles (display_order)\n"
        "3) 본문: law_articles.article_content + law_article_items (항·호·목)"
    )

    doc.add_heading("6. 관련 소스 코드", level=1)
    add_table(
        doc,
        ["파일", "역할"],
        [
            ["app/lib/smart-law-sqlite-server.ts", "SQLite 조회"],
            ["app/lib/smart-law-sqlite-save.ts", "SQLite 저장"],
            ["app/components/general-law-inquiry-view.tsx", "일반법령 조회 UI"],
            ["sql/create_database.sql", "스키마 참조 (PostgreSQL)"],
        ],
    )

    doc.save(OUT)
    print(f"Created: {OUT}")


if __name__ == "__main__":
    main()
