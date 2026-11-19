#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
관세법령정보포털 - 품목분류 외국사례 크롤러
URL: https://unipass.customs.go.kr/clip/prlstclsfsrch/openULS0203048S.do

기능:
  - 국가별(전체/미국/EU/영국/중국/일본 등 16개국) 품목분류 외국사례 목록 조회
  - 각 사례의 상세 정보(원문/영문/국문) 수집 - 국가별 모든 항목 포함
  - 이미지 파일 다운로드 (이미지가 있는 경우)
  - 결과를 SQLite DB 파일로 저장 (기본 경로: D:\\SQLiteDB\\smart_law_ai.db)
  - ISO 주차(YYYY-WW) 입력 지원 → 해당 주 월요일~일요일로 자동 변환
  - 수집 이력 관리 (crawl_history 테이블)

국가별 수집 항목:
  US(미국)     : 기준년도, 참조번호, 시행일자, 결정세번, 시행기관, Category, 회신, 물품설명, 이슈장소, 키워드, 관련이미지
  EU(유럽연합) : 기준년도, 참조번호, 시행일자, 결정세번, 물품설명, 분류사유, 이슈장소, 키워드, 관련이미지
  GB(영국)     : 기준년도, 참조번호, 시행일자, 결정세번, 물품설명, 분류사유, 이슈장소, 키워드, 관련이미지
  JP(일본)     : 기준년도, 참조번호, 시행일자, 결정세번, 품명, 물품설명, 분류사유, 세관, 키워드, 관련이미지
  TH(태국)     : 기준년도, 참조번호, 시행일자, 결정세번, 품명, 회신, 기타품명, 물품설명, 재질성분, 용도, 결정사유, 키워드, 관련이미지
  CA(캐나다)   : 기준년도, 참조번호, 시행일자, 결정세번, 품명, 기타품명, 회신, 물품설명, 결정사유, 키워드, 관련이미지
  TW(대만)     : 기준년도, 참조번호, 등록일자, 결정세번, 품명, 품명선언, 재질성분, 용도, 결정사유, 이슈장소, 키워드, 관련이미지
  CN(중국)     : 기준년도, 참조번호, 시행일자, 결정세번, 품명, 다른이름, 물품설명, 결정사유, 이슈장소, 키워드, 관련이미지
  PH(필리핀)   : 기준년도, 참조번호, 시행일자, 결정세번, 품명, 물품설명, 결정사유, 관련이미지
  CL(칠레)     : 기준년도, 참조번호, 시행일자, 결정세번, 품명, 물품설명, 관련이미지
  SG(싱가포르) : 기준년도, 참조번호, 결정세번, 품명, 기타품명, 관련이미지
  IN(인도)     : 기준년도, 참조번호, 시행일자, 결정세번, 품명, 기타품명, 물품설명 및 결정사유, 관련이미지
  CH(스위스)   : 기준년도, 참조번호, 시행일자, 결정세번, 품명, 물품설명, 결정사유, 키워드, 관련이미지
  BD(방글라데시): 기준년도, 참조번호, 시행일자, 결정세번, Category, 품명, 관련이미지
  AU(호주)     : 기준년도, 참조번호, 시행일자, 결정세번, 물품설명, 결정사유, 관련이미지
  KH(캄보디아) : 기준년도, 참조번호, 시행일자, 결정세번, 품명, 관련이미지

사용법:
  python3 customs_foreign_cases_crawler.py [옵션]

옵션 예시:
  python3 customs_foreign_cases_crawler.py --week 2025-14
  python3 customs_foreign_cases_crawler.py --week 2025-14 --country ALL
  python3 customs_foreign_cases_crawler.py --start 20250401 --end 20250407
  python3 customs_foreign_cases_crawler.py --stats
  python3 customs_foreign_cases_crawler.py --history
"""

import os
import re
import time
import sqlite3
import argparse
import logging
from datetime import datetime, timedelta
from pathlib import Path

import ssl
import requests
import urllib3
from requests.adapters import HTTPAdapter
from urllib3.util.ssl_ import create_urllib3_context
from bs4 import BeautifulSoup

# SSL 경고 비활성화 (정부 사이트 인증서 이슈 대응)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class _TLSAdapter(HTTPAdapter):
    """정부 사이트 TLS 호환성을 위한 커스텀 SSL 어댑터"""

    def init_poolmanager(self, *args, **kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
        kwargs["ssl_context"] = ctx
        return super().init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, proxy, **proxy_kwargs):
        ctx = create_urllib3_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
        proxy_kwargs["ssl_context"] = ctx
        return super().proxy_manager_for(proxy, **proxy_kwargs)


# ──────────────────────────────────────────────
# 상수 정의
# ──────────────────────────────────────────────
BASE_URL = "https://unipass.customs.go.kr/clip"

LIST_API   = f"{BASE_URL}/prlstclsfsrch/retrievePrlstClsfCaseLst.do"
DETAIL_API = f"{BASE_URL}/prlstclsfsrch/retrievePrlstClsfCaseDtl.do"
IMAGE_API  = f"{BASE_URL}/framework/filedownload/kcs4gImageDownload.do"

# 국가 탭 코드 매핑
COUNTRY_TABS = {
    "ALL": "전체",
    "US":  "미국",
    "EU":  "유럽연합(EU)",
    "GB":  "영국",
    "CN":  "중국",
    "JP":  "일본",
    "TW":  "대만",
    "CL":  "칠레",
    "AU":  "호주",
    "TH":  "태국",
    "SG":  "싱가포르",
    "PH":  "필리핀",
    "KH":  "캄보디아",
    "IN":  "인도",
    "CA":  "캐나다",
    "BD":  "방글라데시",
    "CH":  "스위스",
}

# ALL 수집 시 순서 (ALL 제외 16개국)
ALL_COUNTRIES = ["US", "EU", "GB", "CN", "JP", "TW", "CL", "AU",
                 "TH", "SG", "PH", "KH", "IN", "CA", "BD", "CH"]

# EU 탭으로 조회되는 회원국 코드
EU_MEMBER_CODES = {
    "DE", "NL", "AT", "FR", "BE", "IT", "ES", "PT", "PL", "CZ",
    "SK", "HU", "RO", "BG", "HR", "SI", "EE", "LV", "LT", "FI",
    "SE", "DK", "IE", "GR", "CY", "LU", "MT",
}

# 상세 조회 시 사용하는 Referer URL 매핑
REFERER_MAP = {
    "ALL": f"{BASE_URL}/prlstclsfsrch/openULS0203048S.do",
    "US":  f"{BASE_URL}/prlstclsfsrch/openULS0203013S.do",
    "EU":  f"{BASE_URL}/prlstclsfsrch/openULS0203017S.do",
    "GB":  f"{BASE_URL}/prlstclsfsrch/openULS0203088S.do",
    "CN":  f"{BASE_URL}/prlstclsfsrch/openULS0203023S.do",
    "JP":  f"{BASE_URL}/prlstclsfsrch/openULS0203020S.do",
    "TW":  f"{BASE_URL}/prlstclsfsrch/openULS0203034S.do",
    "CL":  f"{BASE_URL}/prlstclsfsrch/openULS0203044S.do",
    "AU":  f"{BASE_URL}/prlstclsfsrch/openULS0203050S.do",
    "TH":  f"{BASE_URL}/prlstclsfsrch/openULS0203060S.do",
    "SG":  f"{BASE_URL}/prlstclsfsrch/openULS0203064S.do",
    "PH":  f"{BASE_URL}/prlstclsfsrch/openULS0203068S.do",
    "KH":  f"{BASE_URL}/prlstclsfsrch/openULS0203072S.do",
    "IN":  f"{BASE_URL}/prlstclsfsrch/openULS0203076S.do",
    "CA":  f"{BASE_URL}/prlstclsfsrch/openULS0203080S.do",
    "BD":  f"{BASE_URL}/prlstclsfsrch/openULS0203084S.do",
    "CH":  f"{BASE_URL}/prlstclsfsrch/openULS0203092S.do",
}

# EU 회원국 코드에 대한 Referer는 EU 탭 URL 사용
for _eu_cd in EU_MEMBER_CODES:
    REFERER_MAP[_eu_cd] = REFERER_MAP["EU"]

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/html, */*",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "X-Requested-With": "XMLHttpRequest",
}

# SQLite DB 기본 경로 (Windows 환경 기준)
DEFAULT_DB_PATH = r"D:\SQLiteDB\smart_law_ai.db"

# ──────────────────────────────────────────────
# 로깅 설정
# ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


def setup_year_log_handler(log_dir: str, year: str, country_code: str) -> logging.FileHandler:
    """
    연도별 오류 로그 파일 핸들러 설정.
    LOG/{year}_{country}.log 파일에 WARNING 이상 로그를 기록.
    """
    log_path = Path(log_dir) / f"{year}_{country_code}.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    handler = logging.FileHandler(log_path, encoding="utf-8")
    handler.setLevel(logging.WARNING)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))
    logging.getLogger().addHandler(handler)
    logger.info("오류 로그 파일: %s", log_path)
    return handler


def remove_log_handler(handler: logging.FileHandler):
    """로그 핸들러 제거 및 파일 닫기"""
    if handler:
        logging.getLogger().removeHandler(handler)
        handler.close()


# ──────────────────────────────────────────────
# 주차 변환 유틸리티
# ──────────────────────────────────────────────

def parse_week(week_str: str):
    """
    ISO 주차 문자열(YYYY-WW)을 (start_dt, end_dt, iso_year, iso_week, monday, sunday) 튜플로 변환.
    ISO 8601 기준: 주는 월요일에 시작하고 일요일에 끝남.
    """
    m = re.fullmatch(r"(\d{4})-(\d{1,2})", week_str.strip())
    if not m:
        raise ValueError(
            f"주차 형식이 올바르지 않습니다: '{week_str}'\n"
            "올바른 형식: YYYY-WW (예: 2025-14)"
        )
    iso_year = int(m.group(1))
    iso_week = int(m.group(2))

    if not (1 <= iso_week <= 53):
        raise ValueError(f"주차 번호는 1~53 범위여야 합니다: {iso_week}")

    try:
        monday = datetime.strptime(f"{iso_year}-W{iso_week:02d}-1", "%G-W%V-%u")
    except ValueError:
        raise ValueError(f"{iso_year}년에는 {iso_week}주차가 존재하지 않습니다.")

    sunday = monday + timedelta(days=6)

    return (
        monday.strftime("%Y%m%d"),
        sunday.strftime("%Y%m%d"),
        iso_year,
        iso_week,
        monday,
        sunday,
    )


def week_label(iso_year: int, iso_week: int) -> str:
    """'YYYY-WW' 형식 주차 레이블 반환"""
    return f"{iso_year}-{iso_week:02d}"


# ──────────────────────────────────────────────
# SQLite DB 관리 클래스
# ──────────────────────────────────────────────
class CasesDB:
    """
    품목분류 외국사례 SQLite DB 관리 클래스

    테이블 구조:
      - foreign_cases         : 사례 메인 테이블 (1건 = 1행) - 전체 국가 모든 항목 포함
      - foreign_case_images   : 이미지 테이블 (1건 = N행)
      - foreign_crawl_history : 수집 이력 테이블 (실행 1회 = 1행)
      ※ 국내사례 case_images / crawl_history 와 혼동 금지
    """

    DDL_CASES = """
    CREATE TABLE IF NOT EXISTS foreign_cases (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        prlst_clsf_srno     TEXT    NOT NULL,        -- 목록 일련번호 (국가+일련번호 복합 UNIQUE)
        country             TEXT,                    -- 국가명 (한글)
        country_code        TEXT,                    -- 실제 국가코드 (US, DE, NL, JP, ...)
        tab_country_code    TEXT,                    -- 탭 국가코드 (EU 탭에서 조회된 DE/NL은 EU로 저장)
        base_year           TEXT,                    -- 기준년도
        ref_no              TEXT,                    -- 참조번호
        enforce_date        TEXT,                    -- 시행일자 (TW는 등록일자)
        hs_code             TEXT,                    -- 결정세번 (HS 코드) - TEXT UNLIMITED
        image_count         INTEGER DEFAULT 0,       -- 이미지 수
        -- ── 국가별 고유 항목 ──────────────────────────
        issue_org           TEXT,                    -- 시행기관 (US)
        category            TEXT,                    -- Category (US, BD)
        customs_office      TEXT,                    -- 세관 (JP)
        goods_name          TEXT,                    -- 품명 (JP, TH, CA, SG, IN, CH, BD, TW, CN, PH, KH, CL)
        goods_name_etc      TEXT,                    -- 기타품명 (TH, CA, SG, IN)
        goods_name_decl     TEXT,                    -- 품명선언 (TW)
        other_name          TEXT,                    -- 다른이름 (CN)
        material            TEXT,                    -- 재질성분 (TH, TW)
        purpose             TEXT,                    -- 용도 (TH, TW)
        issue_place         TEXT,                    -- 이슈장소 (US, EU, GB, TW, CN)
        keyword             TEXT,                    -- 키워드 (US, EU, GB, JP, TH, CA, TW, CN, CH)
        -- ── 회신 (원문/영문/국문) ─────────────────────
        reply_org           TEXT,                    -- 회신 (원문) - TEXT UNLIMITED
        reply_eng           TEXT,                    -- 회신 (영문) - TEXT UNLIMITED
        reply_kor           TEXT,                    -- 회신 (국문) - TEXT UNLIMITED
        -- ── 물품설명 (원문/영문/국문) ─────────────────
        goods_desc_org      TEXT,                    -- 물품설명 (원문) - TEXT UNLIMITED
        goods_desc_eng      TEXT,                    -- 물품설명 (영문) - TEXT UNLIMITED
        goods_desc_kor      TEXT,                    -- 물품설명 (국문) - TEXT UNLIMITED
        -- ── 분류/결정 사유 (원문/영문/국문) ──────────
        reason_org          TEXT,                    -- 분류/결정사유 (원문) - TEXT UNLIMITED
        reason_eng          TEXT,                    -- 분류/결정사유 (영문) - TEXT UNLIMITED
        reason_kor          TEXT,                    -- 분류/결정사유 (국문) - TEXT UNLIMITED
        -- ── 메타 ──────────────────────────────────────
        crawled_at          TEXT DEFAULT (datetime('now', 'localtime')),
        -- 국가코드 + 일련번호 복합 UNIQUE (국가간 SRNO 충돌 방지)
        UNIQUE (country_code, prlst_clsf_srno)
    );
    """

    DDL_IMAGES = """
    CREATE TABLE IF NOT EXISTS foreign_case_images (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        country_code    TEXT    NOT NULL DEFAULT '',  -- 국가코드 (SRNO 충돌 방지)
        case_srno       TEXT    NOT NULL,
        seq             INTEGER NOT NULL,
        image_url       TEXT    NOT NULL,
        image_data      BLOB,                         -- 이미지 바이너리 데이터 (직접 저장)
        image_ext       TEXT,                         -- 이미지 확장자 (.jpg, .png 등)
        image_size      INTEGER,                      -- 이미지 파일 크기 (bytes)
        local_path      TEXT,
        UNIQUE (country_code, case_srno, seq)
    );
    """

    DDL_HISTORY = """
    CREATE TABLE IF NOT EXISTS foreign_crawl_history (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        run_at          TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
        week_label      TEXT,
        iso_year        INTEGER,
        iso_week        INTEGER,
        start_dt        TEXT    NOT NULL,
        end_dt          TEXT    NOT NULL,
        country_code    TEXT    NOT NULL,
        keyword         TEXT,
        hs_code         TEXT,
        ref_no          TEXT,
        total_found     INTEGER DEFAULT 0,
        saved_count     INTEGER DEFAULT 0,
        list_only       INTEGER DEFAULT 0,
        status          TEXT    DEFAULT 'success',
        error_msg       TEXT
    );
    """

    DDL_INDEXES = [
        "CREATE INDEX IF NOT EXISTS idx_fc_country_code  ON foreign_cases  (country_code);",
        "CREATE INDEX IF NOT EXISTS idx_fc_tab_country   ON foreign_cases  (tab_country_code);",
        "CREATE INDEX IF NOT EXISTS idx_fc_enforce_date  ON foreign_cases  (enforce_date);",
        "CREATE INDEX IF NOT EXISTS idx_fc_hs_code       ON foreign_cases  (hs_code);",
        "CREATE INDEX IF NOT EXISTS idx_fc_ref_no        ON foreign_cases  (ref_no);",
        "CREATE INDEX IF NOT EXISTS idx_fci_case_srno    ON foreign_case_images (country_code, case_srno);",
        "CREATE INDEX IF NOT EXISTS idx_fch_week         ON foreign_crawl_history (iso_year, iso_week);",
        "CREATE INDEX IF NOT EXISTS idx_fch_run_at       ON foreign_crawl_history (run_at);",
    ]

    # 마이그레이션: 기존 DB에 추가해야 할 새 컬럼 목록 (foreign_cases)
    MIGRATION_COLUMNS = [
        ("country_code",     "TEXT"),
        ("tab_country_code", "TEXT"),
        ("issue_org",        "TEXT"),
        ("category",         "TEXT"),
        ("customs_office",   "TEXT"),
        ("goods_name",       "TEXT"),
        ("goods_name_etc",   "TEXT"),
        ("goods_name_decl",  "TEXT"),
        ("other_name",       "TEXT"),
        ("material",         "TEXT"),
        ("purpose",          "TEXT"),
    ]

    # 마이그레이션: foreign_case_images 테이블에 추가해야 할 새 컬럼 목록
    MIGRATION_IMAGE_COLUMNS = [
        ("country_code", "TEXT NOT NULL DEFAULT ''"),
        ("image_data",   "BLOB"),
        ("image_ext",    "TEXT"),
        ("image_size",   "INTEGER"),
    ]

    def __init__(self, db_path: str):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        return conn

    def _table_exists(self, conn, name: str) -> bool:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
            (name,),
        ).fetchone()
        return bool(row)

    def _migrate_images_unique_constraint(self, conn):
        """
        foreign_case_images UNIQUE 제약을
        (case_srno, seq) 단독에서 (country_code, case_srno, seq) 복합으로 마이그레이션.
        국내사례 case_images 테이블은 절대 건드리지 않음.
        """
        if not self._table_exists(conn, "foreign_case_images"):
            return

        index_list = conn.execute("PRAGMA index_list(foreign_case_images)").fetchall()

        has_old_unique = False  # (case_srno, seq) 단독
        has_new_unique = False  # (country_code, case_srno, seq) 복합

        for idx in index_list:
            is_unique = idx[2]
            if not is_unique:
                continue
            idx_name = idx[1]
            cols = [r[2] for r in conn.execute(f"PRAGMA index_info('{idx_name}')").fetchall()]
            if "country_code" in cols and "case_srno" in cols and "seq" in cols:
                has_new_unique = True
            elif set(cols) == {"case_srno", "seq"}:
                has_old_unique = True

        if has_new_unique:
            logger.debug(
                "마이그레이션 불필요: foreign_case_images 이미 복합 UNIQUE 존재"
            )
            return

        if has_old_unique:
            logger.info(
                "마이그레이션: foreign_case_images UNIQUE "
                "(case_srno, seq) → (country_code, case_srno, seq) 변환 시작"
            )
            conn.execute("PRAGMA foreign_keys = OFF;")
            conn.execute(
                "CREATE TABLE foreign_case_images_bak AS "
                "SELECT * FROM foreign_case_images;"
            )
            conn.execute("DROP TABLE foreign_case_images;")
            conn.execute(self.DDL_IMAGES)
            bak_cols = [
                r[1]
                for r in conn.execute(
                    "PRAGMA table_info(foreign_case_images_bak)"
                ).fetchall()
            ]
            new_cols = [
                r[1]
                for r in conn.execute(
                    "PRAGMA table_info(foreign_case_images)"
                ).fetchall()
            ]
            common_cols = [c for c in new_cols if c != "id" and c in bak_cols]
            cols_str = ", ".join(common_cols)
            conn.execute(
                f"""
                INSERT OR IGNORE INTO foreign_case_images ({cols_str})
                SELECT {cols_str} FROM foreign_case_images_bak;
                """
            )
            conn.execute("DROP TABLE foreign_case_images_bak;")
            conn.execute("PRAGMA foreign_keys = ON;")
            logger.info(
                "마이그레이션: foreign_case_images 복합 UNIQUE 제약 변환 완료"
            )

    def _migrate_unique_constraint(self, conn):
        """
        기존 DB의 prlst_clsf_srno 단독 UNIQUE 제약을
        (country_code, prlst_clsf_srno) 복합 UNIQUE로 마이그레이션.

        SQLite의 인라인 UNIQUE(DDL 내 UNIQUE 절)는 sqlite_master.sql=None으로
        반환되므로, PRAGMA index_list + PRAGMA index_info로 컬럼 목록을 직접 확인.
        """
        # PRAGMA index_list: (seq, name, unique, origin, partial)
        index_list = conn.execute("PRAGMA index_list(foreign_cases)").fetchall()

        has_old_unique = False  # prlst_clsf_srno 단독 UNIQUE
        has_new_unique = False  # (country_code, prlst_clsf_srno) 복합 UNIQUE

        for idx in index_list:
            is_unique = idx[2]  # 1이면 UNIQUE
            if not is_unique:
                continue
            idx_name = idx[1]
            # PRAGMA index_info: (seqno, cid, name)
            cols = [r[2] for r in conn.execute(f"PRAGMA index_info('{idx_name}')").fetchall()]
            if "country_code" in cols and "prlst_clsf_srno" in cols:
                has_new_unique = True
            elif cols == ["prlst_clsf_srno"] or (len(cols) == 1 and cols[0] == "prlst_clsf_srno"):
                has_old_unique = True

        if has_new_unique:
            logger.debug("마이그레이션 불필요: 이미 복합 UNIQUE (country_code, prlst_clsf_srno) 존재")
            return

        if has_old_unique:
            logger.info("마이그레이션: prlst_clsf_srno 단독 UNIQUE → (country_code, prlst_clsf_srno) 복합 UNIQUE 변환 시작")
            conn.execute("PRAGMA foreign_keys = OFF;")

            # 1) 기존 데이터를 임시 테이블로 복사
            conn.execute("CREATE TABLE foreign_cases_bak AS SELECT * FROM foreign_cases;")

            # 2) 기존 테이블 삭제 (UNIQUE 제약 포함)
            conn.execute("DROP TABLE foreign_cases;")

            # 3) 새 스키마(복합 UNIQUE)로 테이블 재생성
            conn.execute(self.DDL_CASES)

            # 4) 기존 데이터 복원 (신규 컬럼은 NULL로)
            # 기존 백업 테이블의 컬럼 목록 확인
            bak_cols = [r[1] for r in conn.execute("PRAGMA table_info(foreign_cases_bak)").fetchall()]
            new_cols = [r[1] for r in conn.execute("PRAGMA table_info(foreign_cases)").fetchall()]
            # id 제외, 공통 컬럼만 복원
            common_cols = [c for c in new_cols if c != "id" and c in bak_cols]
            cols_str = ", ".join(common_cols)
            conn.execute(f"""
                INSERT OR IGNORE INTO foreign_cases ({cols_str})
                SELECT {cols_str} FROM foreign_cases_bak;
            """)

            # 5) 임시 테이블 삭제
            conn.execute("DROP TABLE foreign_cases_bak;")
            conn.execute("PRAGMA foreign_keys = ON;")
            logger.info("마이그레이션: 복합 UNIQUE 제약 변환 완료")

    def _init_db(self):
        """테이블 및 인덱스 초기화 + 마이그레이션"""
        with self._connect() as conn:
            conn.execute(self.DDL_CASES)
            conn.execute(self.DDL_IMAGES)
            conn.execute(self.DDL_HISTORY)

            # 1) 컬럼 마이그레이션을 인덱스 생성보다 먼저 (기존 DB 호환)
            existing_cols = {
                row[1]
                for row in conn.execute("PRAGMA table_info(foreign_cases)").fetchall()
            }
            for col_name, col_type in self.MIGRATION_COLUMNS:
                if col_name not in existing_cols:
                    conn.execute(
                        f"ALTER TABLE foreign_cases ADD COLUMN {col_name} {col_type};"
                    )
                    logger.info("마이그레이션: foreign_cases.%s 컬럼 추가 완료", col_name)

            if self._table_exists(conn, "foreign_case_images"):
                existing_img_cols = {
                    row[1]
                    for row in conn.execute(
                        "PRAGMA table_info(foreign_case_images)"
                    ).fetchall()
                }
                for col_name, col_type in self.MIGRATION_IMAGE_COLUMNS:
                    if col_name not in existing_img_cols:
                        conn.execute(
                            f"ALTER TABLE foreign_case_images "
                            f"ADD COLUMN {col_name} {col_type};"
                        )
                        logger.info(
                            "마이그레이션: foreign_case_images.%s 컬럼 추가 완료",
                            col_name,
                        )

            # 2) UNIQUE 제약 마이그레이션
            self._migrate_images_unique_constraint(conn)
            self._migrate_unique_constraint(conn)

            # 3) 인덱스 (컬럼 존재 보장 후)
            for idx_sql in self.DDL_INDEXES:
                conn.execute(idx_sql)

        logger.info("DB 초기화 완료: %s", self.db_path)

    def upsert_case(self, row: dict) -> int:
        """단일 사례 UPSERT (prlst_clsf_srno 기준 중복 방지)"""
        sql = """
        INSERT INTO foreign_cases (
            prlst_clsf_srno, country, country_code, tab_country_code,
            base_year, ref_no, enforce_date, hs_code, image_count,
            issue_org, category, customs_office,
            goods_name, goods_name_etc, goods_name_decl, other_name,
            material, purpose, issue_place, keyword,
            reply_org, reply_eng, reply_kor,
            goods_desc_org, goods_desc_eng, goods_desc_kor,
            reason_org, reason_eng, reason_kor,
            crawled_at
        ) VALUES (
            :prlst_clsf_srno, :country, :country_code, :tab_country_code,
            :base_year, :ref_no, :enforce_date, :hs_code, :image_count,
            :issue_org, :category, :customs_office,
            :goods_name, :goods_name_etc, :goods_name_decl, :other_name,
            :material, :purpose, :issue_place, :keyword,
            :reply_org, :reply_eng, :reply_kor,
            :goods_desc_org, :goods_desc_eng, :goods_desc_kor,
            :reason_org, :reason_eng, :reason_kor,
            datetime('now', 'localtime')
        )
        ON CONFLICT(country_code, prlst_clsf_srno) DO UPDATE SET
            country           = excluded.country,
            country_code      = excluded.country_code,
            tab_country_code  = excluded.tab_country_code,
            base_year         = excluded.base_year,
            ref_no            = excluded.ref_no,
            enforce_date      = excluded.enforce_date,
            hs_code           = excluded.hs_code,
            image_count       = excluded.image_count,
            issue_org         = excluded.issue_org,
            category          = excluded.category,
            customs_office    = excluded.customs_office,
            goods_name        = excluded.goods_name,
            goods_name_etc    = excluded.goods_name_etc,
            goods_name_decl   = excluded.goods_name_decl,
            other_name        = excluded.other_name,
            material          = excluded.material,
            purpose           = excluded.purpose,
            issue_place       = excluded.issue_place,
            keyword           = excluded.keyword,
            reply_org         = excluded.reply_org,
            reply_eng         = excluded.reply_eng,
            reply_kor         = excluded.reply_kor,
            goods_desc_org    = excluded.goods_desc_org,
            goods_desc_eng    = excluded.goods_desc_eng,
            goods_desc_kor    = excluded.goods_desc_kor,
            reason_org        = excluded.reason_org,
            reason_eng        = excluded.reason_eng,
            reason_kor        = excluded.reason_kor,
            crawled_at        = datetime('now', 'localtime')
        ;
        """
        params = {
            "prlst_clsf_srno":  str(row.get("prlst_clsf_srno", "")),
            "country":          row.get("country", ""),
            "country_code":     row.get("country_code", ""),
            "tab_country_code": row.get("tab_country_code", row.get("country_code", "")),
            "base_year":        row.get("base_year", ""),
            "ref_no":           row.get("ref_no", ""),
            "enforce_date":     row.get("enforce_date", ""),
            "hs_code":          row.get("hs_code", ""),
            "image_count":      int(row.get("image_count", 0)),
            "issue_org":        row.get("issue_org", ""),
            "category":         row.get("category", ""),
            "customs_office":   row.get("customs_office", ""),
            "goods_name":       row.get("goods_name", ""),
            "goods_name_etc":   row.get("goods_name_etc", ""),
            "goods_name_decl":  row.get("goods_name_decl", ""),
            "other_name":       row.get("other_name", ""),
            "material":         row.get("material", ""),
            "purpose":          row.get("purpose", ""),
            "issue_place":      row.get("issue_place", ""),
            "keyword":          row.get("keyword", ""),
            "reply_org":        row.get("reply_org", ""),
            "reply_eng":        row.get("reply_eng", ""),
            "reply_kor":        row.get("reply_kor", ""),
            "goods_desc_org":   row.get("goods_desc_org", ""),
            "goods_desc_eng":   row.get("goods_desc_eng", ""),
            "goods_desc_kor":   row.get("goods_desc_kor", ""),
            "reason_org":       row.get("reason_org", ""),
            "reason_eng":       row.get("reason_eng", ""),
            "reason_kor":       row.get("reason_kor", ""),
        }
        with self._connect() as conn:
            cur = conn.execute(sql, params)
            rowid = cur.lastrowid

        # 이미지 URL + BLOB 저장
        image_urls   = row.get("image_urls", [])
        image_blobs  = row.get("image_blobs", [])
        image_exts   = row.get("image_exts", [])
        image_local_paths = row.get("image_local_paths", [])
        if image_urls:
            self.upsert_images(
                case_srno=str(row.get("prlst_clsf_srno", "")),
                country_code=str(row.get("country_code", "")),
                image_urls=image_urls,
                image_blobs=image_blobs,
                image_exts=image_exts,
                local_paths=image_local_paths,
            )

        return rowid

    def upsert_images(
        self,
        case_srno: str,
        country_code: str,
        image_urls: list,
        image_blobs: list = None,
        image_exts: list = None,
        local_paths: list = None,
    ):
        """
        이미지 목록 UPSERT - 바이너리 데이터(BLOB)를 DB에 직접 저장

        Parameters
        ----------
        case_srno    : 일련번호 (prlst_clsf_srno)
        country_code : 국가코드 (SRNO 충돌 방지용 복합키)
        image_urls   : 이미지 URL 목록
        image_blobs  : 이미지 바이너리 데이터 목록 (None이면 URL만 저장)
        image_exts   : 이미지 확장자 목록 (.jpg 등)
        local_paths  : 로컈 저장 경로 목록
        """
        if image_blobs is None:
            image_blobs = []
        if image_exts is None:
            image_exts = []
        if local_paths is None:
            local_paths = []

        sql = """
        INSERT INTO foreign_case_images (country_code, case_srno, seq, image_url, image_data, image_ext, image_size, local_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(country_code, case_srno, seq) DO UPDATE SET
            image_url  = excluded.image_url,
            image_data = CASE WHEN excluded.image_data IS NOT NULL THEN excluded.image_data ELSE image_data END,
            image_ext  = excluded.image_ext,
            image_size = excluded.image_size,
            local_path = excluded.local_path
        ;
        """
        rows = []
        for i, url in enumerate(image_urls, 1):
            blob = image_blobs[i - 1] if i - 1 < len(image_blobs) else None
            ext  = image_exts[i - 1]  if i - 1 < len(image_exts)  else _guess_image_ext(url)
            size = len(blob) if blob else None
            lp   = local_paths[i - 1] if i - 1 < len(local_paths) else None
            rows.append((country_code, case_srno, i, url, blob, ext, size, lp))

        with self._connect() as conn:
            conn.executemany(sql, rows)

    def add_history(
        self,
        start_dt: str,
        end_dt: str,
        country_code: str,
        saved_count: int,
        total_found: int = 0,
        week_label_str: str = None,
        iso_year: int = None,
        iso_week: int = None,
        keyword: str = "",
        hs_code: str = "",
        ref_no: str = "",
        list_only: bool = False,
        status: str = "success",
        error_msg: str = None,
    ) -> int:
        """수집 이력 1건 추가"""
        sql = """
        INSERT INTO foreign_crawl_history (
            run_at, week_label, iso_year, iso_week,
            start_dt, end_dt, country_code,
            keyword, hs_code, ref_no,
            total_found, saved_count, list_only,
            status, error_msg
        ) VALUES (
            datetime('now', 'localtime'), ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?
        );
        """
        params = (
            week_label_str, iso_year, iso_week,
            start_dt, end_dt, country_code,
            keyword or None, hs_code or None, ref_no or None,
            total_found, saved_count, 1 if list_only else 0,
            status, error_msg,
        )
        with self._connect() as conn:
            cur = conn.execute(sql, params)
            return cur.lastrowid

    def get_history(self, limit: int = 50, week_filter: str = None) -> list:
        """수집 이력 조회"""
        if week_filter:
            m = re.fullmatch(r"(\d{4})-(\d{1,2})", week_filter.strip())
            if m:
                sql = """
                SELECT * FROM foreign_crawl_history
                WHERE iso_year = ? AND iso_week = ?
                ORDER BY run_at DESC LIMIT ?
                """
                params = (int(m.group(1)), int(m.group(2)), limit)
            else:
                sql = "SELECT * FROM foreign_crawl_history ORDER BY run_at DESC LIMIT ?"
                params = (limit,)
        else:
            sql = "SELECT * FROM foreign_crawl_history ORDER BY run_at DESC LIMIT ?"
            params = (limit,)

        with self._connect() as conn:
            rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def is_week_already_crawled(self, iso_year: int, iso_week: int, country_code: str) -> bool:
        """특정 주차+국가 조합이 이미 성공적으로 수집된 이력이 있는지 확인"""
        sql = """
        SELECT COUNT(*) FROM foreign_crawl_history
        WHERE iso_year = ? AND iso_week = ? AND country_code = ? AND status = 'success'
        """
        with self._connect() as conn:
            count = conn.execute(sql, (iso_year, iso_week, country_code)).fetchone()[0]
        return count > 0

    def get_stats(self) -> dict:
        """DB 현황 조회"""
        with self._connect() as conn:
            total = conn.execute("SELECT COUNT(*) FROM foreign_cases").fetchone()[0]
            by_country = conn.execute(
                "SELECT country, tab_country_code, country_code, COUNT(*) AS cnt "
                "FROM foreign_cases GROUP BY tab_country_code, country_code ORDER BY cnt DESC"
            ).fetchall()
            img_total = conn.execute("SELECT COUNT(*) FROM foreign_case_images").fetchone()[0]
            hist_total = conn.execute("SELECT COUNT(*) FROM foreign_crawl_history").fetchone()[0]
        return {
            "total_cases":   total,
            "total_images":  img_total,
            "total_history": hist_total,
            "by_country":    [dict(r) for r in by_country],
        }


# ──────────────────────────────────────────────
# 크롤러 클래스
# ──────────────────────────────────────────────
class CustomsForeignCasesCrawler:
    """관세법령정보포털 품목분류 외국사례 크롤러"""

    def __init__(
        self,
        db_path: str = DEFAULT_DB_PATH,
        delay: float = 0.5,
        page_size: int = 500,
        download_images: bool = False,
        image_dir: str = None,
    ):
        self.db = CasesDB(db_path)
        self.delay = delay
        self.page_size = page_size
        self.download_images = download_images

        if image_dir:
            self.image_dir = Path(image_dir)
        else:
            self.image_dir = Path(db_path).parent / "images"
        if download_images:
            self.image_dir.mkdir(parents=True, exist_ok=True)

        self.session = requests.Session()
        self.session.verify = False
        self.session.mount("https://", _TLSAdapter())

    def _post(self, url: str, data: dict, referer: str = None) -> requests.Response:
        headers = DEFAULT_HEADERS.copy()
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
        if referer:
            headers["Referer"] = referer
        try:
            resp = self.session.post(url, data=data, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            logger.error("POST 요청 실패 [%s]: %s", url, e)
            raise

    def _get(self, url: str, params: dict = None, referer: str = None) -> requests.Response:
        headers = DEFAULT_HEADERS.copy()
        if referer:
            headers["Referer"] = referer
        try:
            resp = self.session.get(url, params=params, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            logger.error("GET 요청 실패 [%s]: %s", url, e)
            raise

    def fetch_list(
        self,
        cnty_cd: str = "US",
        start_dt: str = "",
        end_dt: str = "",
        keyword: str = "",
        reff_no: str = "",
        dtrm_hs_sgn: str = "",
        page: int = 1,
    ) -> dict:
        """품목분류 외국사례 목록 조회 (단일 페이지)"""
        referer = REFERER_MAP.get(cnty_cd, REFERER_MAP["ALL"])
        srch_yn = "Y" if (start_dt and end_dt) or keyword or reff_no or dtrm_hs_sgn else "N"

        payload = {
            "cntyCd":      cnty_cd,
            "stDt":        start_dt,
            "edDt":        end_dt,
            "srwr":        keyword,
            "reffNo":      reff_no,
            "dtrmHsSgn":   dtrm_hs_sgn,
            "pageIndex":   str(page),
            "pageUnit":    str(self.page_size),
            "srchYn":      srch_yn,
            "scrnTp":      "H",
            "lngaTp":      "org",
            "atntSrchTp":  "",
            "docId":       "",
        }

        resp = self._post(LIST_API, payload, referer=referer)
        data = resp.json()

        items = data.get("uls_over", {}).get("itemList", [])
        total = data.get("uls_over", {}).get("thisTotalCount", 0)

        return {"total": total, "items": items}

    def fetch_all_pages(
        self,
        cnty_cd: str = "US",
        start_dt: str = "",
        end_dt: str = "",
        keyword: str = "",
        reff_no: str = "",
        dtrm_hs_sgn: str = "",
        max_items: int = 0,
    ) -> tuple:
        """전체 페이지를 순회하며 목록 수집"""
        all_items = []
        page = 1
        total_found = 0

        logger.info(
            "목록 조회 시작 | 국가: %s | 기간: %s ~ %s",
            COUNTRY_TABS.get(cnty_cd, cnty_cd), start_dt, end_dt
        )

        while True:
            result = self.fetch_list(
                cnty_cd=cnty_cd,
                start_dt=start_dt,
                end_dt=end_dt,
                keyword=keyword,
                reff_no=reff_no,
                dtrm_hs_sgn=dtrm_hs_sgn,
                page=page,
            )
            items = result["items"]
            total_found = result["total"]

            if page == 1:
                logger.info("전체 건수: %d건", total_found)

            if not items:
                break

            all_items.extend(items)
            logger.info("  페이지 %d 수집 완료 (%d/%d건)", page, len(all_items), total_found)

            if max_items and len(all_items) >= max_items:
                all_items = all_items[:max_items]
                break

            if len(all_items) >= total_found:
                break

            page += 1
            time.sleep(self.delay)

        logger.info("목록 수집 완료: 총 %d건", len(all_items))
        return all_items, total_found

    def fetch_detail(self, item: dict, tab_cnty_cd: str = None) -> dict:
        """
        단일 사례의 상세 정보 조회 - 국가별 모든 항목 파싱

        Parameters
        ----------
        item : dict
            목록 API 응답 아이템
        tab_cnty_cd : str, optional
            목록 조회 시 사용한 탭 코드 (예: EU). Referer 결정에 사용.
        """
        # 상세 조회 API에는 목록 아이템의 실제 CNTY_CD 사용 (EU 탭 → DE/NL 등)
        cnty_cd         = item.get("CNTY_CD", "")
        base_yy         = item.get("BASE_YY", "")
        reff_no_nm      = item.get("REFF_NO_NM_ORI", "")
        prlst_clsf_srno = str(item.get("PRLST_CLSF_SRNO", ""))

        # Referer: 탭 코드 기준 (EU 탭에서 조회한 DE 아이템 → EU 탭 URL)
        ref_key = tab_cnty_cd if tab_cnty_cd else cnty_cd
        referer = REFERER_MAP.get(ref_key, REFERER_MAP.get(cnty_cd, REFERER_MAP["ALL"]))

        payload = {
            "cntyCd":        cnty_cd,
            "baseYy":        base_yy,
            "reffNoNm":      reff_no_nm,
            "prlstClsfSrno": prlst_clsf_srno,
            "lngaTp":        "org",
        }

        resp = self._post(DETAIL_API, payload, referer=referer)
        soup = BeautifulSoup(resp.text, "html.parser")

        # 이미지 URL 수집
        image_urls = _extract_image_urls(soup)

        # 국가별 상세 파싱
        # 탭 코드 기준으로 파서 선택 (EU 탭 아이템은 EU 파서 사용)
        effective_country = tab_cnty_cd if tab_cnty_cd else cnty_cd
        detail = _parse_detail(soup, effective_country, cnty_cd)

        detail["image_urls"]   = image_urls
        detail["image_count"]  = len(image_urls)
        detail["country"]      = item.get("CNTY_NM", "")
        detail["country_code"] = cnty_cd

        return detail

    def fetch_image_blob(self, image_url: str) -> tuple:
        """
        이미지 URL에서 바이너리 데이터 다운로드

        Returns
        -------
        (bytes, ext) 또는 (None, None) 실패 시
        """
        try:
            resp = self._get(image_url, referer=REFERER_MAP["ALL"])
            content_type = resp.headers.get("Content-Type", "")
            if "image" not in content_type and len(resp.content) < 5000:
                logger.warning("이미지 다운로드 실패 (이미지 아님): %s", image_url)
                return None, None
            # Content-Type에서 확장자 추론
            ext = ".jpg"
            if "png" in content_type:
                ext = ".png"
            elif "gif" in content_type:
                ext = ".gif"
            elif "webp" in content_type:
                ext = ".webp"
            elif "bmp" in content_type:
                ext = ".bmp"
            else:
                ext = _guess_image_ext(image_url)
            return resp.content, ext
        except Exception as e:
            logger.error("이미지 다운로드 오류 [%s]: %s", image_url, e)
            return None, None

    def download_image(self, image_url: str, save_path: Path) -> tuple:
        """
        이미지 파일 다운로드 및 로컈 저장

        Returns
        -------
        (bytes, ext) 또는 (None, None) 실패 시
        """
        blob, ext = self.fetch_image_blob(image_url)
        if blob is None:
            return None, None
        try:
            # 확장자가 다르면 저장 경로 수정
            if ext and not str(save_path).endswith(ext):
                save_path = save_path.with_suffix(ext)
            save_path.write_bytes(blob)
            logger.debug("이미지 저장: %s (%d bytes)", save_path, len(blob))
            return blob, ext
        except Exception as e:
            logger.error("이미지 로컈 저장 오류 [%s]: %s", save_path, e)
            return blob, ext  # 로컈 저장 실패해도 BLOB은 반환

    def crawl(
        self,
        cnty_cd: str = "US",
        start_dt: str = "",
        end_dt: str = "",
        keyword: str = "",
        reff_no: str = "",
        dtrm_hs_sgn: str = "",
        max_items: int = 0,
        fetch_detail_flag: bool = True,
        week_label_str: str = None,
        iso_year: int = None,
        iso_week: int = None,
        force: bool = False,
    ) -> int:
        """
        목록 수집 → 상세 조회 → (이미지 다운로드) → DB 저장 + 이력 기록

        Returns
        -------
        int : DB에 저장된 건수
        """
        # 주차 중복 수집 체크
        if iso_year and iso_week and not force:
            if self.db.is_week_already_crawled(iso_year, iso_week, cnty_cd):
                wl = week_label(iso_year, iso_week)
                logger.warning(
                    "이미 수집된 주차입니다: %s / %s | 재수집하려면 --force 옵션을 사용하세요.",
                    wl, COUNTRY_TABS.get(cnty_cd, cnty_cd)
                )
                return 0

        saved_count = 0
        total_found = 0
        status = "success"
        error_msg = None

        try:
            # 1. 목록 수집
            items, total_found = self.fetch_all_pages(
                cnty_cd=cnty_cd,
                start_dt=start_dt,
                end_dt=end_dt,
                keyword=keyword,
                reff_no=reff_no,
                dtrm_hs_sgn=dtrm_hs_sgn,
                max_items=max_items,
            )

            if not items:
                logger.info("수집된 데이터가 없습니다 (%s).", COUNTRY_TABS.get(cnty_cd, cnty_cd))
                self.db.add_history(
                    start_dt=start_dt, end_dt=end_dt, country_code=cnty_cd,
                    saved_count=0, total_found=0,
                    week_label_str=week_label_str, iso_year=iso_year, iso_week=iso_week,
                    keyword=keyword, hs_code=dtrm_hs_sgn, ref_no=reff_no,
                    list_only=not fetch_detail_flag, status="success",
                )
                return 0

            if not fetch_detail_flag:
                # 목록 정보만 DB 저장
                for item in items:
                    row = _normalize_list_item(item)
                    row["tab_country_code"] = cnty_cd
                    try:
                        self.db.upsert_case(row)
                        saved_count += 1
                    except Exception as e:
                        logger.error("DB 저장 오류 [%s]: %s", row.get("ref_no", ""), e)
                logger.info("목록 저장 완료: %d건 → DB", saved_count)
            else:
                # 2. 상세 조회 + DB 저장
                logger.info("상세 정보 조회 및 DB 저장 시작 (%d건)...", len(items))
                for i, item in enumerate(items, 1):
                    reff = item.get("REFF_NO_NM_ORI", "")
                    srno = item.get("PRLST_CLSF_SRNO", "")
                    logger.info(
                        "  [%d/%d] 상세 조회: %s (SRNO=%s, 국가=%s)",
                        i, len(items), reff, srno, item.get("CNTY_NM", "")
                    )

                    try:
                        detail = self.fetch_detail(item, tab_cnty_cd=cnty_cd)
                    except Exception as e:
                        logger.error("    상세 조회 실패: %s", e)
                        detail = {}

                    row = _normalize_list_item(item)
                    row["tab_country_code"] = cnty_cd
                    row.update(detail)

                    # 3. 이미지 다운로드 및 BLOB DB 저장 (항상 실행)
                    if detail.get("image_urls"):
                        image_blobs = []
                        image_exts  = []
                        saved_paths = []
                        for j, img_url in enumerate(detail["image_urls"], 1):
                            blob, ext = self.fetch_image_blob(img_url)
                            image_blobs.append(blob)  # None이면 BLOB 없음
                            image_exts.append(ext or _guess_image_ext(img_url))
                            # 로컈 파일 저장 (옵션 지정 시만)
                            if self.download_images and blob:
                                img_subdir = self.image_dir / re.sub(r"[^\w\-]", "_", reff)
                                img_subdir.mkdir(parents=True, exist_ok=True)
                                img_path = img_subdir / f"image_{j:02d}{ext or '.jpg'}"
                                try:
                                    img_path.write_bytes(blob)
                                    saved_paths.append(str(img_path))
                                except Exception as e_img:
                                    logger.error("    이미지 로컈 저장 실패: %s", e_img)
                            time.sleep(self.delay)
                        row["image_blobs"]       = image_blobs
                        row["image_exts"]        = image_exts
                        row["image_local_paths"] = saved_paths
                        blob_ok = sum(1 for b in image_blobs if b)
                        logger.info("    이미지 %d건 수집 (성공 BLOB: %d건)", len(image_blobs), blob_ok)

                    # 4. DB 저장
                    try:
                        self.db.upsert_case(row)
                        saved_count += 1
                    except Exception as e:
                        logger.error("    DB 저장 오류 [%s]: %s", reff, e)

                    time.sleep(self.delay)

                logger.info("전체 수집 및 DB 저장 완료: %d건", saved_count)

        except Exception as e:
            status = "error"
            error_msg = str(e)
            logger.error("수집 중 오류 발생: %s", e)
            raise
        finally:
            self.db.add_history(
                start_dt=start_dt, end_dt=end_dt, country_code=cnty_cd,
                saved_count=saved_count, total_found=total_found,
                week_label_str=week_label_str, iso_year=iso_year, iso_week=iso_week,
                keyword=keyword, hs_code=dtrm_hs_sgn, ref_no=reff_no,
                list_only=not fetch_detail_flag, status=status, error_msg=error_msg,
            )

        stats = self.db.get_stats()
        logger.info(
            "DB 현황 | 전체 사례: %d건 | 이미지: %d건 | 수집 이력: %d건",
            stats["total_cases"], stats["total_images"], stats["total_history"]
        )

        return saved_count


# ──────────────────────────────────────────────
# 파싱 헬퍼 함수
# ──────────────────────────────────────────────

def _extract_image_urls(soup: BeautifulSoup) -> list:
    """HTML에서 이미지 URL 목록 추출"""
    image_urls = []
    seen_file_ids = set()

    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            th = row.find("th")
            td = row.find("td")
            if not (th and td):
                continue
            th_text = th.get_text(strip=True)
            if "관련" not in th_text and "이미지" not in th_text:
                continue
            # img 태그에서 attchFileId 추출
            for img in td.find_all("img"):
                src = img.get("src", "")
                if src and "kcs4gImageDownload" in src:
                    m = re.search(r"attchFileId=([^&]+)", src)
                    if m:
                        fid = m.group(1)
                        if fid not in seen_file_ids:
                            seen_file_ids.add(fid)
                            image_urls.append(f"{IMAGE_API}?attchFileId={fid}")
            # input[name=attchFileGrpId] 에서 추출
            for inp in td.find_all("input", {"name": "attchFileGrpId"}):
                file_id = inp.get("value", "")
                if file_id and file_id not in seen_file_ids:
                    seen_file_ids.add(file_id)
                    image_urls.append(f"{IMAGE_API}?attchFileId={file_id}")

    return image_urls


def _get_all_table_fields(soup: BeautifulSoup) -> dict:
    """
    HTML 내 모든 테이블의 th→td 텍스트 매핑 반환.
    다국어 테이블(org/eng/kor class)은 별도 키로 분리.
    반환 형식: {"org": {...}, "eng": {...}, "kor": {...}, "all": {...}}
    """
    result = {"org": {}, "eng": {}, "kor": {}, "all": {}}

    for table in soup.find_all("table"):
        cls = " ".join(table.get("class", []))
        target = "all"
        if "org" in cls:
            target = "org"
        elif "eng" in cls:
            target = "eng"
        elif "kor" in cls:
            target = "kor"

        for row in table.find_all("tr"):
            th = row.find("th")
            td = row.find("td")
            if not (th and td):
                continue
            th_text = th.get_text(strip=True)
            td_text = td.get_text(separator="\n", strip=True)
            result[target][th_text] = td_text
            # "all"에도 항상 추가 (최초 등장 값 우선)
            if th_text not in result["all"]:
                result["all"][th_text] = td_text

    return result


def _find_field(fields: dict, *keywords) -> str:
    """fields 딕셔너리에서 키워드가 포함된 첫 번째 값 반환"""
    for key, val in fields.items():
        for kw in keywords:
            if kw in key:
                return val
    return ""


def _find_field_with_spans(soup: BeautifulSoup, *th_keywords) -> tuple:
    """
    th에 키워드가 포함된 행의 td에서 span.org / span.eng / span.kor 텍스트 반환.
    반환: (org_text, eng_text, kor_text)
    """
    for table in soup.find_all("table"):
        for row in table.find_all("tr"):
            th = row.find("th")
            td = row.find("td")
            if not (th and td):
                continue
            th_text = th.get_text(strip=True)
            if not any(kw in th_text for kw in th_keywords):
                continue
            org_span = td.find("span", class_="org")
            eng_span = td.find("span", class_="eng")
            kor_span = td.find("span", class_="kor")
            org = org_span.get_text(separator="\n", strip=True) if org_span else ""
            eng = eng_span.get_text(separator="\n", strip=True) if eng_span else ""
            kor = kor_span.get_text(separator="\n", strip=True) if kor_span else ""
            # span이 없으면 td 전체 텍스트를 org로
            if not org and not eng and not kor:
                org = td.get_text(separator="\n", strip=True)
            return (org, eng, kor)
    return ("", "", "")


def _parse_detail(soup: BeautifulSoup, tab_country: str, actual_country: str) -> dict:
    """
    국가별 상세 HTML 파싱 - 모든 항목 추출

    Parameters
    ----------
    soup : BeautifulSoup
    tab_country : str
        탭 국가코드 (EU, US, JP 등)
    actual_country : str
        실제 국가코드 (EU 탭에서는 DE, NL 등)
    """
    # 공통 기본값
    result = {
        "base_year": "", "ref_no": "", "enforce_date": "", "hs_code": "",
        "issue_org": "", "category": "", "customs_office": "",
        "goods_name": "", "goods_name_etc": "", "goods_name_decl": "", "other_name": "",
        "material": "", "purpose": "", "issue_place": "", "keyword": "",
        "reply_org": "", "reply_eng": "", "reply_kor": "",
        "goods_desc_org": "", "goods_desc_eng": "", "goods_desc_kor": "",
        "reason_org": "", "reason_eng": "", "reason_kor": "",
    }

    # 전체 필드 추출
    fields = _get_all_table_fields(soup)
    all_f = fields["all"]
    org_f = fields["org"]
    eng_f = fields["eng"]
    kor_f = fields["kor"]

    # ── 공통 항목 ──────────────────────────────────────────────────────────
    result["base_year"]    = _find_field(all_f, "기준년도")
    result["ref_no"]       = _find_field(all_f, "참조번호")
    result["enforce_date"] = _find_field(all_f, "시행일자", "등록일자")
    result["hs_code"]      = _find_field(all_f, "결정세번")
    result["issue_place"]  = _find_field(all_f, "이슈장소")

    # 키워드: \n 구분된 여러 줄을 중복 제거 후 쉼표 구분으로 정규화
    raw_keyword = _find_field(all_f, "키워드")
    if raw_keyword:
        kw_list = [k.strip() for k in re.split(r"[\n\r]+", raw_keyword) if k.strip()]
        seen_kw: set = set()
        unique_kw = []
        for k in kw_list:
            k_upper = k.upper()
            if k_upper not in seen_kw:
                seen_kw.add(k_upper)
                unique_kw.append(k)
        result["keyword"] = ", ".join(unique_kw)
    else:
        result["keyword"] = ""

    # ── 미국(US) 전용 항목 ─────────────────────────────────────────────────
    result["issue_org"] = _find_field(all_f, "시행기관")
    result["category"]  = _find_field(all_f, "Category", "category")

    # ── 일본(JP) 전용 항목 ─────────────────────────────────────────────────
    result["customs_office"] = _find_field(all_f, "세관")

    # ── 품명 관련 항목 ─────────────────────────────────────────────────────
    result["goods_name"]      = _find_field(all_f, "품명")
    result["goods_name_etc"]  = _find_field(all_f, "기타품명")
    result["goods_name_decl"] = _find_field(all_f, "품명선언")
    result["other_name"]      = _find_field(all_f, "다른이름")

    # ── 재질/용도 (TH, TW) ────────────────────────────────────────────────
    result["material"] = _find_field(all_f, "재질성분")
    result["purpose"]  = _find_field(all_f, "용도")

    # ── 회신 (span.org/eng/kor 구조 또는 단일 텍스트) ─────────────────────
    r_org, r_eng, r_kor = _find_field_with_spans(soup, "회신")
    result["reply_org"] = r_org
    result["reply_eng"] = r_eng
    result["reply_kor"] = r_kor

    # ── 물품설명 (다국어 테이블 우선, 없으면 단일 테이블) ──────────────────
    # 다국어 테이블 구조 (org/eng/kor class)
    if org_f or eng_f or kor_f:
        result["goods_desc_org"] = _find_field(org_f, "물품설명", "물품설명 및 결정사유")
        result["goods_desc_eng"] = _find_field(eng_f, "물품설명", "물품설명 및 결정사유")
        result["goods_desc_kor"] = _find_field(kor_f, "물품설명", "물품설명 및 결정사유")
        result["reason_org"]     = _find_field(org_f, "분류사유", "결정사유")
        result["reason_eng"]     = _find_field(eng_f, "분류사유", "결정사유")
        result["reason_kor"]     = _find_field(kor_f, "분류사유", "결정사유")
        # 다국어 테이블에서 못 찾은 경우 span 구조 시도
        if not result["goods_desc_org"]:
            gd_org, gd_eng, gd_kor = _find_field_with_spans(soup, "물품설명", "물품설명 및 결정사유")
            result["goods_desc_org"] = gd_org
            result["goods_desc_eng"] = gd_eng
            result["goods_desc_kor"] = gd_kor
        if not result["reason_org"]:
            rs_org, rs_eng, rs_kor = _find_field_with_spans(soup, "분류사유", "결정사유")
            result["reason_org"] = rs_org
            result["reason_eng"] = rs_eng
            result["reason_kor"] = rs_kor
    else:
        # 단일 테이블 구조 (US, JP, TH, CA 등)
        gd_org, gd_eng, gd_kor = _find_field_with_spans(soup, "물품설명", "물품설명 및 결정사유")
        result["goods_desc_org"] = gd_org
        result["goods_desc_eng"] = gd_eng
        result["goods_desc_kor"] = gd_kor

        rs_org, rs_eng, rs_kor = _find_field_with_spans(soup, "분류사유", "결정사유")
        result["reason_org"] = rs_org
        result["reason_eng"] = rs_eng
        result["reason_kor"] = rs_kor

    # ── 인도(IN): "물품설명 및 결정사유" → goods_desc에 저장 ───────────────
    if not result["goods_desc_org"] and not result["reason_org"]:
        combined = _find_field(all_f, "물품설명 및 결정사유")
        if combined:
            result["goods_desc_org"] = combined

    # ── 결정세번 HS 코드 정리 (세미콜론 구분 다중 코드 허용) ──────────────
    # hs_code는 TEXT 타입이므로 길이 제한 없이 그대로 저장

    return result


def _normalize_list_item(item: dict) -> dict:
    """목록 API 응답 아이템을 정규화된 딕셔너리로 변환"""
    return {
        "country":         item.get("CNTY_NM", ""),
        "country_code":    item.get("CNTY_CD", ""),
        "base_year":       item.get("BASE_YY", ""),
        "ref_no":          item.get("REFF_NO_NM_ORI", ""),
        "enforce_date":    item.get("ENFR_DT", ""),
        "hs_code":         item.get("DTRM_HS_SGN_CN", ""),
        "image_count":     int(item.get("IMGE_CNT", 0)),
        # 목록 API에서 제공하는 요약 텍스트 (상세 조회 후 덮어씌워짐)
        "reply_kor":       item.get("RPY_CN", ""),
        "reply_eng":       item.get("ENGL_RPY_CN", ""),
        "reply_org":       item.get("ORTX_RPY_CN", ""),
        "goods_desc_kor":  item.get("CMDT_DESC", ""),
        "goods_desc_eng":  item.get("ENGL_CMDT_DESC", ""),
        "goods_desc_org":  item.get("ORTX_CMDT_DESC", ""),
        "reason_kor":      item.get("DTRM_RSN_CN", ""),
        "reason_eng":      item.get("ENGL_DTRM_RSN_CN", ""),
        "reason_org":      item.get("ORTX_DTRM_RSN_CN", ""),
        "goods_name":      item.get("CMDT_NM", ""),
        "prlst_clsf_srno": item.get("PRLST_CLSF_SRNO", ""),
    }


def _guess_image_ext(url: str) -> str:
    url_lower = url.lower()
    for ext in [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"]:
        if ext in url_lower:
            return ext
    return ".jpg"


# ──────────────────────────────────────────────
# CLI 진입점
# ──────────────────────────────────────────────

def print_history(rows: list):
    """수집 이력 테이블 형식 출력"""
    if not rows:
        print("  (이력 없음)")
        return

    header = (
        f"{'ID':>4}  {'실행일시':>19}  {'주차':>7}  {'국가':>6}  "
        f"{'시작일':>8}  {'종료일':>8}  {'조회':>6}  {'저장':>6}  {'상태':>7}"
    )
    sep = "-" * len(header)
    print(sep)
    print(header)
    print(sep)
    for r in rows:
        wl = r.get("week_label") or "-"
        print(
            f"{r['id']:>4}  {r['run_at']:>19}  {wl:>7}  "
            f"{r['country_code']:>6}  {r['start_dt']:>8}  {r['end_dt']:>8}  "
            f"{r['total_found']:>6,}  {r['saved_count']:>6,}  {r['status']:>7}"
        )
        if r.get("error_msg"):
            print(f"       오류: {r['error_msg'][:80]}")
    print(sep)


def main():
    parser = argparse.ArgumentParser(
        description="관세법령정보포털 품목분류 외국사례 크롤러 (SQLite DB 저장)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=r"""
사용 예시:
  # 주차 입력 (ISO 주차: 월요일~일요일 자동 변환)
  python3 customs_foreign_cases_crawler.py --week 2025-14
  python3 customs_foreign_cases_crawler.py --week 2025-14 --country ALL

  # 기간 직접 지정
  python3 customs_foreign_cases_crawler.py --start 20250401 --end 20250407

  # DB 경로 지정
  python3 customs_foreign_cases_crawler.py --week 2025-14 --db D:\SQLiteDB\smart_law_ai.db

  # 이미지 다운로드 포함
  python3 customs_foreign_cases_crawler.py --week 2025-14 --download-images

  # 이미 수집된 주차 강제 재수집
  python3 customs_foreign_cases_crawler.py --week 2025-14 --force

  # DB 현황 조회
  python3 customs_foreign_cases_crawler.py --stats

  # 수집 이력 조회 (최근 20건)
  python3 customs_foreign_cases_crawler.py --history

  # 특정 주차 이력만 조회
  python3 customs_foreign_cases_crawler.py --history --week 2025-14

지원 국가 코드:
  ALL(전체), US(미국), EU(유럽연합), GB(영국), CN(중국), JP(일본),
  TW(대만), CL(칠레), AU(호주), TH(태국), SG(싱가포르), PH(필리핀),
  KH(캄보디아), IN(인도), CA(캐나다), BD(방글라데시), CH(스위스)
        """,
    )

    cond_group = parser.add_argument_group("조회 조건")
    cond_group.add_argument("--week", "-w", default=None, metavar="YYYY-WW",
        help="ISO 주차 (예: 2025-14) → 해당 주 월요일~일요일로 자동 변환")
    cond_group.add_argument("--year", "-y", default=None, metavar="YYYY",
        help="연도 전체 수집 (예: 2020) → YYYY0101~YYYY1231 자동 변환")
    cond_group.add_argument("--start", "-s", default="",
        help="시작일자 YYYYMMDD (예: 20250401) ※ --week/--year 미사용 시")
    cond_group.add_argument("--end", "-e", default="",
        help="종료일자 YYYYMMDD (예: 20250407) ※ --week/--year 미사용 시")
    cond_group.add_argument("--country", "-c", default="ALL",
        choices=list(COUNTRY_TABS.keys()),
        help="국가 코드 (기본값: ALL - 전체 국가 수집)")
    cond_group.add_argument("--keyword", "-k", default="", help="검색어 (2자 이상)")
    cond_group.add_argument("--ref-no", "-r", default="", help="참조번호")
    cond_group.add_argument("--hs-code", default="", help="결정세번 (HS 코드)")

    opt_group = parser.add_argument_group("수집 옵션")
    opt_group.add_argument("--max", "-m", type=int, default=0,
        help="최대 수집 건수 (0=제한 없음)")
    opt_group.add_argument("--page-size", type=int, default=500,
        help="페이지당 건수 (기본값: 500, 최대 1000 권장)")
    opt_group.add_argument("--delay", "-d", type=float, default=0.5,
        help="요청 간 대기 시간(초) (기본값: 0.5)")
    opt_group.add_argument("--list-only", action="store_true",
        help="목록만 수집 (상세 조회 생략)")
    opt_group.add_argument("--download-images", action="store_true",
        help="이미지 파일 다운로드")
    opt_group.add_argument("--force", action="store_true",
        help="이미 수집된 주차라도 강제 재수집")

    db_group = parser.add_argument_group("DB / 출력 옵션")
    db_group.add_argument("--db", default=DEFAULT_DB_PATH,
        help=f"SQLite DB 파일 경로 (기본값: {DEFAULT_DB_PATH})")
    db_group.add_argument("--image-dir", default=None,
        help="이미지 저장 디렉터리 (기본값: DB 파일 위치의 images 폴더)")
    db_group.add_argument("--stats", action="store_true",
        help="DB 현황 조회 후 종료")
    db_group.add_argument("--history", action="store_true",
        help="수집 이력 조회 후 종료")
    db_group.add_argument("--history-limit", type=int, default=20,
        help="이력 조회 건수 (기본값: 20)")
    db_group.add_argument("--log-dir", default=None,
        help="연도별 오류 로그 저장 디렉토리 (DB 파일 위치의 LOG 폴더, 예: C:\\SQLiteDB\\LOG)")
    db_group.add_argument("--verbose", "-v", action="store_true",
        help="상세 로그 출력")

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # ── DB 현황 조회 모드 ──────────────────────
    if args.stats:
        db = CasesDB(args.db)
        stats = db.get_stats()
        print(f"\n[DB 현황] {args.db}")
        print(f"  전체 사례:   {stats['total_cases']:>10,}건")
        print(f"  이미지 URL:  {stats['total_images']:>10,}건")
        print(f"  수집 이력:   {stats['total_history']:>10,}건")
        print("\n  [국가별 현황]")
        for row in stats["by_country"]:
            tab = row.get("tab_country_code") or row.get("country_code", "")
            actual = row.get("country_code", "")
            country_nm = row.get("country", "")
            if tab and tab != actual:
                print(f"    {country_nm:20s} ({tab}/{actual})  {row['cnt']:>8,}건")
            else:
                print(f"    {country_nm:20s} ({actual:3s})  {row['cnt']:>8,}건")
        return

    # ── 수집 이력 조회 모드 ────────────────────
    if args.history:
        db = CasesDB(args.db)
        rows = db.get_history(
            limit=args.history_limit,
            week_filter=args.week,
        )
        print(f"\n[수집 이력] {args.db}")
        if args.week:
            print(f"  주차 필터: {args.week}")
        print_history(rows)
        return

    # ── 날짜 범위 결정 ─────────────────────────
    week_label_str = None
    iso_year = None
    iso_week = None

    if args.week:
        try:
            start_dt, end_dt, iso_year, iso_week, monday, sunday = parse_week(args.week)
            week_label_str = week_label(iso_year, iso_week)
            print(f"\n[주차 변환] {args.week} → {monday.strftime('%Y-%m-%d')}(월) ~ {sunday.strftime('%Y-%m-%d')}(일)")
            print(f"           조회 기간: {start_dt} ~ {end_dt}\n")
        except ValueError as e:
            print(f"오류: {e}")
            return
    elif args.year:
        # 연도 전체 수집
        if not re.fullmatch(r"\d{4}", args.year.strip()):
            print(f"오류: 연도 형식이 올바르지 않습니다: '{args.year}' (YYYY 형식 필요)")
            return
        start_dt = f"{args.year}0101"
        end_dt   = f"{args.year}1231"
        print(f"\n[연도 수집] {args.year}년 전체 → {start_dt} ~ {end_dt}\n")
    else:
        start_dt = args.start
        end_dt = args.end
        if not start_dt or not end_dt:
            print("오류: --week, --year, 또는 --start/--end 를 지정해야 합니다.")
            parser.print_help()
            return

    # ── 로그 디렉토리 결정 ─────────────────────
    if args.log_dir:
        log_dir = args.log_dir
    else:
        db_parent = Path(args.db).parent
        log_dir = str(db_parent / "LOG")

    # ── 크롤러 초기화 ──────────────────────────
    crawler = CustomsForeignCasesCrawler(
        db_path=args.db,
        delay=args.delay,
        page_size=args.page_size,
        download_images=args.download_images,
        image_dir=args.image_dir,
    )

    # ── 수집 실행 ──────────────────────────────
    # ── 수집 연도 결정 (로그 파일명용) ───────────
    collect_year = args.year if args.year else (start_dt[:4] if start_dt else "unknown")

    if args.country == "ALL":
        # 전체 국가 순차 수집
        print(f"[전체 국가 수집] {len(ALL_COUNTRIES)}개국 순차 수집 시작...\n")
        total_saved = 0
        results = []

        for cnty in ALL_COUNTRIES:
            country_name = COUNTRY_TABS.get(cnty, cnty)
            print(f"  ▶ {country_name} ({cnty}) 수집 중...")
            # 연도별 오류 로그 핸들러 설정
            log_handler = setup_year_log_handler(log_dir, collect_year, cnty)
            try:
                saved = crawler.crawl(
                    cnty_cd=cnty,
                    start_dt=start_dt,
                    end_dt=end_dt,
                    keyword=args.keyword,
                    reff_no=args.ref_no,
                    dtrm_hs_sgn=args.hs_code,
                    max_items=args.max,
                    fetch_detail_flag=not args.list_only,
                    week_label_str=week_label_str,
                    iso_year=iso_year,
                    iso_week=iso_week,
                    force=args.force,
                )
                total_saved += saved
                results.append((cnty, country_name, saved, "성공"))
                print(f"     → {saved}건 저장 완료\n")
            except Exception as e:
                logger.error("  %s 수집 실패: %s", country_name, e, exc_info=True)
                results.append((cnty, country_name, 0, f"실패: {str(e)[:50]}"))
                print(f"     → 실패: {e}\n")
            finally:
                remove_log_handler(log_handler)
            time.sleep(1.0)  # 국가 간 대기

        # 전체 결과 요약
        print("\n" + "=" * 60)
        print(f"[전체 수집 완료] 총 {total_saved:,}건 저장")
        print("=" * 60)
        print(f"{'국가코드':>6}  {'국가명':>15}  {'저장건수':>8}  {'상태'}")
        print("-" * 60)
        for cnty, name, cnt, status in results:
            print(f"{cnty:>6}  {name:>15}  {cnt:>8,}건  {status}")
        print("=" * 60)
        print(f"  오류 로그 위치: {log_dir}/{{YYYY}}_{{국가코드}}.log")

    else:
        # 단일 국가 수집
        log_handler = setup_year_log_handler(log_dir, collect_year, args.country)
        try:
            saved = crawler.crawl(
                cnty_cd=args.country,
                start_dt=start_dt,
                end_dt=end_dt,
                keyword=args.keyword,
                reff_no=args.ref_no,
                dtrm_hs_sgn=args.hs_code,
                max_items=args.max,
                fetch_detail_flag=not args.list_only,
                week_label_str=week_label_str,
                iso_year=iso_year,
                iso_week=iso_week,
                force=args.force,
            )
            print(f"\n[수집 완료] {COUNTRY_TABS.get(args.country, args.country)}: {saved:,}건 저장")
        except Exception as e:
            logger.error("수집 실패 [%s]: %s", args.country, e, exc_info=True)
            print(f"\n[수집 실패] {e}")
        finally:
            remove_log_handler(log_handler)
        print(f"  오류 로그: {log_dir}/{collect_year}_{args.country}.log")


if __name__ == "__main__":
    main()
