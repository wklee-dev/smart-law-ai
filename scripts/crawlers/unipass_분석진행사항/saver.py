"""
saver.py
크롤링 결과 저장 모듈

역할:
  - 파싱된 분석결과 데이터를 엑셀(.xlsx)로 저장
  - SQLite DB에도 동시 저장 (중복 방지, 누적 관리)
  - 엑셀 입력 파일(customs_ids.xlsx)에서 통관고유부호 읽기
"""

import sqlite3
import logging
from datetime import datetime
from pathlib import Path

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
import pandas as pd

logger = logging.getLogger(__name__)

# ── 결과 엑셀 컬럼 정의 (key, 헤더명, 너비) ────────────────────────────────
RESULT_COLUMNS = [
    ("통관고유부호", "통관고유부호",  18),
    ("anay_no",      "분석번호",      14),
    ("문서번호",     "문서번호",      16),
    ("안내일자",     "안내일자",      13),
    ("화주",         "화주",          22),
    ("신고인",       "신고인",        24),
    ("발신세관",     "발신세관",      14),
    ("신고번호",     "신고번호",      22),
    ("신고일자",     "신고일자",      13),
    ("발신자",       "발신자",        14),
    ("란규격번호",   "란-규격번호",   13),
    ("신고품명",     "신고품명",      24),
    ("회보품명",     "회보품명",      32),
    ("상표",         "상표",          14),
    ("모델규격",     "모델규격",      32),
    ("신고세번",     "신고세번",      16),
    ("결정세번",     "결정세번",      16),
    ("물품설명",     "물품설명",      36),
    ("분류의견",     "분류의견",      52),
    ("참고사항",     "참고사항",      52),
    ("크롤링상태",   "크롤링상태",    14),
]


# ── 엑셀 입력 파일 읽기 ─────────────────────────────────────────────────────

def load_customs_ids_from_excel(filepath: str) -> list[dict]:
    """
    통관고유부호 엑셀 파일에서 사용여부='Y'인 항목을 읽어 반환합니다.

    Args:
        filepath: customs_ids.xlsx 경로

    Returns:
        [{"회사명": ..., "통관고유부호": ...}, ...]
    """
    if not Path(filepath).exists():
        logger.error(f"엑셀 파일 없음: {filepath}")
        return []

    try:
        df = pd.read_excel(filepath, sheet_name=0, dtype=str)
        df.columns = [str(c).strip() for c in df.columns]
        df = df.fillna("")

        # 사용여부 컬럼이 있으면 Y인 것만 필터
        if "사용여부" in df.columns:
            df = df[df["사용여부"].str.upper() == "Y"]

        # 통관고유부호 컬럼 탐지
        id_col = None
        for candidate in ["통관고유부호", "통관고유 부호", "customs_id", "csclUniqSgn"]:
            if candidate in df.columns:
                id_col = candidate
                break

        if not id_col:
            logger.error(f"통관고유부호 컬럼을 찾을 수 없음. 컬럼: {list(df.columns)}")
            return []

        company_col = None
        for candidate in ["회사명", "company_name", "업체명"]:
            if candidate in df.columns:
                company_col = candidate
                break

        result = []
        for _, row in df.iterrows():
            cid = str(row[id_col]).strip()
            if cid:
                result.append({
                    "통관고유부호": cid,
                    "회사명": str(row[company_col]).strip() if company_col else "",
                })

        logger.info(f"통관고유부호 {len(result)}개 로드")
        return result

    except Exception as e:
        logger.error(f"엑셀 파일 읽기 오류: {e}")
        return []


# ── SQLite 저장 ─────────────────────────────────────────────────────────────

def init_db(db_path: str = "unipass_results.db") -> sqlite3.Connection:
    """
    SQLite DB 초기화 및 테이블 생성.
    db_path 예) "D:\\SQLiteDB\\unipass_bunsuk.db"
    상위 디렉토리가 없으면 자동 생성합니다.
    """
    import os
    db_dir = os.path.dirname(db_path)
    if db_dir:
        Path(db_dir).mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS analysis_results (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            crawled_at      TEXT NOT NULL,
            통관고유부호    TEXT,
            분석번호        TEXT,
            문서번호        TEXT,
            안내일자        TEXT,
            화주            TEXT,
            신고인          TEXT,
            발신세관        TEXT,
            신고번호        TEXT,
            신고일자        TEXT,
            발신자          TEXT,
            란규격번호      TEXT,
            신고품명        TEXT,
            회보품명        TEXT,
            상표            TEXT,
            모델규격        TEXT,
            신고세번        TEXT,
            결정세번        TEXT,
            물품설명        TEXT,
            분류의견        TEXT,
            참고사항        TEXT,
            크롤링상태      TEXT,
            UNIQUE(분석번호, 신고번호, 란규격번호)
        )
    """)
    conn.commit()
    logger.info(f"DB 초기화 완료: {db_path}")
    return conn


def save_to_db(conn: sqlite3.Connection, records: list[dict]) -> tuple[int, int]:
    """
    분석결과를 SQLite에 저장합니다.
    분석번호(UNIQUE) 기준으로 중복 방지.

    Returns:
        (inserted_count, skipped_count)
    """
    cursor = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    inserted = 0
    skipped = 0

    for rec in records:
        # 분석번호가 없으면 신고번호+란규격번호 조합으로 중복 체크
        anay_no_val = rec.get("anay_no", "") or ""
        신고번호_val = rec.get("신고번호", "") or ""
        란규격번호_val = rec.get("란규격번호", "") or ""

        # 이미 존재하는지 확인
        if anay_no_val:
            cursor.execute(
                "SELECT id FROM analysis_results WHERE 분석번호=? AND 분석번호 != ''",
                (anay_no_val,)
            )
        else:
            cursor.execute(
                "SELECT id FROM analysis_results WHERE 신고번호=? AND 란규격번호=? AND 신고번호 != ''",
                (신고번호_val, 란규격번호_val)
            )
        if cursor.fetchone():
            skipped += 1
            continue

        try:
            cursor.execute("""
                INSERT OR IGNORE INTO analysis_results (
                    crawled_at, 통관고유부호, 분석번호, 문서번호, 안내일자,
                    화주, 신고인, 발신세관, 신고번호, 신고일자, 발신자,
                    란규격번호, 신고품명, 회보품명, 상표, 모델규격,
                    신고세번, 결정세번, 물품설명, 분류의견,
                    참고사항, 크롤링상태
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
            """, (
                now,
                rec.get("통관고유부호", ""),
                rec.get("anay_no", ""),
                rec.get("문서번호", ""),
                rec.get("안내일자", ""),
                rec.get("화주", ""),
                rec.get("신고인", ""),
                rec.get("발신세관", ""),
                rec.get("신고번호", ""),
                rec.get("신고일자", ""),
                rec.get("발신자", ""),
                rec.get("란규격번호", ""),
                rec.get("신고품명", ""),
                rec.get("회보품명", ""),
                rec.get("상표", ""),
                rec.get("모델규격", ""),
                rec.get("신고세번", ""),
                rec.get("결정세번", ""),
                rec.get("물품설명", ""),
                rec.get("분류의견", ""),
                rec.get("참고사항", ""),
                rec.get("크롤링상태", ""),
            ))
            if cursor.rowcount > 0:
                inserted += 1
            else:
                skipped += 1
        except Exception as e:
            logger.error(f"DB 저장 오류 ({rec.get('anay_no', 'N/A')}): {e}")

    conn.commit()
    logger.info(f"DB 저장: 신규 {inserted}건, 중복 스킵 {skipped}건")
    return inserted, skipped


# ── 엑셀 저장 ───────────────────────────────────────────────────────────────

def save_to_excel(records: list[dict], output_path: str):
    """
    분석결과를 서식이 적용된 엑셀 파일로 저장합니다.
    파일이 이미 존재하면 새 시트를 추가합니다.
    """
    if not records:
        logger.warning("저장할 데이터 없음")
        return

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 기존 파일 있으면 열기, 없으면 새로 생성
    if output_path.exists():
        wb = openpyxl.load_workbook(output_path)
    else:
        wb = openpyxl.Workbook()
        if "Sheet" in wb.sheetnames:
            del wb["Sheet"]

    # 시트 이름: 실행일시
    sheet_name = datetime.now().strftime("%Y%m%d_%H%M")
    ws = wb.create_sheet(title=sheet_name)

    # ── 스타일 정의 ──────────────────────────────────────────────────────
    header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79",
                              fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True, size=10)
    success_fill = PatternFill(start_color="EBF3FB", end_color="EBF3FB",
                               fill_type="solid")
    fail_fill = PatternFill(start_color="FFE0E0", end_color="FFE0E0",
                            fill_type="solid")
    center_align = Alignment(horizontal="center", vertical="center",
                             wrap_text=True)
    left_align = Alignment(horizontal="left", vertical="center",
                           wrap_text=True)
    thin_border = Border(
        left=Side(style="thin"), right=Side(style="thin"),
        top=Side(style="thin"), bottom=Side(style="thin"),
    )

    # ── 헤더 행 ──────────────────────────────────────────────────────────
    for col_idx, (_, header, _) in enumerate(RESULT_COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align
        cell.border = thin_border

    # ── 데이터 행 ────────────────────────────────────────────────────────
    for row_idx, rec in enumerate(records, start=2):
        is_success = rec.get("크롤링상태", "") == "성공"
        row_fill = success_fill if is_success else fail_fill

        for col_idx, (key, header, _) in enumerate(RESULT_COLUMNS, start=1):
            value = rec.get(key, "")
            cell = ws.cell(row=row_idx, column=col_idx,
                           value=str(value) if value else "")
            cell.fill = row_fill
            cell.border = thin_border
            # 긴 텍스트 컬럼은 왼쪽 정렬
            if key in ("분류의견", "물품설명", "참고사항", "회보품명", "모델규격"):
                cell.alignment = left_align
            else:
                cell.alignment = center_align

    # ── 열 너비 설정 ─────────────────────────────────────────────────────
    for col_idx, (_, _, width) in enumerate(RESULT_COLUMNS, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    ws.row_dimensions[1].height = 22
    ws.freeze_panes = "A2"

    wb.save(output_path)
    logger.info(f"엑셀 저장 완료: {output_path} (시트: {sheet_name}, {len(records)}건)")
    print(f"  엑셀 저장: {output_path}")


def export_db_to_excel(db_path: str, output_path: str):
    """DB 전체 데이터를 엑셀로 내보내기"""
    conn = sqlite3.connect(db_path)
    df = pd.read_sql_query(
        "SELECT * FROM analysis_results ORDER BY crawled_at DESC", conn
    )
    conn.close()

    if df.empty:
        logger.warning("DB에 데이터 없음")
        print("  DB에 저장된 데이터가 없습니다.")
        return

    df.to_excel(output_path, index=False, sheet_name="전체결과")
    logger.info(f"DB 전체 내보내기 완료: {output_path} ({len(df)}건)")
    print(f"  내보내기 완료: {output_path} ({len(df)}건)")
