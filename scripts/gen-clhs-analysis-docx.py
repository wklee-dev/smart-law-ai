# -*- coding: utf-8 -*-
"""CLHS vs 스마트법령AI — 메뉴별 상세 비교분석 Word(한글) 문서 생성

버전 관리:
  · 파일명: CLHS_스마트법령AI_비교분석V{버전}.docx
  · DOC_VERSION 만 올린 뒤 `python scripts/gen-clhs-analysis-docx.py` 실행
  · 이전 버전 파일은 docs/ 에 보존 (덮어쓰지 않음)
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parent.parent

# ── 문서 버전 (갱신 시 이 값만 수정) ─────────────────────────────
DOC_VERSION = "1.2"
DOC_BASE_NAME_KO = "CLHS_스마트법령AI_비교분석"
DOC_BASE_NAME_EN = "CLHS_SmartLawAI_Comparison"

VERSION_HISTORY: list[tuple[str, str, str]] = [
    ("1.0", "2026-09-09", "CLHS vs 스마트법령AI 개요·DB 실측·로드맵"),
    (
        "1.1",
        "2026-09-09",
        "GNB 8메뉴 상세 비교, 하위메뉴·매칭표·갭·스크린샷 반영",
    ),
    (
        "1.2",
        "2026-09-09",
        "CLHS 하위항목 종합비교표(문서 앞), 메뉴·세부항목 확장, ciel 16목차 반영",
    ),
]


def doc_output_paths() -> tuple[Path, Path]:
    tag = f"V{DOC_VERSION}"
    return (
        ROOT / "docs" / f"{DOC_BASE_NAME_KO}{tag}.docx",
        ROOT / "docs" / f"{DOC_BASE_NAME_EN}_{tag}.docx",
    )

FONT = "맑은 고딕"
NAVY = "1E2F4F"
HEADER_BG = "1E2F4F"
HEADER_FG = RGBColor(0xFF, 0xFF, 0xFF)
BODY = RGBColor(0x33, 0x33, 0x33)
MUTED = RGBColor(0x66, 0x66, 0x66)
WARN_BG = "FFF8E6"
GAP_BG = "FDEEEE"


def set_run_font(run, *, size=11, bold=False, color: RGBColor | None = None, name: str = FONT):
    run.bold = bold
    run.font.size = Pt(size)
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    if color is not None:
        run.font.color.rgb = color


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def setup_document(doc: Document) -> None:
    sec = doc.sections[0]
    sec.top_margin = Cm(2.5)
    sec.bottom_margin = Cm(2.5)
    sec.left_margin = Cm(2.5)
    sec.right_margin = Cm(2.5)
    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(11)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)
    pf = normal.paragraph_format
    pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
    pf.line_spacing = 1.15
    pf.space_after = Pt(6)


def add_spacer(doc: Document, pt: float = 10) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(pt)


def add_section_heading(doc: Document, text: str, level: int = 1) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(16 if level == 1 else 12)
    p.paragraph_format.space_after = Pt(8)
    size = 16 if level == 1 else 13 if level == 2 else 12
    run = p.add_run(text)
    set_run_font(run, size=size, bold=True, color=RGBColor(0x1E, 0x2F, 0x4F))
    border = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")
    bottom.set(qn("w:space"), "1")
    bottom.set(qn("w:color"), NAVY)
    border.append(bottom)
    p._p.get_or_add_pPr().append(border)


def add_body(doc: Document, text: str, *, size: int = 11, bold: bool = False) -> None:
    p = doc.add_paragraph()
    run = p.add_run(text)
    set_run_font(run, size=size, bold=bold, color=BODY)
    p.paragraph_format.space_after = Pt(8)


def add_bullets(doc: Document, items: list[str]) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.left_indent = Cm(0.75)
        p.paragraph_format.space_after = Pt(4)
        set_run_font(p.add_run(item), size=10, color=BODY)


def add_callout(doc: Document, title: str, body: str, fill: str = "EEF2F7") -> None:
    table = doc.add_table(rows=1, cols=1)
    cell = table.rows[0].cells[0]
    set_cell_shading(cell, fill)
    set_run_font(cell.paragraphs[0].add_run(title), size=11, bold=True, color=RGBColor(0x1E, 0x2F, 0x4F))
    set_run_font(cell.add_paragraph().add_run(body), size=10, color=BODY)
    add_spacer(doc, 8)


def add_styled_table(
    doc: Document,
    headers: list[str],
    rows: list[list[str]],
    col_widths_cm: list[float] | None = None,
    header_fill: str = HEADER_BG,
    *,
    header_font_size: int = 9,
    body_font_size: int = 9,
) -> None:
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    if col_widths_cm:
        for row in table.rows:
            for idx, w in enumerate(col_widths_cm):
                if idx < len(row.cells):
                    row.cells[idx].width = Cm(w)
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        set_cell_shading(cell, header_fill)
        cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_run_font(p.add_run(h), size=header_font_size, bold=True, color=HEADER_FG)
    for r_idx, row in enumerate(rows):
        for c_idx, val in enumerate(row):
            cell = table.rows[r_idx + 1].cells[c_idx]
            cell.vertical_alignment = WD_ALIGN_VERTICAL.TOP
            set_run_font(cell.paragraphs[0].add_run(str(val)), size=body_font_size, color=BODY)
    add_spacer(doc, 10)


def add_menu_section(doc: Document, menu: dict) -> None:
    add_section_heading(doc, menu["title"], 1)
    add_body(doc, menu["summary"])
    meta = (
        f"CLHS URL: {menu['url']}\n"
        f"커버리지: {menu['coverage']}  |  구축 우선순위: {menu['priority']}"
    )
    add_callout(doc, "메뉴 요약", meta)

    add_section_heading(doc, "CLHS 하위 메뉴·화면 구성", 2)
    add_bullets(doc, menu["clhs_submenus"])

    if menu.get("clhs_ui"):
        add_section_heading(doc, "CLHS 화면·데이터 필드", 2)
        add_bullets(doc, menu["clhs_ui"])

    add_section_heading(doc, "스마트법령AI 매칭", 2)
    add_styled_table(
        doc,
        ["CLHS 항목", "스마트법령AI 화면/경로", "DB·API", "매칭도"],
        menu["mapping"],
        col_widths_cm=[3.2, 4.0, 3.5, 1.8],
    )

    add_section_heading(doc, "추가 필요 자료·개발", 2)
    add_callout(doc, "갭 분석", menu["gaps"], fill=GAP_BG)

    if menu.get("submenu_tree"):
        add_section_heading(doc, "CLHS 하위 메뉴 트리", 2)
        for group in menu["submenu_tree"]:
            add_body(doc, f"▸ {group['group']}", bold=True)
            add_bullets(doc, group["items"])

    if menu.get("build_notes"):
        add_section_heading(doc, "CLHS형 사이트 구축 시 권장", 2)
        add_bullets(doc, menu["build_notes"])

    doc.add_page_break()


def master_comparison_stats(rows: list[list[str]]) -> dict[str, int]:
    counts: dict[str, int] = {"양호": 0, "부분": 0, "없음": 0, "초과": 0}
    for row in rows:
        match = row[4] if len(row) > 4 else ""
        if match in counts:
            counts[match] += 1
    counts["total"] = len(rows)
    return counts


def numbered_master_rows(rows: list[list[str]]) -> list[list[str]]:
    return [[str(i + 1), *row] for i, row in enumerate(rows)]


# ── 종합 비교 (CLHS 하위항목 ↔ 스마트법령AI) ─────────────────────
# columns: GNB, CLHS 하위항목, 스마트법령AI, DB·API, 매칭, 비고

MASTER_COMPARISON: list[list[str]] = [
    # ── 1. 관세율표 ──
    ["관세율표", "연도별 HSK (2026~2002)", "/item-classification/tariff-schedule", "tariff.db · 961K", "양호", "연도·국가 필터 UI"],
    ["관세율표", "속견표 01–97 류", "/item-classification/quick-reference", "tariff.db + hs-chapter", "양호", "CLHS 2단(속견+부·류) 통합 필요"],
    ["관세율표", "부(Section) · 류(Chapter) 탐색", "quick-reference + tariff-schedule", "hs-chapter API", "부분", "CLHS tariffbase 레이아웃"],
    ["관세율표", "HS 10자리 품목·세율 상세", "/item-classification/tariff-schedule", "tariff.db item", "양호", "FTA·내국세 한 화면 미연계"],
    ["관세율표", "중국(CN) 관세율표", "tariff-schedule?country=CN", "tariff.db", "양호", ""],
    ["관세율표", "미국(US) 관세율표", "tariff-schedule?country=US", "tariff.db", "양호", ""],
    ["관세율표", "EU 관세율표", "tariff-schedule?country=EU", "tariff.db", "양호", ""],
    ["관세율표", "일본(JP) 관세율표", "tariff-schedule?country=JP", "tariff.db", "양호", ""],
    ["관세율표", "베트남(VN) 관세율표", "tariff-schedule?country=VN", "tariff.db", "양호", ""],
    ["관세율표", "인도(IN) 관세율표", "—", "—", "없음", "tariff.db 수집 필요"],
    ["관세율표", "English HSK", "—", "—", "없음", "영문 품목명·해설 EN 필드"],
    ["관세율표", "HS비교 (2코드 diff)", "—", "—", "없음", "신규 도구 개발"],
    ["관세율표", "HS 해설", "/item-classification/hs-explanatory", "hs_manual_complete.db · 39,677", "양호", ""],
    # ── 2. 분류사례 ──
    ["분류사례", "통합검색", "domestic + foreign 분리", "hs_manual / CLIP", "부분", "단일 Cuslist형 UNION API"],
    ["분류사례", "품명·내용 검색", "/item-classification/domestic-cases", "domestic-cases API", "양호", ""],
    ["분류사례", "이미지 검색", "—", "—", "없음", "CV·이미지 DB"],
    ["분류사례", "국내 분류사례 목록", "/item-classification/domestic-cases", "domestic-cases DB", "양호", "HSK·품명·구분·시행일 컬럼"],
    ["분류사례", "외국 분류사례 목록", "/item-classification/foreign-cases", "foreign-cases DB", "양호", ""],
    ["분류사례", "사례 상세 (userHSread)", "domestic/foreign 상세", "—", "부분", "CLHS 상세 HTML 필드 매핑"],
    ["분류사례", "MyHS (회원 저장)", "—", "—", "없음", "user_hs + 인증"],
    # ── 3. 세율 ──
    ["세율", "수입물품에 부과되는 세금 (개요)", "—", "—", "없음", "duty.asp encyclopedia"],
    ["세율", "세율적용 우선순위", "—", "—", "없음", "ciel/CLHS 크롤"],
    ["세율", "관세 · 관세감면 · 간이세율", "/item-classification/tariff-schedule", "tariff.db", "부분", "수치만·안내 본문 없음"],
    ["세율", "개별소비세·주세·교통세·교육세·농특세", "—", "—", "없음", "duty.asp 내국세 표"],
    ["세율", "부가가치세 · 지방세", "—", "—", "없음", ""],
    ["세율", "현장납부 · 관세환급", "—", "—", "없음", ""],
    ["세율", "FTA 세율 안내", "/item-classification/tariff-schedule", "tariff.db FTA rate", "부분", "설명 콘텐츠 없음"],
    ["세율", "국가별 수입요령 (세율)", "/cl-site/trade-guidelines", "ciel.db", "부분", "iolaw 연계"],
    ["세율", "면제·원산지·부가세 하위", "trade-guidelines · origin-criteria", "ciel + FTA PSR", "부분", ""],
    ["세율", "관련법령 조문 링크", "/openlaw-inquiry · admin-rules", "openlaw + admin_rules", "부분", "law.asp 자동 링크 테이블"],
    # ── 4. 수출입요령 (ciel menu 16) ──
    ["수출입요령", "수출입공고", "/cl-site/trade-guidelines", "ciel.db · iog.asp", "부분", "로그인벽 일부"],
    ["수출입요령", "통합공고", "/cl-site/trade-guidelines", "ciel.db · thr.asp", "부분", ""],
    ["수출입요령", "세관장확인", "/cl-site/trade-guidelines", "ciel.db · CustomsR.asp", "부분", ""],
    ["수출입요령", "HSK별 수출입요령", "/cl-site/trade-guidelines", "ciel.db · CustomsR2.asp", "없음", "로그인벽·대량 콘텐츠"],
    ["수출입요령", "법령별 수출입요령", "/cl-site/trade-guidelines", "ciel.db · relawlist.asp", "없음", "로그인벽 543건"],
    ["수출입요령", "수출승인의 면제", "/cl-site/trade-guidelines", "ciel.db · exemption_ex.asp", "부분", ""],
    ["수출입요령", "수입승인의 면제", "/cl-site/trade-guidelines", "ciel.db · exemption_im.asp", "부분", ""],
    ["수출입요령", "원산지 — 일반원칙", "/cl-site/trade-guidelines", "ciel.db · Origin.asp", "부분", "4탭 UI"],
    ["수출입요령", "원산지 — 원산지증명서", "/cl-site/trade-guidelines", "ciel.db · Origin2.asp", "부분", ""],
    ["수출입요령", "원산지 — 원산지결정기준", "/item-classification/origin-criteria", "FTA PSR 123K + ciel", "양호", "ciel vs FTA포털 중복"],
    ["수출입요령", "원산지 — 적정표시방법", "/cl-site/trade-guidelines", "ciel.db · Origin4.asp", "부분", ""],
    ["수출입요령", "원산지 간이확인 물품", "/cl-site/trade-guidelines", "ciel.db · co_easy.asp", "부분", ""],
    ["수출입요령", "원산지(포괄)확인서", "/cl-site/trade-guidelines", "ciel.db · co_cus.asp", "없음", "원본 iframe 404"],
    ["수출입요령", "남북한교역", "/cl-site/trade-guidelines", "ciel.db · relaw.asp", "없음", "원본 500·본문 미수집"],
    ["수출입요령", "전략물자", "/cl-site/trade-guidelines", "ciel.db · weapon.asp", "부분", "iframe 본문 재크롤 완료"],
    ["수출입요령", "품명·규격 작성기준", "/cl-site/trade-guidelines", "ciel.db · des_guide.asp", "부분", "iframe 본문 재크롤 필요"],
    # ── 5. 관련법령 ──
    ["관련법령", "최근 제·개정법령", "—", "openlaw + admin_rules", "없음", "피드·New 표시 UI"],
    ["관련법령", "관세법·시행령·시행규칙", "/openlaw-inquiry", "openlaw_efyd_* · 141", "부분", "lawlist 트리 없음"],
    ["관련법령", "관세법 3A·3B", "/openlaw-inquiry", "openlaw", "부분", ""],
    ["관련법령", "FTA관세법·환특", "/openlaw-inquiry", "openlaw + gwanselaw", "부분", ""],
    ["관련법령", "대외무역법·외환거래법", "/openlaw-inquiry · general-law", "Supabase law_*", "부분", ""],
    ["관련법령", "부가세·개별소비세·주세·교통세", "/openlaw-inquiry", "openlaw", "부분", "내국세 taxonomy"],
    ["관련법령", "교육세·농특세·조특법", "/openlaw-inquiry", "openlaw", "부분", ""],
    ["관련법령", "관세청고시", "/admin-rules-inquiry-sqlite", "admin_rules.db · 28K", "양호", "CLIP·고시 분류"],
    ["관련법령", "법령 본문 (law.asp)", "/openlaw-inquiry · admin-rules", "openlaw 조문 렌더", "부분", "CLHS HTML vs API 통일"],
    ["관련법령", "HWP/PDF 첨부", "openlaw attach", "LAW_ATTACH_DIR", "부분", ""],
    ["관련법령", "CLHS형 좌측 법령 트리", "—", "—", "없음", "category JSON + 마스터 인덱스"],
    # ── 6. 판례·예규 ──
    ["판례·예규", "통합검색", "precedents + inquiry 분리", "clip_*", "부분", "Cuslist UNION"],
    ["판례·예규", "제목 검색", "/customs-law-portal/precedents", "clip_precedent.db", "양호", ""],
    ["판례·예규", "관세청고시 (목록)", "/customs-law-portal/admin-rules", "admin_rules + clip", "부분", "Cuslist 통합"],
    ["판례·예규", "조세심판원·조심", "/customs-law-portal/precedents", "clip_precedent · 3,768", "양호", "구분 필터"],
    ["판례·예규", "대법원 판례", "/customs-law-portal/precedents", "clip_precedent_detail", "양호", ""],
    ["판례·예규", "질의회신", "/customs-law-portal/inquiry-replies", "clip_question.db · 1,263", "양호", ""],
    ["판례·예규", "상세 (Cusread)", "precedents/inquiry 상세", "clip detail", "부분", "필드 매핑"],
    # ── 7. 도구 ──
    ["도구", "환율정보 (통관환율)", "—", "—", "없음", "관세청·한은 API"],
    ["도구", "서식자료", "—", "—", "없음", "HWP/PDF 저장소"],
    ["도구", "단위환산", "—", "—", "없음", ""],
    ["도구", "무역통계부호 (수출/수입)", "—", "—", "없음", "KCS 코드表"],
    ["도구", "세관부호·장치장·징수형태", "—", "—", "없음", ""],
    ["도구", "국가별 정보 (코드·국기·통화)", "—", "countries.json (tariff)", "부분", "전용 UI 없음"],
    ["도구", "수입세액계산기", "—", "tariff.db (세율만)", "없음", "VAT·내국세 로직"],
    ["도구", "선편소요량 · 특수물품과세", "—", "—", "없음", ""],
    ["도구", "컨테이너 안전운임 · 인도조건", "—", "—", "없음", ""],
    ["도구", "가산금·가산세·과태료", "—", "—", "없음", ""],
    # ── 8. 게시판 ──
    ["게시판", "공지사항", "—", "—", "없음", "CMS 신규"],
    ["게시판", "News", "—", "—", "없음", ""],
    ["게시판", "News Links", "—", "—", "없음", "RSS/크롤"],
    ["게시판", "회원 게시판", "—", "—", "없음", "선택"],
    ["게시판", "우측 외부링크 (관세청·CLIP·FTA)", "—", "정적 링크", "부분", "즉시 가능"],
    # ── 공통 (CLHS 전역) ──
    ["공통", "통합검색 (관세율·사례·법령·판례)", "—", "—", "없음", "FTS·Elasticsearch"],
    ["공통", "메인 환율 (USD/EUR/CNY/GBP)", "—", "—", "없음", "환율 API"],
    ["공통", "회원·유료 로그인", "—", "관리자만", "없음", "B2C 회원 DB"],
    # ── 스마트법령AI 전용 (CLHS 없음) ──
    ["(전용)", "법령 본문 API·크롤", "/api-call", "openlawapi · gwanselaw", "초과", "백오피스"],
    ["(전용)", "행정규칙 크롤링", "/admin-rules-crawl", "admin_rules.db", "초과", ""],
    ["(전용)", "행정규칙 AI 검색·RAG", "/admin-rule-rag", "vector/RAG", "초과", ""],
    ["(전용)", "LangChain 법령 채팅", "/law-langchain-chat", "LLM", "초과", ""],
    ["(전용)", "원산지결정기준 (협정별약어)", "/origin-criteria-abbr", "FTA PSR", "초과", ""],
    ["(전용)", "NCOM 수입·수출 실적", "/cas-ncom/*", "CAS/NCOM API", "초과", "사내 전용"],
    ["(전용)", "3M SAP I/F", "/cas-api/3m-sap-if", "SAP", "초과", ""],
    ["(전용)", "API 관리·사용로그", "/api-management", "gateway log", "초과", ""],
]

# ── 메뉴별 상세 데이터 ──────────────────────────────────────────

MENUS = [
    {
        "title": "4.1 관세율표 (tariffbase.asp)",
        "url": "https://www.clhs.co.kr/tariffbase.asp",
        "coverage": "부분 (데이터 70% · UI 40%)",
        "priority": "★★★ 최우선",
        "summary": (
            "CLHS 핵심 메뉴. 연도·국가별 HSK(관세율표) 조회, 01–97 류 속견표, "
            "부·류 계층 탐색, English HSK, 해외 관세율표, HS비교를 제공합니다."
        ),
        "clhs_submenus": [
            "좌측: 대한민국 > HSK > 연도별(2026~2002)",
            "상단: 국가별(중국·미국·EU·일본·베트남·인도) · English HSK · HS비교",
            "중앙: 속견표(01–97 류 그리드, 절/장 표시 아이콘)",
            "하단: 부(Section) · 류(Chapter) 목록 테이블",
        ],
        "clhs_ui": [
            "HS 10자리·품목별 세율·FTA 세율·내국세 연계(품목 상세)",
            "연도·시행월 선택, 국기·국가명 표시",
            "류 클릭 → 해당 Chapter/Heading 상세 이동",
        ],
        "submenu_tree": [
            {
                "group": "좌측 LNB — 대한민국 HSK",
                "items": ["2026~2002 연도별 관세율표", "01–97 류 속견표 그리드", "부(Section) · 류(Chapter) 하단 테이블"],
            },
            {
                "group": "상단 탭 — 국가·도구",
                "items": ["중국·미국·EU·일본·베트남·인도", "English HSK", "HS비교(2코드)"],
            },
            {
                "group": "품목 상세",
                "items": ["HS 10자리", "품목별·FTA 세율", "내국세 연계"],
            },
        ],
        "mapping": [
            ["속견표 01–97", "/item-classification/quick-reference", "tariff.db + hs-chapter", "양호"],
            ["부·류(Section/Chapter)", "quick-reference + tariff-schedule", "hs-chapter API", "부분"],
            ["연도별 HSK (2026~2002)", "/item-classification/tariff-schedule", "tariff.db (961K items)", "양호"],
            ["HS 10자리·FTA 세율", "tariff-schedule 상세", "tariff.db item", "양호"],
            ["중국·미·EU·일·베트남", "tariff-schedule countryCode", "tariff.db 41개국", "양호"],
            ["인도(IN) 관세", "—", "DB 미보유", "없음"],
            ["HS 해설", "/item-classification/hs-explanatory", "hs_manual_complete.db · 39,677", "양호"],
            ["English HSK", "—", "—", "없음"],
            ["HS비교", "—", "—", "없음"],
        ],
        "gaps": (
            "① English HSK 전용 화면·데이터\n"
            "② HS비교(2개 코드 diff) 도구 — 신규 개발\n"
            "③ CLHS형 속견표+부·류 2단 레이아웃 통합 UI\n"
            "④ 인도 관세율표 tariff.db 수집\n"
            "⑤ 품목 상세에서 FTA·내국세까지 한 화면 (CLHS 수준)"
        ),
        "build_notes": [
            "quick-reference + tariff-schedule를 CLHS tariffbase.asp 레이아웃으로 통합",
            "기존 tariff API 재사용, 프론트만 포털형 GNB/LNB 추가",
        ],
    },
    {
        "title": "4.2 분류사례 (userHSlist.asp)",
        "url": "https://www.clhs.co.kr/userHSlist.asp",
        "coverage": "부분 (데이터 60% · UI 50%)",
        "priority": "★★★",
        "summary": (
            "회원·공개 품목분류 사례 목록. HSK·품명·구분(과)·시행일 컬럼, "
            "통합검색·품명검색·이미지 검색 토글을 제공합니다."
        ),
        "clhs_submenus": [
            "통합검색 / 품명-내용 검색",
            "이미지 검색 토글",
            "MyHS(회원 저장 목록) 연동",
        ],
        "clhs_ui": [
            "컬럼: HSK(10자) · 품명(영/한) · 구분(품목분류과-번호) · 시행일",
            "페이지네이션, 사례 상세(userHSread.asp) 링크",
        ],
        "submenu_tree": [
            {"group": "검색", "items": ["통합검색", "품명·내용 검색", "이미지 검색 토글"]},
            {"group": "목록·상세", "items": ["HSK·품명·구분·시행일 그리드", "userHSread.asp 상세", "MyHS 회원 저장"]},
        ],
        "mapping": [
            ["통합검색", "domestic + foreign 분리", "—", "부분"],
            ["품명·내용 검색", "/item-classification/domestic-cases", "domestic-cases API", "양호"],
            ["이미지 검색", "—", "—", "없음"],
            ["국내 분류사례", "/item-classification/domestic-cases", "domestic-cases DB", "양호"],
            ["외국 분류사례", "/item-classification/foreign-cases", "foreign-cases DB", "양호"],
            ["사례 상세", "domestic/foreign detail", "—", "부분"],
            ["회원 MyHS", "—", "—", "없음"],
        ],
        "gaps": (
            "① 회원별 MyHS 저장 — 사용자·세션 DB 필요\n"
            "② 이미지 기반 분류사례 검색 — CV/이미지 DB\n"
            "③ 국내·외국 사례를 CLHS처럼 단일 그리드 통합 검색\n"
            "④ CLHS userHSlist는 회원 기여 사례 포함 가능 — 출처 정책 확인"
        ),
        "build_notes": [
            "domestic-cases 그리드 컬럼을 CLHS와 동일(HSK·품명·구분·시행일)로 정렬",
            "통합 검색 API 1개로 domestic+foreign UNION",
        ],
    },
    {
        "title": "4.3 세율 (Y2026/duty.asp)",
        "url": "https://www.clhs.co.kr/Y2026/duty.asp",
        "coverage": "부분 (콘텐츠 30% · UI 10%)",
        "priority": "★★",
        "summary": (
            "수입물품 세금·FTA·관세감면·내국세·부가세 등 세율 안내 encyclopedia. "
            "좌측 목차 + 본문 표(과세표준·세액산출·관련법령) 구조입니다."
        ),
        "clhs_submenus": [
            "수입물품에 부과되는 세금",
            "세율적용 우선순위 · 관세 · 관세감면 · 간이세율",
            "내국세(개별소비세·주세·교통세·교육세·농특세)",
            "부가가치세 · 지방세 · 현장납부 · 관세환급",
            "FTA 세율 · 국가별 수입요령 · 면제 · 원산지 · 부가세(하위)",
        ],
        "submenu_tree": [
            {
                "group": "좌측 목차 (duty.asp)",
                "items": [
                    "수입물품에 부과되는 세금",
                    "세율적용 우선순위",
                    "관세 · 관세감면 · 간이세율",
                    "개별소비세 · 주세 · 교통세 · 교육세 · 농특세",
                    "부가가치세 · 지방세 · 현장납부 · 관세환급",
                    "FTA 세율 · 국가별 수입요령 · 면제 · 원산지",
                ],
            },
        ],
        "clhs_ui": [
            "3열: 구분 | 과세표준·산출방법 | 관련법령(조문 링크)",
            "법령명 클릭 → law.asp 본문",
            "연도(Y2026)별 URL 경로",
        ],
        "mapping": [
            ["수입물품 세금 개요", "—", "—", "없음"],
            ["세율적용 우선순위", "—", "—", "없음"],
            ["관세·감면·간이세율", "/item-classification/tariff-schedule", "tariff.db", "부분"],
            ["내국세 5종 표", "—", "—", "없음"],
            ["부가세·지방세·환급", "—", "—", "없음"],
            ["FTA 세율 안내", "tariff-schedule", "tariff.db", "부분"],
            ["관련법령 조문 링크", "/openlaw-inquiry", "openlaw + admin_rules", "부분"],
            ["ciel 세율 연계", "/cl-site/trade-guidelines", "ciel.db", "부분"],
        ],
        "gaps": (
            "① CLHS duty.asp 전체 HTML 콘텐츠 — ciel.db 미수집 또는 로그인벽\n"
            "② 세액 산출 로직·계산기 연동 콘텐츠\n"
            "③ 관련법령 조문 자동 링크 (법령 DB와 매핑 테이블)\n"
            "④ CLHS_ID/PW 로그인 후 Y2026/duty/* 크롤 또는 CMS 수동 입력"
        ),
        "build_notes": [
            "Phase 2: ciel 크롤 확장 또는 세율 전용 content 테이블",
            "법령 조문은 openlaw/admin_rules API와 law_id 매핑",
        ],
    },
    {
        "title": "4.4 수출입요령 (Y2026/iolaw.asp)",
        "url": "https://www.clhs.co.kr/Y2026/iolaw.asp",
        "coverage": "부분 (데이터 45% · UI 35%)",
        "priority": "★★★",
        "summary": (
            "수출입 실무 요령 허브. 공고·통합공고·세관장확인·HSK별·법령별·"
            "승인면제·원산지·남북교역·전략물자·품명규격 등 10개 목차."
        ),
        "clhs_submenus": [
            "수출입공고 · 통합공고 · 세관장확인",
            "HSK별 수출입요령 · 법령별 수출입요령",
            "수출/수입 승인의 면제",
            "원산지(일반원칙·증명서·결정기준·표시·간이·포괄확인서)",
            "남북한교역 · 전략물자 · 품명·규격 작성기준",
        ],
        "submenu_tree": [
            {
                "group": "공고·확인 (ciel menu 0–2)",
                "items": ["수출입공고 (iog.asp)", "통합공고 (thr.asp)", "세관장확인 (CustomsR.asp)"],
            },
            {
                "group": "HSK·법령별 (ciel 3–4)",
                "items": ["HSK별 수출입요령 (CustomsR2.asp)", "법령별 수출입요령 (relawlist.asp)"],
            },
            {
                "group": "승인면제 (ciel 5–6)",
                "items": ["수출승인의 면제", "수입승인의 면제"],
            },
            {
                "group": "원산지 6탭 (ciel 7–12)",
                "items": [
                    "일반원칙 · 원산지증명서 · 원산지결정기준",
                    "적정표시방법 · 간이확인 · (포괄)확인서",
                ],
            },
            {
                "group": "기타 (ciel 13–15)",
                "items": ["남북한교역", "전략물자", "품명·규격 작성기준"],
            },
        ],
        "clhs_ui": [
            "3열: 구분 | 수출입규정 요약 | 참조(법령·고시)",
            "원산지 4탭(일반원칙·증명서·결정기준·표시)",
            "연도 선택(Y2026), iframe/HTML 본문",
        ],
        "mapping": [
            ["수출입공고", "/cl-site/trade-guidelines", "ciel · iog.asp", "부분"],
            ["통합공고", "/cl-site/trade-guidelines", "ciel · thr.asp", "부분"],
            ["세관장확인", "/cl-site/trade-guidelines", "ciel · CustomsR.asp", "부분"],
            ["HSK별 수출입요령", "/cl-site/trade-guidelines", "ciel · CustomsR2.asp", "없음"],
            ["법령별 수출입요령", "/cl-site/trade-guidelines", "ciel · relawlist.asp", "없음"],
            ["수출·수입 승인면제", "/cl-site/trade-guidelines", "ciel · exemption_*", "부분"],
            ["원산지 4탭", "trade-guidelines siblingTabs", "ciel Origin*.asp", "부분"],
            ["원산지결정기준", "/item-classification/origin-criteria", "FTA PSR 123K", "양호"],
            ["(포괄)확인서", "/cl-site/trade-guidelines", "ciel · co_cus.asp", "없음"],
            ["남북한교역", "/cl-site/trade-guidelines", "ciel · relaw.asp", "없음"],
            ["전략물자", "/cl-site/trade-guidelines", "ciel · weapon.asp", "부분"],
            ["품명·규격 작성기준", "/cl-site/trade-guidelines", "ciel · des_guide.asp", "부분"],
        ],
        "gaps": (
            "① ciel.db 1,025건 중 543건 로그인벽 — CLHS_ID/PW 재크롤 필수\n"
            "② HSK별·법령별 수출입요령 대량 콘텐츠\n"
            "③ 통합공고·세관장확인 고시 본문 + 첨부 HWP/PDF\n"
            "④ FTA 원산지(ciel) vs FTA포털 PSR — 중복·동기화 정책"
        ),
        "build_notes": [
            "기존 /cl-site/trade-guidelines를 CLHS iolaw.asp 레이아웃으로 확장",
            "좌측 10목차 + 우측 3열 표 = ciel menu_list 기준",
        ],
    },
    {
        "title": "4.5 관련법령 (lawlist.asp)",
        "url": "https://www.clhs.co.kr/lawlist.asp",
        "coverage": "부분 (데이터 65% · UI 25%)",
        "priority": "★★",
        "summary": (
            "관세·무역·내국세·관세청고시 법령 목록. 좌측 법령 트리, "
            "최근 제·개정, 공포번호·개정일 컬럼."
        ),
        "clhs_submenus": [
            "최근 제·개정법령",
            "관세관련(관세법·환특·FTA관세법 + 시행령·규칙·3A·3B)",
            "무역관련(대외무역법·외환거래법)",
            "내국세(부가세·개별소비세·주세·교통세·교육세·농특세·조특법)",
            "관세청고시",
        ],
        "clhs_ui": [
            "컬럼: 법령명 · 공포번호 · 개정일",
            "law.asp?strlaw= 법령 본문",
            "HWP/PDF 아이콘, New 표시",
        ],
        "submenu_tree": [
            {"group": "좌측 트리", "items": ["최근 제·개정법령", "관세관련", "무역관련", "내국세", "관세청고시"]},
            {
                "group": "관세관련 하위",
                "items": ["관세법·시행령·규칙·3A·3B", "FTA관세법", "환특"],
            },
            {"group": "무역·내국세", "items": ["대외무역법·외환거래법", "부가세·개별소비세·주세·교통세·교육세·농특세·조특법"]},
        ],
        "mapping": [
            ["최근 제·개정", "—", "openlaw + admin_rules", "없음"],
            ["관세법·시행령·규칙", "/openlaw-inquiry", "openlaw · 141", "부분"],
            ["관세법 3A·3B", "/openlaw-inquiry", "openlaw", "부분"],
            ["FTA관세법·환특", "/openlaw-inquiry", "openlaw + gwanselaw", "부분"],
            ["대외무역법·외환", "/openlaw-inquiry", "Supabase law_*", "부분"],
            ["내국세 법령군", "/openlaw-inquiry", "openlaw", "부분"],
            ["관세청고시", "/admin-rules-inquiry-sqlite", "admin_rules · 28K", "양호"],
            ["법령 본문 law.asp", "/openlaw-inquiry", "openlaw 조문", "부분"],
            ["CLHS형 법령 트리", "—", "—", "없음"],
        ],
        "gaps": (
            "① 단일 lawlist 트리 UI — 현재 3개 화면 분산\n"
            "② 법령 분류(관세/무역/내국세) taxonomy 테이블\n"
            "③ 공포번호·개정일 통합 메타 (openlaw + admin_rules JOIN)\n"
            "④ law.asp 본문 — CLHS 자체 HTML vs openlaw 조문 렌더링 통일"
        ),
        "build_notes": [
            "gwanselaw_list + openlaw + admin_rules 마스터 법령 인덱스 테이블 신설",
            "lawlist.asp 좌측 트리 = category JSON 설정",
        ],
    },
    {
        "title": "4.6 판례·예규 (Cuslist.asp)",
        "url": "https://www.clhs.co.kr/Cuslist.asp",
        "coverage": "양호 (데이터 80% · UI 60%)",
        "priority": "★★★",
        "summary": (
            "관세청·조세심판원·대법원 등 판례·예규·고시 통합 목록. "
            "번호·제목·구분·결정일자 컬럼."
        ),
        "clhs_submenus": [
            "통합검색 · 제목 검색",
            "관세청고시 / 조심 / 대법원 / 기타 구분",
        ],
        "clhs_ui": [
            "컬럼: 번호 · 제목 · 구분 · 결정일자",
            "Cusread.asp 상세",
        ],
        "submenu_tree": [
            {"group": "검색", "items": ["통합검색", "제목 검색"]},
            {"group": "구분 필터", "items": ["관세청고시", "조세심판원(조심)", "대법원", "기타"]},
            {"group": "목록 컬럼", "items": ["번호 · 제목 · 구분 · 결정일자", "Cusread.asp 상세"]},
        ],
        "mapping": [
            ["통합검색", "precedents + inquiry 분리", "clip_*", "부분"],
            ["제목 검색", "/customs-law-portal/precedents", "clip_precedent.db", "양호"],
            ["관세청고시", "/customs-law-portal/admin-rules", "admin_rules + clip", "부분"],
            ["조심·대법원", "/customs-law-portal/precedents", "clip · 3,768", "양호"],
            ["질의회신", "/customs-law-portal/inquiry-replies", "clip_question · 1,263", "양호"],
            ["Cusread 상세", "precedents/inquiry detail", "clip detail", "부분"],
        ],
        "gaps": (
            "① 판례+질의+고시 단일 Cuslist — UNION VIEW 또는 통합 검색 API\n"
            "② CLHS Cusread 상세 HTML vs clip 상세 필드 매핑\n"
            "③ clip DB 주기적 CLIP 포털 동기화 배치"
        ),
        "build_notes": [
            "precedents + inquiry-replies를 /cuslist 통합 페이지로",
            "CLIP crawl_meta 기준 최신 갱신",
        ],
    },
    {
        "title": "4.7 도구 (tool.asp)",
        "url": "https://www.clhs.co.kr/tool.asp",
        "coverage": "없음 (데이터 5% · UI 0%)",
        "priority": "★ (후순위)",
        "summary": (
            "실무 도구 모음. 환율·서식·단위환산·무역통계부호·국가정보·"
            "수입세액계산기·운임·인도조건·가산세 등."
        ),
        "clhs_submenus": [
            "환율정보(통관환율, 연·월·일)",
            "서식자료 · 단위환산",
            "무역통계부호(수출/수입 거래·종류, 세관·장치장·징수형태)",
            "국가별 정보조회(코드·국기·통화)",
            "수입세액계산기 · 선편소요량 · 특수물품과세",
            "컨테이너 안전운임 · 인도조건 · 가산금·가산세·과태료",
        ],
        "clhs_ui": [
            "국가별: 코드·국기·국명·통화코드·통화명",
            "환율: 국가·통화·수출환율·수입환율·적용기간",
            "계산기: 입력 폼 + 결과",
        ],
        "submenu_tree": [
            {
                "group": "tool.asp 하위 (10+)",
                "items": [
                    "환율정보(통관환율·연월일)",
                    "서식자료 · 단위환산",
                    "무역통계부호(수출/수입·세관·장치장·징수형태)",
                    "국가별 정보(코드·국기·통화)",
                    "수입세액계산기 · 선편소요량 · 특수물품과세",
                    "컨테이너 안전운임 · 인도조건 · 가산세·과태료",
                ],
            },
        ],
        "mapping": [
            ["환율정보", "—", "—", "없음"],
            ["서식자료", "—", "—", "없음"],
            ["단위환산", "—", "—", "없음"],
            ["무역통계부호", "—", "—", "없음"],
            ["국가별 정보", "—", "countries.json", "부분"],
            ["수입세액계산기", "—", "tariff.db", "없음"],
            ["운임·인도조건·가산세", "—", "—", "없음"],
        ],
        "gaps": (
            "① 통관환율 — 관세청/한국은행 API 또는 CLHS 크롤\n"
            "② 무역통계부호 전체(세관부호·장치장·거래구분) — KCS 코드表\n"
            "③ 수입세액계산기 — tariff + 세율 encyclopedia + VAT 로직\n"
            "④ 서식자료(HWP/PDF) 파일 저장소\n"
            "⑤ tool.asp 전체 CLHS 크롤 또는 기능별 신규 개발"
        ),
        "build_notes": [
            "Phase 3 이후. 환율·국가코드부터 (외부 API)",
            "계산기는 tariff.db + 법령 세율 표 연동",
        ],
    },
    {
        "title": "4.8 게시판 (commu.asp)",
        "url": "https://www.clhs.co.kr/commu.asp",
        "coverage": "없음",
        "priority": "★ (후순위)",
        "summary": "공지·News·News Links·게시판. 운영 콘텐츠·커뮤니티.",
        "clhs_submenus": ["게시판", "News", "공지사항", "News Links"],
        "clhs_ui": ["목록·상세·페이지네이션", "우측 외부 링크(관세청·법령·CLIP·FTA)"],
        "submenu_tree": [
            {"group": "commu.asp", "items": ["게시판", "News", "공지사항", "News Links"]},
            {"group": "우측 사이드바", "items": ["관세청 · 국가법령 · CLIP · FTA 포털 외부링크"]},
        ],
        "mapping": [
            ["공지사항", "—", "—", "없음"],
            ["News", "—", "—", "없음"],
            ["News Links", "—", "—", "없음"],
            ["회원 게시판", "—", "—", "없음"],
            ["외부 링크 사이드바", "—", "정적 링크", "부분"],
        ],
        "gaps": (
            "① CMS(공지·News) — DB 테이블 + 관리 화면\n"
            "② News Links RSS/크롤\n"
            "③ 회원 게시판(선택)"
        ),
        "build_notes": ["정적 footer·sidebar links는 즉시 가능", "공지는 admin CMS Phase 3"],
    },
]

ADMIN_SHELL_MENUS = [
    ["홈", "처리현황", "/", "—", "백오피스"],
    ["법령 API/크롤링", "법령 본문 API", "/api-call", "관련법령", "초과"],
    ["법령 API/크롤링", "행정규칙크롤링", "/admin-rules-crawl", "관련법령", "초과"],
    ["법령 조회", "OPEN API 법령 조회", "/openlaw-inquiry", "관련법령·세율", "부분"],
    ["법령 조회", "행정규칙(Supabase)", "/admin-rules-inquiry", "관련법령", "부분"],
    ["법령 조회", "행정규칙(SQLiteDB)", "/admin-rules-inquiry-sqlite", "관련법령·판례", "양호"],
    ["법령 조회", "행정규칙 AI 검색", "/admin-rule-rag", "—", "초과"],
    ["법령 조회", "LangChain 채팅", "/law-langchain-chat", "—", "초과"],
    ["HS정보", "속견표", "/item-classification/quick-reference", "관세율표", "양호"],
    ["HS정보", "HS해설서", "/item-classification/hs-explanatory", "관세율표", "양호"],
    ["HS정보", "관세율표", "/item-classification/tariff-schedule", "관세율표", "양호"],
    ["HS정보", "품목분류 국내사례", "/item-classification/domestic-cases", "분류사례", "양호"],
    ["HS정보", "품목분류 외국사례", "/item-classification/foreign-cases", "분류사례", "양호"],
    ["FTA", "원산지결정기준(FTA포털)", "/item-classification/origin-criteria", "수출입요령·세율", "양호"],
    ["FTA", "원산지결정기준(협정별약어)", "/item-classification/origin-criteria-abbr", "—", "초과"],
    ["관세법령포털", "행정규칙", "/customs-law-portal/admin-rules", "관련법령·판례", "부분"],
    ["관세법령포털", "판례/결정례", "/customs-law-portal/precedents", "판례·예규", "양호"],
    ["관세법령포털", "질의회신", "/customs-law-portal/inquiry-replies", "판례·예규", "양호"],
    ["NCOM", "수입실적조회", "/cas-ncom/import-performance", "—", "초과"],
    ["NCOM", "수출실적조회", "/cas-ncom/export-performance", "—", "초과"],
    ["CAS", "3M SAP I/F", "/cas-api/3m-sap-if", "—", "초과"],
    ["이력 조회", "저장 법령·조문 JSON", "/law-detail-json", "관련법령", "초과"],
    ["이력 조회", "현행법령(시행일) 목록", "/law-search-list", "관련법령", "초과"],
    ["이력 조회", "조항호목 저장 이력", "/law-eflaw-josub-records", "관련법령", "초과"],
    ["씨엘SITE", "수출입요령", "/cl-site/trade-guidelines", "수출입요령·세율", "부분"],
    ["관리", "API 관리", "/api-management", "—", "초과"],
    ["관리", "API사용로그", "/gateway-audit-log", "—", "초과"],
    ["관리", "구분·분류 관리", "/api-option-management", "—", "초과"],
]

CROSS_CUTTING = [
    ["통합검색", "관세율·사례·법령·판례 일괄", "—", "없음", "Elasticsearch 또는 SQLite FTS 통합 인덱스"],
    ["English HSK", "영문 관세율표", "tariff (EN label)", "부분", "영문 품목명·해설 EN 필드"],
    ["MyHS", "회원 저장 HSK", "—", "없음", "user_hs 테이블 + 인증"],
    ["회원·유료", "로그인·구독", "관리자만", "없음", "B2C 회원 DB·결제(선택)"],
    ["메인 환율", "USD/EUR/CNY/GBP", "—", "없음", "환율 API"],
    ["NCOM 실적", "—", "cas-ncom import/export", "초과", "CLHS 없음·사내 전용"],
    ["OPEN API·AI", "—", "openlaw·RAG", "초과", "CLHS 없음·백오피스"],
]

DATA_CHECKLIST = [
    ["tariff.db", "관세율표·HS", "보유", "961K items · 41국 · 2017–2026", "인도(IN) 추가"],
    ["hs_manual_complete.db", "HS 해설·속견", "보유", "39,677", "English 필드"],
    ["ciel.db", "수출입요령·세율", "부분", "482/1025 usable", "CLHS 로그인 재크롤"],
    ["clip_precedent.db", "판례", "보유", "3,768", "CLIP 동기화"],
    ["clip_question.db", "질의", "보유", "1,263", "CLIP 동기화"],
    ["admin_rules.db", "행정규칙·고시", "보유", "28,394", "lawlist taxonomy"],
    ["smart_law_ai.db", "OPEN API·FTA", "보유", "openlaw 141 · PSR 123K", "lawlist 통합"],
    ["환율·통관환율", "도구", "없음", "—", "관세청/한은 API"],
    ["무역통계부호", "도구", "없음", "—", "KCS 코드表 수집"],
    ["세율 encyclopedia", "세율 메뉴", "없음", "—", "CLHS duty/* 크롤"],
    ["회원·MyHS", "분류사례", "없음", "—", "신규 DB"],
    ["CMS 공지·News", "게시판", "없음", "—", "신규 CMS"],
]


def main() -> None:
    out_ko, out_en = doc_output_paths()
    out_ko.parent.mkdir(parents=True, exist_ok=True)
    doc = Document()
    setup_document(doc)

    # 표지
    t = doc.add_paragraph()
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(t.add_run("CLHS형 관세·HS 포털 구축\n상세 비교·분석 보고서"), size=22, bold=True, color=RGBColor(0x1E, 0x2F, 0x4F))
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(
        sub.add_run(
            f"씨엘HS(clhs.co.kr) ↔ 스마트법령AI\n"
            f"문서 버전: V{DOC_VERSION}\n"
            f"작성일: {date.today().isoformat()}\n"
            "목적: CLHS와 유사한 사이트 구축을 위한 메뉴별 데이터·기능 갭 분석"
        ),
        size=11,
        color=MUTED,
    )
    doc.add_page_break()

    # 목차
    add_section_heading(doc, "목  차", 1)
    toc = [
        "1. 개요",
        "2. 종합 비교표 (CLHS 하위항목 ↔ 스마트법령AI)",
        "3. CLHS GNB(상단 메뉴) 구조",
        "4. 메뉴별 상세 비교 (4.1~4.8)",
        "5. 공통 기능·부가 영역",
        "6. 데이터 보유·추가 수집 체크리스트",
        "7. 환경변수 (.env) CLHS 연동",
        "8. CLHS형 사이트 구축 로드맵",
        "9. 부록",
    ]
    for item in toc:
        p = doc.add_paragraph(item, style="List Number")
        for run in p.runs:
            set_run_font(run, size=11)
    doc.add_page_break()

    # 1. 개요
    add_section_heading(doc, "1. 개요", 1)
    add_body(
        doc,
        "본 보고서는 씨엘HS(www.clhs.co.kr) 8대 GNB 메뉴를 기준으로 "
        "스마트법령AI의 대응 화면·SQLite DB·API를 메뉴·하위항목 단위로 매칭하고, "
        "CLHS형 공개 포털 구축 시 추가로 필요한 데이터·기능을 정리합니다.",
    )
    add_callout(
        doc,
        "핵심 결론",
        "• 데이터: 관세율표·HS해설·판례/질의는 즉시 활용 가능\n"
        "• 콘텐츠: 수출입요령(ciel) 47% 로그인벽 → CLHS_ID/PW 재크롤\n"
        "• UI: 8개 GNB를 단일 포털로 통합 (현재 admin-shell 분산)\n"
        "• 신규: 도구·게시판·통합검색·회원 — Phase 3 이후",
    )
    stats = master_comparison_stats(MASTER_COMPARISON)
    add_styled_table(
        doc,
        ["구분", "건수/비율"],
        [
            ["CLHS GNB 메뉴", "8개"],
            ["종합표 하위·세부 항목", f"{stats['total']}건"],
            ["매칭 양호", f"{stats['양호']}건"],
            ["매칭 부분", f"{stats['부분']}건"],
            ["매칭 없음", f"{stats['없음']}건"],
            ["스마트법령AI 전용(초과)", f"{stats['초과']}건"],
        ],
        col_widths_cm=[6, 10],
    )

    # 2. 종합 비교표 (문서 앞 — 핵심)
    add_section_heading(doc, "2. 종합 비교표 (CLHS 하위항목 ↔ 스마트법령AI)", 1)
    add_body(
        doc,
        "CLHS GNB 8개 메뉴의 하위·세부 항목을 스마트법령AI 화면·DB와 1:1 매칭한 종합표입니다. "
        "매칭도: 양호(즉시 활용) · 부분(데이터/UI 일부) · 없음(미구현) · 초과(CLHS 없음·사내 전용).",
    )
    add_callout(
        doc,
        "종합 집계",
        f"총 {stats['total']}항목 · 양호 {stats['양호']} · 부분 {stats['부분']} · "
        f"없음 {stats['없음']} · 초과 {stats['초과']}",
    )
    add_styled_table(
        doc,
        ["#", "GNB", "CLHS 하위항목", "스마트법령AI", "DB·API", "매칭", "비고"],
        numbered_master_rows(MASTER_COMPARISON),
        col_widths_cm=[0.6, 1.4, 2.8, 2.8, 2.2, 0.9, 2.3],
        body_font_size=7,
        header_font_size=7,
    )
    doc.add_page_break()

    # 3. GNB
    add_section_heading(doc, "3. CLHS GNB(상단 메뉴) 구조", 1)
    add_styled_table(
        doc,
        ["#", "GNB", "URL", "스마트법령AI 대응", "커버"],
        [
            ["1", "관세율표", "tariffbase.asp", "HS정보(속견·관세율·해설)", "부분"],
            ["2", "분류사례", "userHSlist.asp", "품목분류 국내/외국", "부분"],
            ["3", "세율", "Y2026/duty.asp", "씨엘SITE·tariff·openlaw", "부분"],
            ["4", "수출입요령", "Y2026/iolaw.asp", "씨엘SITE·FTA 원산지", "부분"],
            ["5", "관련법령", "lawlist.asp", "OPEN API·행정규칙·Supabase", "부분"],
            ["6", "판례·예규", "Cuslist.asp", "관세포털 판례/질의", "양호"],
            ["7", "도구", "tool.asp", "—", "없음"],
            ["8", "게시판", "commu.asp", "—", "없음"],
        ],
        col_widths_cm=[0.8, 2.2, 3.2, 4.5, 1.5],
    )
    doc.add_page_break()

    # 4. 메뉴별
    add_section_heading(doc, "4. 메뉴별 상세 비교", 1)
    add_body(doc, "아래 4.1~4.8은 CLHS 실제 화면·ciel.db 16목차·DB 실측 기준입니다.")
    for menu in MENUS:
        add_menu_section(doc, menu)

    # 5. 공통
    add_section_heading(doc, "5. 공통 기능·부가 영역", 1)
    add_styled_table(
        doc,
        ["기능", "CLHS", "스마트법령AI", "매칭", "추가 필요"],
        CROSS_CUTTING,
        col_widths_cm=[2.5, 3.5, 3.0, 1.5, 5.5],
    )
    doc.add_page_break()

    # 6. 체크리스트
    add_section_heading(doc, "6. 데이터 보유·추가 수집 체크리스트", 1)
    add_styled_table(
        doc,
        ["데이터", "용도", "상태", "규모", "추가 작업"],
        DATA_CHECKLIST,
        col_widths_cm=[3.0, 2.5, 1.5, 3.5, 5.5],
    )
    doc.add_page_break()

    # 7. env
    add_section_heading(doc, "7. 환경변수 (.env.local) — CLHS 연동", 1)
    add_styled_table(
        doc,
        ["변수", "용도", "연동"],
        [
            ["CLHS_ID", "clhs.co.kr 로그인 ID", "정의만 — 크롤러 미연결"],
            ["CLHS_PW", "clhs.co.kr 비밀번호", "정의만 — 크롤러 미연결"],
            ["CIEL_DB_PATH", "수출입요령 크롤 DB", "→ D:/SQLiteDB/ciel.db"],
            ["TARIFF_SCHEDULE_DB_PATH", "관세율표", "→ D:/SQLiteDB/tariff.db"],
            ["CLIP_PRECEDENT_DB_PATH", "판례", "→ clip_precedent.db"],
            ["CLIP_QUESTION_DB_PATH", "질의", "→ clip_question.db"],
            ["SMART_LAW_SQLITE_DB_PATH", "OPEN API·FTA", "→ smart_law_ai.db"],
        ],
        col_widths_cm=[4.5, 5.5, 6.0],
    )
    add_callout(
        doc,
        "보안",
        "CLHS_ID·CLHS_PW 값은 본 문서에 기재하지 않습니다. "
        "ciel.db 543건 로그인벽 해소·duty.asp·iolaw 상세 크롤 시 .env에서 로드하세요.",
        fill=WARN_BG,
    )

    # 8. roadmap
    add_section_heading(doc, "8. CLHS형 사이트 구축 로드맵", 1)
    phases = [
        (
            "Phase 1 (4~6주) — 포털 골격 + 데이터 有 메뉴",
            "① GNB 8메뉴 + LNB + 통합 레이아웃\n"
            "② 관세율표(tariff+속견표) CLHS tariffbase 레이아웃\n"
            "③ 분류사례 domestic-cases CLHS 그리드\n"
            "④ Cuslist = precedents + inquiry 통합\n"
            "⑤ 우측 외부링크(관세청·법령·CLIP·FTA) 정적",
        ),
        (
            "Phase 2 (4~8주) — 콘텐츠 보강",
            "① CLHS_ID/PW 로그인 크롤 → ciel.db 갱신\n"
            "② 수출입요령 iolaw 10목차 완성\n"
            "③ lawlist 법령 통합 인덱스\n"
            "④ 세율 duty.asp encyclopedia 수집",
        ),
        (
            "Phase 3 (8주+) — CLHS 부가 기능",
            "① 통합검색 FTS\n"
            "② HS비교 · English HSK\n"
            "③ 도구(환율·국가코드·세액계산기)\n"
            "④ CMS 공지·News",
        ),
        (
            "Phase 4 — 백오피스 분리",
            "OPEN API·NCOM·CAS·AI → admin.smart-law-ai (사내)",
        ),
    ]
    for title, body in phases:
        add_section_heading(doc, title, 2)
        add_body(doc, body)

    doc.add_page_break()

    # 9. appendix
    add_section_heading(doc, "9. 부록", 1)
    add_section_heading(doc, "9.1 분석 방법", 2)
    add_bullets(
        doc,
        [
            "CLHS: clhs.co.kr 실화면·첨부 스크린샷 9장 (2026-09-09)",
            "스마트법령AI: admin-shell.tsx, app/lib/*, ciel-db.ts",
            "DB: D:/SQLiteDB/*.db COUNT 실측",
            "ciel usable: isCielLoginWallContent() — 482/1025",
        ],
    )
    add_section_heading(doc, "9.2 스마트법령AI 전체 메뉴 (admin-shell)", 2)
    add_styled_table(
        doc,
        ["그룹", "메뉴명", "경로", "CLHS GNB", "비고"],
        ADMIN_SHELL_MENUS,
        col_widths_cm=[2.8, 3.2, 4.5, 2.2, 1.8],
        body_font_size=8,
        header_font_size=8,
    )

    add_section_heading(doc, "9.3 문서 버전 이력", 2)
    add_styled_table(
        doc,
        ["버전", "일자", "변경 내용"],
        [[v, d, note] for v, d, note in VERSION_HISTORY],
        col_widths_cm=[1.5, 2.5, 12.0],
    )
    add_body(
        doc,
        f"현재 파일: {DOC_BASE_NAME_KO}V{DOC_VERSION}.docx · "
        f"생성: scripts/gen-clhs-analysis-docx.py",
        size=9,
    )

    foot = doc.add_paragraph()
    foot.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_run_font(
        foot.add_run(
            f"— smart-law-ai · CLHS형 포털 구축 분석 V{DOC_VERSION} (내부용) —"
        ),
        size=9,
        color=MUTED,
    )

    doc.save(out_ko)
    doc.save(out_en)
    print(f"wrote {out_ko}")
    print(f"wrote {out_en}")


if __name__ == "__main__":
    main()
