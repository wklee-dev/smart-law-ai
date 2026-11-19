"""Generate the corrected Korean V3 guide; inspect schema only in memory.

This utility writes only the guide DOCX, never application data or downloads.
"""
from __future__ import annotations

import ast
import json
import sqlite3
from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "국민참여입법센터_통합입법예고_실행가이드_V3.docx"
SOURCE = ROOT / "src" / "national_law_notice_crawler.py"
FONT = "Malgun Gothic"
BLUE = "214D68"
LEGISLATION_MINISTRIES = (
    "재정경제부", "관세청", "산업통상부", "국토교통부", "해양수산부",
    "식품의약품안전처", "기후에너지환경부", "농림축산식품부",
)
ADMINISTRATIVE_MINISTRIES = (
    "재정경제부", "산업통상부", "국토교통부", "해양수산부",
    "기후에너지환경부", "농림축산식품부",
)
DB_PATH = r"D:\SQLiteDB\smart_law_ai.db"
DOWNLOAD_ROOT = r"C:\SQLiteDB\downloads"

# Every actual schema column has its own description; schema drift fails generation.
COLUMN_HELP = {
    "nlc_week_crawl_history": {
        "run_id": "실행 식별자. 실행마다 새 행을 추가한다.",
        "period_type": "기간 방식: ISO_WEEK 또는 DATE_RANGE.",
        "iso_year": "ISO 연도. 직접 기간은 시작일의 ISO 연도.",
        "iso_week": "ISO 주차. 직접 기간은 시작일의 ISO 주차.",
        "week_start_date": "선택 기간의 시작일(YYYY-MM-DD).",
        "week_end_date": "선택 기간의 종료일(YYYY-MM-DD).",
        "requested_notices": "JSON 배열: legislation 및/또는 administrative.",
        "requested_ministries": "두 화면의 실제 고정 기관 목록을 담은 JSON. 미요청 화면은 []. 기존 SQL NULL은 보존.",
        "download_files": "파일 다운로드 여부(1: 다운로드, 0: 메타데이터만).",
        "delay_seconds": "요청 사이 최소 대기 시간(초).",
        "started_at": "실행 시작 시각(시간대 포함 ISO 문자열).",
        "ended_at": "실행 종료 시각. 진행 중에는 NULL.",
        "status": "RUNNING, SUCCESS, PARTIAL, FAILED 중 하나.",
        "legislation_discovered": "입법예고 목록 중 고정 8개 부처에 일치한 수. 상세 제한 적용 전.",
        "legislation_completed": "이번 실행에서 입법예고 상세 저장을 완료한 수.",
        "administrative_discovered": "행정예고 목록 중 고정 6개 기관에 일치한 수. 상세 제한 적용 전.",
        "administrative_completed": "이번 실행에서 행정예고 상세 저장을 완료한 수.",
        "attachment_discovered": "실제로 처리한 상세 화면에서 발견한 첨부 수.",
        "attachment_downloaded": "이번 실행에서 파일 다운로드에 성공한 수.",
        "attachment_reused": "기존 성공 파일을 재사용한 수.",
        "attachment_failed": "이번 실행의 첨부 다운로드 실패 수.",
        "error_count": "목록·상세·첨부·실행 단계 오류 수.",
        "error_summary": "오류 메시지의 앞선 최대 10건 요약.",
        "program_version": "실행 프로그램 버전. V3 신규 실행은 3.0.0.",
        "created_at": "행 생성 시각. SQLite CURRENT_TIMESTAMP 기본값(UTC).",
    },
    "nlc_ministry_legislation_notice": {
        "notice_sequence": "포털 입법예고 일련번호. 공고 upsert 기준.",
        "source_url": "입법예고 원문 상세 URL.",
        "title": "상세 화면의 법령 제명.",
        "department": "필터에 사용한 목록의 소관부처명. 별칭·조직명을 임의 통합하지 않는다.",
        "law_type": "법령종류(상세 우선, 목록 보완).",
        "law_field": "법령분야(상세 우선, 목록 보완).",
        "target_audience": "상세의 적용대상.",
        "notice_number": "상세의 공고번호.",
        "announcement_date": "상세 공고일자를 YYYY-MM-DD로 정규화.",
        "start_date": "접수 시작일(상세 우선, 목록 보완).",
        "end_date": "접수 종료일(상세 우선, 목록 보완).",
        "view_count": "목록 조회수를 정수로 변환.",
        "detail_info_json": "상세 정보 전체 항목을 한글 보존 JSON으로 저장.",
        "body_html": "detailContent 요소를 포함한 본문 HTML 전문.",
        "body_text": "본문 전문을 추출하고 공백을 정규화한 텍스트.",
        "body_sha256": "UTF-8 body_text의 SHA-256. HTML 해시가 아니다.",
        "first_collected_at": "최초 수집 시각. 재수집 시 보존.",
        "last_collected_at": "마지막 상세 저장 시각.",
        "last_run_id": "마지막 저장 실행 번호 → 이력 run_id.",
    },
    "nlc_ministry_administrative_notice": {
        "notice_sequence": "포털 행정예고 일련번호. 공고 upsert 기준.",
        "source_url": "행정예고 원문 상세 URL.",
        "title": "상세 화면의 행정예고명.",
        "rule_type": "행정규칙 종류(상세 우선, 목록 보완).",
        "institution": "상세 기관 우선, 목록 기관명 보완. 수집 대상 판정은 상세가 아닌 목록 기관명으로 수행.",
        "notice_number": "상세 공고번호 또는 목록 공고번호.",
        "announcement_date": "상세 공고일자를 YYYY-MM-DD로 정규화.",
        "start_date": "예고 시작일(상세 우선, 목록 보완).",
        "end_date": "예고 종료일(상세 우선, 목록 보완).",
        "phone": "상세의 전화번호.",
        "fax": "상세의 팩스번호.",
        "email": "상세의 전자메일.",
        "view_count": "목록 조회수를 정수로 변환.",
        "detail_info_json": "상세 정보 전체 항목을 한글 보존 JSON으로 저장.",
        "body_html": "detailContent 요소를 포함한 본문 HTML 전문.",
        "body_text": "본문 전문을 추출하고 공백을 정규화한 텍스트.",
        "body_sha256": "UTF-8 body_text의 SHA-256.",
        "first_collected_at": "최초 수집 시각. 재수집 시 보존.",
        "last_collected_at": "마지막 상세 저장 시각.",
        "last_run_id": "마지막 저장 실행 번호 → 이력 run_id.",
    },
    "nlc_notice_attachment": {
        "attachment_id": "첨부파일 내부 식별자.",
        "notice_type": "legislation 또는 administrative.",
        "notice_sequence": "관련 공고 일련번호. 공고 테이블에 직접 FK는 없다.",
        "file_sequence": "포털 파일 일련번호. 복합 UNIQUE 키의 일부.",
        "category": "상세 화면의 첨부 구분.",
        "file_name": "화면에 표시된 원본 파일명.",
        "download_url": "파일 일련번호와 다운로드 토큰으로 구성한 URL.",
        "local_path": "성공 파일의 로컬 절대 경로. 기존 경로를 자동 이관하지 않는다.",
        "file_size": "저장 파일 크기(바이트).",
        "checksum_sha256": "다운로드 성공 시 계산한 파일 SHA-256.",
        "download_status": "PENDING, SUCCESS, FAILED 중 하나.",
        "download_error": "첨부 다운로드 오류 메시지(최대 4,000자).",
        "first_seen_at": "최초 발견 시각. upsert 시 보존.",
        "last_seen_at": "이번 실행에서 마지막으로 확인한 시각.",
        "downloaded_at": "SUCCESS 기록 시각. 재사용 때도 갱신될 수 있다.",
        "last_run_id": "마지막 확인 실행 번호 → 이력 run_id.",
    },
    "nlc_crawl_error": {
        "error_id": "오류 내부 식별자. 발생할 때마다 새 행 추가.",
        "run_id": "오류가 속한 실행 번호 → 이력 run_id.",
        "notice_type": "오류 화면 구분. 실행 오류 등은 NULL 가능.",
        "notice_sequence": "오류 공고 일련번호. 목록/실행 오류는 NULL 가능.",
        "stage": "발생 단계: list, detail, attachment, run.",
        "source_url": "오류가 발생한 요청 URL. 실행 단계는 NULL 가능.",
        "error_message": "오류 메시지(최대 4,000자).",
        "occurred_at": "오류 발생 시각(시간대 포함 ISO 문자열).",
    },
}


def source_schema() -> sqlite3.Connection:
    """Check constants/CLI with AST; execute only schema in an in-memory DB."""
    tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
    names = {"SCHEMA_SQL", "PROGRAM_VERSION", "LEGISLATION_MINISTRIES", "ADMINISTRATIVE_MINISTRIES"}
    constants = {}
    paths = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id in names:
                    constants[target.id] = ast.literal_eval(node.value)
                elif isinstance(target, ast.Name) and target.id in {"DEFAULT_DB_PATH", "DEFAULT_DOWNLOAD_ROOT"}:
                    paths[target.id] = ast.literal_eval(node.value.args[0])
    expected = {
        "PROGRAM_VERSION": "3.0.0",
        "LEGISLATION_MINISTRIES": LEGISLATION_MINISTRIES,
        "ADMINISTRATIVE_MINISTRIES": ADMINISTRATIVE_MINISTRIES,
    }
    if any(constants.get(key) != value for key, value in expected.items()):
        raise ValueError("Guide institution lists/version do not match the current source.")
    if paths != {"DEFAULT_DB_PATH": DB_PATH, "DEFAULT_DOWNLOAD_ROOT": DOWNLOAD_ROOT}:
        raise ValueError("Guide storage paths do not match the current source.")
    actual_flags = {
        argument.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "add_argument"
        for argument in node.args
        if isinstance(argument, ast.Constant) and isinstance(argument.value, str) and argument.value.startswith("--")
    }
    expected_flags = {
        "--year", "--week", "--start-date", "--end-date", "--notices", "--skip-downloads",
        "--force-download", "--max-items", "--delay", "--log-level", "--limit",
    }
    if actual_flags != expected_flags:
        raise ValueError(f"Guide CLI coverage differs from source: {actual_flags ^ expected_flags}")
    connection = sqlite3.connect(":memory:")
    connection.executescript(constants["SCHEMA_SQL"])
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'nlc_%'")}
    if tables != COLUMN_HELP.keys():
        raise ValueError("Guide table coverage differs from source.")
    for table, descriptions in COLUMN_HELP.items():
        actual = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
        if actual != descriptions.keys():
            raise ValueError(f"Column descriptions differ for {table}: {actual ^ descriptions.keys()}")
    return connection


def font(run, *, size: float = 9, bold: bool = False, color: str | None = None) -> None:
    run.font.name = FONT
    run._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), "맑은 고딕")
    run.font.size = Pt(size)
    run.bold = bold
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def shade(cell, fill: str) -> None:
    element = OxmlElement("w:shd")
    element.set(qn("w:fill"), fill)
    cell._tc.get_or_add_tcPr().append(element)


def cell_text(cell, text: str, *, header: bool = False) -> None:
    cell.text = ""
    cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
    paragraph = cell.paragraphs[0]
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(0)
    paragraph.paragraph_format.line_spacing = 1.03
    paragraph.paragraph_format.widow_control = True
    font(paragraph.add_run(text), size=8.1, bold=header, color="FFFFFF" if header else None)
    margins = OxmlElement("w:tcMar")
    for side in ("top", "bottom", "left", "right"):
        node = OxmlElement(f"w:{side}")
        node.set(qn("w:w"), "45" if side in {"top", "bottom"} else "75")
        node.set(qn("w:type"), "dxa")
        margins.append(node)
    cell._tc.get_or_add_tcPr().append(margins)


def add_table(doc, headers: list[str], rows: list[list[str]], widths: list[float]):
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.autofit = False
    for column, width in zip(table.columns, widths):
        column.width = Cm(width)
    for values in rows:
        for cell, value in zip(table.add_row().cells, values):
            cell_text(cell, value)
    for cell, label in zip(table.rows[0].cells, headers):
        cell_text(cell, label, header=True)
        shade(cell, BLUE)
    repeat = OxmlElement("w:tblHeader")
    table.rows[0]._tr.get_or_add_trPr().append(repeat)
    for row_number, row in enumerate(table.rows):
        row._tr.get_or_add_trPr().append(OxmlElement("w:cantSplit"))
        for index, cell in enumerate(row.cells):
            cell.width = Cm(widths[index])
            if row_number and row_number % 2 == 0:
                shade(cell, "F1F5F7")
            if row_number == 0:
                for paragraph in cell.paragraphs:
                    paragraph.paragraph_format.keep_with_next = True
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(0)
    spacer.paragraph_format.space_before = Pt(0)
    font(spacer.add_run(""), size=2)
    spacer.paragraph_format.line_spacing = Pt(2)
    return table


def heading(doc, text: str, level: int = 1) -> None:
    paragraph = doc.add_heading(text, level)
    paragraph.paragraph_format.space_before = Pt(8 if level == 1 else 6)
    paragraph.paragraph_format.space_after = Pt(5)
    paragraph.paragraph_format.keep_with_next = True
    font(paragraph.runs[0], size=14 if level == 1 else 10.5, bold=True, color=BLUE)


def paragraph(doc, text: str, *, note: bool = False) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.line_spacing = 1.12
    p.paragraph_format.widow_control = True
    font(p.add_run(text), size=8.6 if note else 9, color="4A5B65" if note else None)


def new_page(doc, title: str) -> None:
    heading(doc, title)
    doc.paragraphs[-1].paragraph_format.page_break_before = True


def add_schema(doc, db, table: str) -> None:
    rows = []
    foreign_keys = {row[3]: f"FK → {row[2]}({row[4]})" for row in db.execute(f"PRAGMA foreign_key_list({table})")}
    for _, name, kind, required, default, primary_key in db.execute(f"PRAGMA table_info({table})"):
        constraints = [kind]
        if primary_key:
            constraints.append("PK")
            if name in {"run_id", "attachment_id", "error_id"}:
                constraints.append("AUTOINCREMENT")
        if required:
            constraints.append("NOT NULL")
        if default is not None:
            constraints.append(f"DEFAULT {default}")
        meaning = COLUMN_HELP[table][name]
        if name in foreign_keys:
            meaning += "\n" + foreign_keys[name]
        rows.append([name, " · ".join(constraints), meaning])
    widths = [5.4, 5.2, 7.0] if table == "nlc_week_crawl_history" else [5.8, 4.0, 7.8]
    add_table(doc, ["컬럼명", "선언·제약", "저장 의미"], rows, widths)


def setup(doc) -> None:
    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(1.5)
    section.bottom_margin = Cm(1.5)
    section.left_margin = Cm(1.7)
    section.right_margin = Cm(1.7)
    section.header_distance = Cm(0.65)
    section.footer_distance = Cm(0.65)
    normal = doc.styles["Normal"]
    normal.font.name = FONT
    normal.font.size = Pt(9)
    normal._element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:eastAsia"), "맑은 고딕")
    header = section.header.paragraphs[0]
    font(header.add_run("국민참여입법센터  |  통합입법예고 실행 가이드 V3"), size=7.5, color="4A5B65")
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    font(footer.add_run("V3 · 2026-11-10   |   "), size=7.5, color="4A5B65")
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)
    doc.core_properties.title = "국민참여입법센터 통합입법예고 실행 가이드 V3"
    doc.core_properties.subject = "프로그램 3.0.0 · 고정 기관 목록 필터 · Windows 실행 · 전체 SQLite 스키마"
    doc.core_properties.author = "Manus AI"
    doc.core_properties.version = "3.0.0"
    doc.core_properties.language = "ko-KR"


def filters_json(kinds: tuple[str, ...]) -> str:
    return json.dumps({
        "legislation": list(LEGISLATION_MINISTRIES) if "legislation" in kinds else [],
        "administrative": list(ADMINISTRATIVE_MINISTRIES) if "administrative" in kinds else [],
    }, ensure_ascii=False)


def make_document() -> None:
    db = source_schema()
    doc = Document()
    setup(doc)
    week_start = date.fromisocalendar(2026, 46, 1).isoformat()
    week_end = date.fromisocalendar(2026, 46, 7).isoformat()

    # Page 1 — corrected scope and exact list-row filtering.
    title = doc.add_paragraph()
    title.paragraph_format.space_before = Pt(4)
    title.paragraph_format.space_after = Pt(10)
    font(title.add_run("국민참여입법센터\n통합입법예고 실행 가이드 V3"), size=21, bold=True, color=BLUE)
    add_table(doc, ["항목", "적용 기준"], [
        ["문서 / 프로그램", "V3 / 3.0.0 · 작성일 2026-11-10 · 최신 요구사항 반영"],
        ["기본 수집", "--notices all: 입법예고 고정 8개 + 행정예고 고정 6개 기관. all은 두 화면을 뜻하며 전체 기관 수집이 아님."],
        ["고정 저장", f"DB: {DB_PATH}\n첨부 루트: {DOWNLOAD_ROOT}"],
    ], [3.2, 14.4])
    heading(doc, "1. 전 페이지 조회 후 목록 행의 기관명 필터")
    paragraph(doc, "기간 내 전체 목록을 끝 페이지까지 읽고, 각 목록 행에서 추출한 소관부처(입법예고) 또는 기관(행정예고)이 아래 고정 목록에 정확히 일치하는 공고만 상세로 방문한다. 드롭다운 콤보 선택, 부처 코드 탐색, 서버 측 기관 검색, 키워드 검색을 사용하지 않는다. 기관 목록을 선택·해제하는 CLI도 제공하지 않는다.")
    add_table(doc, ["입법예고 · LEGISLATION_MINISTRIES (8)", "행정예고 · ADMINISTRATIVE_MINISTRIES (6)"], [
        [name, ADMINISTRATIVE_MINISTRIES[index] if index < len(ADMINISTRATIVE_MINISTRIES) else "—"]
        for index, name in enumerate(LEGISLATION_MINISTRIES)
    ], [8.8, 8.8])
    paragraph(doc, "행정예고는 전체 기관이 아니다. 관세청·식품의약품안전처는 입법예고 목록에만 포함한다. 산하기관·소속기관 이름, 부분 일치, 구 명칭(기획재정부·산업통상자원부·환경부 등)을 자동 포함하지 않는다. 셀의 괄호 안 법령종류/공고번호를 분리하고 공백을 정리한 기관명 자체를 정확히 비교한다.", note=True)
    add_table(doc, ["단계", "실행 규칙"], [
        ["① 목록 전수 조회", "기간과 페이지 조건으로 모든 목록 페이지 조회. 대상 공고가 0건인 페이지도 건너뛰거나 조기 종료하지 않음."],
        ["② 목록 필터", "입법: 목록의 소관부처 / 행정: 목록의 기관으로 판정. 비대상 행은 상세 방문·본문 저장·첨부 다운로드를 하지 않음."],
        ["③ 상세 처리", "일치한 행만 제목·메타데이터·본문 HTML/텍스트 전문·첨부 메타데이터 및 파일 처리. --max-items는 필터 후 화면별 적용."],
        ["④ 검증", "기간 유지·전체 건수·페이지 중복·파싱 누락 검증. 기관명을 확인할 수 없는 목록 행은 오류로 처리."],
    ], [3.2, 14.4])
    paragraph(doc, "입법은 시작일(stYd/edYd)에 종료 공고 포함(finishIncludeYn=Y)·직제 포함(isOgYn=Y)을 적용한다. 행정은 예고일자(stYd/edYd) 기준이며 기관 검색 조건을 추가하지 않는다.", note=True)

    # Page 2 — structure, installation and Windows command tables.
    new_page(doc, "2. 프로그램 구조·설치·Windows 실행")
    add_table(doc, ["경로 / 구성요소", "역할"], [
        ["run.py", "src 경로 등록 후 main()을 호출하는 명령행 진입점."],
        ["run.bat", "프로젝트 폴더에서 Python 실행. 받은 인수(%*)를 그대로 전달하고 Python 종료 코드를 반환. 자동 shutdown 없음."],
        ["src/national_law_notice_crawler.py", "기간 검증, RateLimitedClient, 목록·상세·첨부 파서, NoticeCrawler, Database, CLI·이력 출력."],
        ["requirements.txt / tests/", "의존성 목록 / 단위·회귀 테스트. 결과는 별도 로그로 확인."],
        [DB_PATH, "공고·첨부·오류·실행 이력 SQLite. 경로 인수 없음."],
        [DOWNLOAD_ROOT, "화면 폴더 → 공고 일련번호 → 파일일련번호_파일명. 경로 인수 없음."],
    ], [6.4, 11.2])
    heading(doc, "2.1 설치와 기존 버전 업그레이드", 2)
    paragraph(doc, "Windows에 Python 3.10 이상, 인터넷 연결, D: 드라이브 및 고정 폴더 쓰기 권한이 필요하다. 명령 프롬프트에서 프로젝트 폴더(run.py와 requirements.txt가 있는 위치)로 이동한다. 날짜를 생략한 자동 기본 기간은 없으며 아래 직접 기간이 대표 예시다.")
    add_table(doc, ["순서", "명령 또는 조치"], [
        ["설치", "python --version\npython -m pip install -r requirements.txt"],
        ["업그레이드", "실행 중인 프로그램을 중지하고 DB·downloads를 백업한다. 새 버전의 run.py + src/ + requirements.txt를 프로그램 폴더에 복사·덮어쓴다."],
        ["기존 데이터 보존", f"{DB_PATH}와 {DOWNLOAD_ROOT}를 삭제·덮어쓰지 않는다. 이전 데이터와 첨부파일은 삭제·이동되지 않으며 local_path도 일괄 자동 변경되지 않는다."],
        ["의존성 갱신", "python -m pip install --upgrade -r requirements.txt\nbeautifulsoup4>=4.12,<5 / lxml>=5,<7 / requests>=2.31,<3 / python-docx>=1.1,<2"],
    ], [2.7, 14.9])
    heading(doc, "2.2 Windows 실행 예시: 명령은 한 줄로 입력", 2)
    add_table(doc, ["목적", "명령"], [
        ["대표 직접 기간 / 기본 두 화면", "python run.py crawl --start-date 20260301 --end-date 20261110"],
        ["입법예고 고정 8개만", "python run.py crawl --start-date 20260301 --end-date 20261110 --notices legislation"],
        ["행정예고 고정 6개만", "python run.py crawl --start-date 20260301 --end-date 20261110 --notices administrative"],
        ["ISO 주차 / 기본 두 화면", "python run.py crawl --year 2026 --week 46"],
        ["Windows 래퍼 / 직접 기간", "run.bat crawl --start-date 20260301 --end-date 20261110"],
        ["Windows 래퍼 / 주차", "run.bat crawl --year 2026 --week 46"],
        ["소량 상세 / 파일 미저장", "python run.py crawl --year 2026 --week 46 --skip-downloads --max-items 3"],
        ["이력 조회", "python run.py history\npython run.py history --limit 50\nrun.bat history --limit 50"],
    ], [4.0, 13.6])
    paragraph(doc, f"2026년 46주차는 {week_start} ~ {week_end}(월~일)이다. 종료일은 문서 작성일 이후이므로 해당 주의 공고가 모두 존재한다는 뜻은 아니다. run.bat는 crawl 또는 history와 필요한 인수를 지정하여 실행한다.", note=True)

    # Page 3 — full CLI and literal history JSON, with no obsolete selection flags.
    new_page(doc, "3. CLI 전체 옵션과 고정 기관 이력")
    add_table(doc, ["명령 / 옵션", "기본값·선택값", "동작 / 제약"], [
        ["crawl / history", "필수 하위 명령", "crawl은 기간 필수. history는 고정 DB의 최근 실행 조회."],
        ["--year / --week", "정수 / 정수", "ISO 연도·주차 함께 입력. 유효한 ISO 주차만 허용."],
        ["--start-date / --end-date", "YYYYMMDD", "실제 날짜 두 개, 시작일 ≤ 종료일. 주차 입력과 동시 사용 불가."],
        ["--notices", "all (기본)\nlegislation / administrative", "두 화면 / 입법만 / 행정만. 각 화면의 고정 기관 목록은 바뀌지 않음."],
        ["--skip-downloads", "미지정", "본문·첨부 메타데이터 저장. 파일 요청하지 않으며 신규 첨부는 PENDING."],
        ["--force-download", "미지정", "성공 파일도 다시 요청. --skip-downloads가 있으면 파일 요청하지 않음."],
        ["--max-items", "0 (전체)", "필터 후 화면별 상세 처리 최대 수. 모든 목록 페이지는 읽음. 음수는 0 처리."],
        ["--delay", "0.35초", "HTTP 요청 사이 최소 대기 시간. 음수는 0 처리."],
        ["--log-level", "INFO", "crawl: DEBUG / INFO / WARNING / ERROR."],
        ["history --limit", "30", "최근 이력 표시 수. run_id 내림차순."],
        ["-h / --help", "argparse 기본 도움말", "python run.py --help / python run.py crawl --help / python run.py history --help"],
    ], [4.5, 4.2, 8.9])
    paragraph(doc, "DB·다운로드 경로 인수와 기관 선택 인수는 없다. --notices all은 두 종류를 실행한다는 뜻이지 모든 부처·기관을 수집한다는 뜻이 아니다.", note=True)
    heading(doc, "3.1 requested_ministries: 실제 목록을 JSON으로 기록", 2)
    paragraph(doc, "TEXT 컬럼에 아래 JSON을 한글 그대로 저장한다. legislation과 administrative 키는 항상 함께 있으며, 요청한 화면에는 실제 고정 목록, 요청하지 않은 화면에는 빈 배열 []을 기록한다. 새 실행은 전체 기관 표시값을 저장하지 않는다.")
    add_table(doc, ["실행 범위", "requested_ministries 실제 저장값"], [
        ["all (기본)", filters_json(("legislation", "administrative"))],
        ["legislation", filters_json(("legislation",))],
        ["administrative", filters_json(("administrative",))],
        ["기존 이력", "컬럼 자체가 SQL NULL이면 과거 기관 필터 이력 미상. 새 목록으로 소급 채우지 않는다. 과거 JSON도 그대로 보존한다."],
    ], [2.8, 14.8])
    heading(doc, "3.2 기존 DB를 보존하는 추가형 마이그레이션", 2)
    paragraph(doc, "CREATE TABLE / INDEX IF NOT EXISTS 후 PRAGMA table_info로 이력 컬럼을 확인한다. requested_ministries가 없으면 ALTER TABLE nlc_week_crawl_history ADD COLUMN requested_ministries TEXT로 추가한다. 기존 행의 SQL NULL, run_id·버전·JSON은 변경하지 않는다.")
    paragraph(doc, "더 오래된 DB에서 period_type이 없으면 TEXT NOT NULL DEFAULT 'ISO_WEEK'로 추가한다. 기존 테이블 삭제·재작성 및 DB·파일 이동은 하지 않는다. history 명령도 DB 초기화와 이 추가형 마이그레이션을 적용하지만 공고를 수집하지 않는다.", note=True)

    # Page 4 — every history column and counter semantics.
    new_page(doc, "4. SQLite 상세 — 실행 이력")
    paragraph(doc, "표는 현재 소스의 신규 CREATE TABLE 선언에 있는 모든 컬럼을 나열한다. PK=기본키, FK=외래키. 별도 NOT NULL이 없으면 해당 제약은 선언되지 않았다. 앱 시각은 시간대 포함 ISO 문자열, 날짜는 YYYY-MM-DD다. 기존 DB의 추가형 변경에는 신규 테이블의 CHECK가 소급 추가되지 않는다.", note=True)
    heading(doc, "4.1 nlc_week_crawl_history", 2)
    add_schema(doc, db, "nlc_week_crawl_history")
    paragraph(doc, "CHECK: period_type IN ('ISO_WEEK','DATE_RANGE'), status IN ('RUNNING','SUCCESS','PARTIAL','FAILED'). run_id는 INTEGER PRIMARY KEY AUTOINCREMENT, FK 없음. JSON 컬럼에는 SQLite JSON 검증 제약이 없다.", note=True)
    add_table(doc, ["인덱스", "실제 정의"], [
        ["idx_nlc_history_week", "nlc_week_crawl_history(iso_year, iso_week, started_at DESC)"],
    ], [6.1, 11.5])
    heading(doc, "4.2 카운터를 읽는 기준", 2)
    paragraph(doc, "두 화면의 discovered는 고정 목록 일치 수(--max-items 적용 전), completed는 이번 상세 저장 완료 수다. 제한·오류로 completed가 작을 수 있으며 기존 DB 총 행 수와는 다르다.")
    paragraph(doc, "legislation_listed / administrative_listed는 전체 파싱 수, legislation_excluded / administrative_excluded는 비대상 수다. 로그·완료 JSON counts에만 존재하며 이력 컬럼은 없다. counts는 미발생 키를 생략할 수 있고 이력 카운터는 0으로 저장한다. 시작은 RUNNING INSERT, 종료는 상태·시각·카운터 UPDATE. 재실행도 새 run_id다.", note=True)

    # Page 5 — legislation, all index/FK definitions, notice upsert.
    new_page(doc, "5. SQLite 상세 — 부처 입법예고")
    heading(doc, "5.1 nlc_ministry_legislation_notice", 2)
    add_schema(doc, db, "nlc_ministry_legislation_notice")
    heading(doc, "5.2 PK·FK·고유 키 및 나머지 인덱스", 2)
    paragraph(doc, "두 공고 테이블의 notice_sequence는 각각 TEXT PK다. 첨부는 attachment_id PK와 UNIQUE(notice_type, notice_sequence, file_sequence)를 갖는다. 이력·첨부·오류의 정수 PK는 AUTOINCREMENT다. DB 연결마다 PRAGMA foreign_keys=ON 및 busy_timeout=5000을 설정한다.")
    add_table(doc, ["관계 / 인덱스", "실제 정의"], [
        ["공고·첨부 last_run_id", "두 공고 테이블 및 첨부 → nlc_week_crawl_history(run_id). NULL 허용. CASCADE 절 없음."],
        ["오류 run_id", "nlc_crawl_error → nlc_week_crawl_history(run_id). NOT NULL. CASCADE 절 없음."],
        ["공고 직접 참조", "첨부·오류 notice_sequence에는 공고 테이블 FK 없음. notice_type과 함께 논리적으로 연결."],
        ["idx_nlc_legislation_dates", "nlc_ministry_legislation_notice(start_date, end_date)"],
        ["idx_nlc_administrative_dates", "nlc_ministry_administrative_notice(start_date, end_date)"],
        ["idx_nlc_attachment_notice", "nlc_notice_attachment(notice_type, notice_sequence)"],
    ], [6.1, 11.5])
    heading(doc, "5.3 공고 upsert와 과거 자료 보존", 2)
    paragraph(doc, "두 공고 테이블 모두 ON CONFLICT(notice_sequence) DO UPDATE로 URL·메타데이터·본문·해시·last_collected_at·last_run_id를 갱신하고 first_collected_at은 보존한다. 제목 또는 본문 HTML/텍스트가 없는 상세 응답은 오류 처리하여 기존 공고를 덮어쓰지 않는다. 필터에서 제외된 기존 공고를 삭제하거나 재분류하지 않는다.")

    # Page 6 — administrative schema and exact console/summary fields.
    new_page(doc, "6. SQLite 상세 — 부처 행정예고 및 조회")
    heading(doc, "6.1 nlc_ministry_administrative_notice", 2)
    add_schema(doc, db, "nlc_ministry_administrative_notice")
    paragraph(doc, "행정예고도 목록의 기관명이 고정 6개 목록과 정확히 일치할 때만 상세를 방문한다. 저장 institution은 상세 기관 우선·목록 기관 보완이지만 대상 판단 기준은 목록 기관명이다. 산하기관·구 명칭·나머지 기관은 상세나 첨부를 요청하지 않는다.")
    heading(doc, "6.2 history 출력과 완료 JSON", 2)
    add_table(doc, ["history 콘솔 열", "DB 컬럼 / 표시 내용"], [
        ["run_id / period", "run_id / period_type 및 ISO 주차 또는 직접 날짜 범위"],
        ["institution_filters", "requested_ministries 해석. 입법·행정 실제 목록 / 미수집 / 이전 버전(기관 필터 이력 없음)"],
        ["status", "status (실행 상태)"],
        ["legislation / administrative", "legislation_completed / administrative_completed"],
        ["downloaded / reused / failed", "attachment_downloaded / attachment_reused / attachment_failed"],
        ["errors / started_at", "error_count / started_at"],
    ], [5.4, 12.2])
    paragraph(doc, "crawl 완료 JSON의 키: run_id, period_type, week, institution_filters, date_range, status, counts, database, download_root, errors. institution_filters는 이력 JSON과 같은 두 고정 목록/빈 배열이며 counts에 실행용 listed/excluded가 포함된다. 상세 오류는 nlc_crawl_error에서 run_id로 확인한다.", note=True)
    paragraph(doc, "과거 SQL NULL 이력은 '이전 버전(기관 필터 이력 없음)'으로 표시한다. 기존 JSON에 남은 전체 표시값은 '전체(이전 방식)'으로 읽을 뿐, 신규 실행에서 전체 기관을 선택할 수 있다는 뜻은 아니다.", note=True)

    # Page 7 — every attachment/error column and file behavior.
    new_page(doc, "7. SQLite 상세 — 첨부파일과 오류")
    heading(doc, "7.1 nlc_notice_attachment", 2)
    add_schema(doc, db, "nlc_notice_attachment")
    paragraph(doc, "CHECK: notice_type IN ('legislation','administrative'), download_status IN ('PENDING','SUCCESS','FAILED'). ON CONFLICT(notice_type, notice_sequence, file_sequence) DO UPDATE로 첨부 메타데이터·상태·last_seen_at·last_run_id 갱신, first_seen_at 보존. 경로·크기·해시의 신규 값이 NULL이면 COALESCE로 기존 값 유지. PENDING만으로 기존 SUCCESS를 낮추지 않는다.", note=True)
    heading(doc, "7.2 nlc_crawl_error", 2)
    add_schema(doc, db, "nlc_crawl_error")
    paragraph(doc, "오류마다 INSERT·커밋한다. stage에는 열거형 CHECK가 없고 오류 테이블의 별도 명시 인덱스도 없다. SQLite가 PK/UNIQUE용으로 생성하는 내부 인덱스 외 명시 인덱스는 4·5절의 4개다. 공고·첨부 성공은 개별 커밋하므로 일부 실패가 기존 성공 결과를 전체 롤백하지 않는다.", note=True)
    heading(doc, "7.3 신규 첨부 저장 구조", 2)
    paragraph(doc, r"C:\SQLiteDB\downloads\(부처)입법예고\공고일련번호\파일일련번호_파일명. 행정은 화면 폴더만 (부처)행정예고로 구분. 금지 문자는 밑줄로 치환, 최종 파일명은 최대 180자. .part 임시 파일에 저장 후 0바이트 여부를 확인하여 최종 파일로 교체한다. 기존 파일을 이동하거나 local_path를 일괄 자동 변경하는 기능은 없다.", note=True)

    # Page 8 — operation/exit rules and honest verification status.
    new_page(doc, "8. 재실행·종료 코드·운영 확인")
    heading(doc, "8.1 파일 재사용·재다운로드", 2)
    paragraph(doc, "DB 상태가 SUCCESS이고 local_path의 파일이 존재하며 0바이트보다 크면 기존 경로에서 재사용한다. SHA-256을 재비교하지 않으므로 비어 있지 않은 손상은 자동 감지한다고 가정하지 않는다. 누락·0바이트·실패 파일은 다시 요청한다. --force-download로 재다운로드하면 성공 시 고정 루트의 새 경로로 해당 첨부의 local_path가 갱신될 수 있으나, 이는 전체 과거 경로의 자동 이관이 아니다.")
    add_table(doc, ["목적", "Windows 명령"], [
        ["같은 기간 재실행", "python run.py crawl --start-date 20260301 --end-date 20261110"],
        ["성공 파일도 재다운로드", "python run.py crawl --year 2026 --week 46 --force-download"],
        ["오류 확인", "python run.py history --limit 50\nSQLite에서 nlc_crawl_error를 해당 run_id로 조회"],
    ], [4.3, 13.3])
    heading(doc, "8.2 종료 코드와 완료 상태", 2)
    add_table(doc, ["결과", "코드", "판단 기준"], [
        ["SUCCESS", "0", "기록된 오류 없음. history 정상 조회도 0. 제한 실행의 성공은 전체 상세·파일 검증을 뜻하지 않음."],
        ["PARTIAL", "2", "목록·상세·첨부의 일부 오류. 성공 데이터는 보존. 오류 확인 후 동일 기간 재실행."],
        ["FAILED / 치명적 오류", "1", "실행 수준 예외. DB 열기 등 시작 전 오류는 이력이 없을 수 있음."],
        ["입력 오류", "비정상", "하위 명령 누락·미지원 인수 등 argparse 오류는 통상 2. 혼합·잘못된 기간 검증 오류는 1."],
        ["RUNNING", "미완료", "진행 중 또는 강제 중단 후 잔존 상태. 완료로 판단하지 않음."],
        ["첨부 PENDING", "별개", "--skip-downloads로 파일 미저장. 오류가 없으면 실행은 SUCCESS일 수 있음."],
    ], [3.5, 1.6, 12.5])
    paragraph(doc, "run.bat는 인수 전달과 종료 코드 반환만 하며 자동 shutdown을 실행하지 않는다. 기존에 별도의 종료 배치를 쓰는 경우에도 실패·부분 실패 때 종료되지 않는지 사용자가 확인해야 한다. 본 프로그램이나 가이드가 종료 동작을 추가하지 않는다.")
    heading(doc, "8.3 포털 부하·검증 항목", 2)
    paragraph(doc, "기본 요청 간격 0.35초. GET 네트워크 오류와 HTTP 429/500/502/503/504는 제한적으로 재시도한다(최대 재시도 설정 3, backoff_factor 0.8). 기간 조건 소실·전체 건수 변경·반복 페이지·파싱 누락·기관명 확인 실패는 오류로 기록한다. 오류가 있는 화면은 전체 성공 수집으로 해석하지 않는다.")
    paragraph(doc, "테스트는 진행 중이다. 본 문서는 테스트 성공 건수나 최신 실사이트 수집 성공을 확정하지 않는다. 아래 명령은 실행 예시이며 실제 결과는 별도 로그로 확인한다. 고정 목록 비교·대상 없는 중간 페이지·비대상 상세 미요청·필터 후 제한·이력 JSON/SQL NULL 보존·본문 전문·첨부 및 종료 코드를 점검한다.")
    add_table(doc, ["검증", "명령 / 주의사항"], [
        ["단위·회귀", "python -m unittest discover -s tests -v"],
        ["실사이트 소량 상세 점검", "python run.py crawl --year 2026 --week 46 --max-items 1\n목록은 전 페이지 요청하고 일치 공고의 상세만 화면별 최대 1건 처리. 전체 실사이트 검증과 구분."],
    ], [3.7, 13.9])
    heading(doc, "8.4 문서 기준과 대상 화면", 2)
    paragraph(doc, "기준: 최신 수정 요구사항 및 현행 run.py, run.bat, requirements.txt, src/national_law_notice_crawler.py 전체 코드·SCHEMA_SQL. 이 문서 생성은 메모리 DB에서 스키마만 확인하며 운영 DB·첨부파일을 열거나 변경하지 않는다.", note=True)
    add_table(doc, ["대상 화면", "현행 코드의 공식 목록 URL"], [
        ["(부처)입법예고", "https://opinion.lawmaking.go.kr/gcom/ogLmPp"],
        ["(부처)행정예고", "https://opinion.lawmaking.go.kr/gcom/admpp"],
    ], [3.7, 13.9])
    db.close()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print(OUT)


if __name__ == "__main__":
    make_document()
