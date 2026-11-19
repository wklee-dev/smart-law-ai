#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
================================================================================
관세청 행정규칙 행정예고 크롤링 프로그램
Korea Customs Service Administration Notice Crawler
================================================================================
- 대상 사이트: 관세청 (https://www.customs.go.kr)
  경로: 국민참여 > 알림·소식 > 공고·공시 > 행정규칙 행정예고
  (mi=2897, bbsId=1366)
- 데이터베이스: SQLite ("D:\SQLiteDB\smart_law_ai.db" 기본)
- 첨부파일: "C:\SQLiteDB\downloads\관세청\행정규칙예고" 기본
- 로그: logs\YYYY-MM-DD.log
- 특징:
    * 1단계(목록 수집) / 2단계(본문·첨부파일 수집) / 통합 수집 지원
    * 페이지 단위 수집: 단일 페이지(예: 1), 범위 지정(from ~ to), 전체 페이지
    * 모든 공고(폐지제정 등) 조건 없이 전건 수집
    * 중단 후 재개 가능 (미수집 건 자동 식별)
    * 기존 DB 데이터와 충돌 없는 독립 테이블 설계
    * 가상환경 없이 기본 Python 환경에서 실행 가능
================================================================================
"""

import argparse
import configparser
import datetime as dt
import html
import logging
import os
import re
import signal
import sqlite3
import sys
import time
import urllib.parse
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# -----------------------------------------------------------------------------
# 전역 상수
# -----------------------------------------------------------------------------
PROGRAM_NAME = "customs_notice_crawler"
PROGRAM_VERSION = "3.2.0"

BASE_URL = "https://www.customs.go.kr"
LIST_URL = f"{BASE_URL}/kcs/na/ntt/selectNttList.do"
DETAIL_URL = f"{BASE_URL}/kcs/na/ntt/selectNttInfo.do"
FILE_URL = f"{BASE_URL}/common/nttFileDownload.do"

DEFAULT_BBS_ID = "1366"
DEFAULT_MI = "2897"

DEFAULT_DB_PATH = r"D:\SQLiteDB\smart_law_ai.db"
DEFAULT_DOWNLOAD_DIR = r"C:\SQLiteDB\downloads\관세청\행정규칙예고"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# -----------------------------------------------------------------------------
# DDL: 독립 테이블 스키마 (기존 데이터와 충돌 없도록 명확히 구분된 테이블명 사용)
# -----------------------------------------------------------------------------
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS customs_admin_notice (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    seq_no          INTEGER,
    ntt_sn          TEXT NOT NULL UNIQUE,
    ntt_sn_url      TEXT,
    bbs_id          TEXT,
    mi              TEXT,
    list_title      TEXT,
    full_title      TEXT,
    writer          TEXT,
    reg_date        TEXT,
    view_count      INTEGER,
    detail_url      TEXT,
    content_html    TEXT,
    content_text    TEXT,
    has_attachment  TEXT DEFAULT 'N',
    attach_count    INTEGER DEFAULT 0,
    stage1_done     INTEGER DEFAULT 0,
    stage2_done     INTEGER DEFAULT 0,
    crawl_status    TEXT DEFAULT 'PENDING',
    error_message   TEXT,
    source_screen   TEXT,
    created_at      TEXT,
    updated_at      TEXT
);

CREATE TABLE IF NOT EXISTS customs_admin_notice_attach (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_id           INTEGER,
    ntt_sn              TEXT NOT NULL,
    seq_no              INTEGER,
    file_seq            INTEGER,
    file_key            TEXT NOT NULL,
    file_name           TEXT,
    file_ext            TEXT,
    display_size        TEXT,
    file_size_bytes     INTEGER,
    download_count      TEXT,
    download_url        TEXT,
    save_dir            TEXT,
    saved_file_name     TEXT,
    saved_full_path     TEXT,
    download_status     TEXT DEFAULT 'PENDING',
    error_message       TEXT,
    downloaded_at       TEXT,
    FOREIGN KEY (notice_id) REFERENCES customs_admin_notice(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS customs_admin_notice_crawl_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT,
    stage           TEXT,
    page_mode       TEXT,
    page_start      INTEGER,
    page_end        INTEGER,
    target_count    INTEGER,
    success_count   INTEGER,
    fail_count      INTEGER,
    skip_count      INTEGER,
    started_at      TEXT,
    finished_at     TEXT,
    elapsed_seconds REAL,
    status          TEXT,
    message         TEXT
);

CREATE INDEX IF NOT EXISTS idx_customs_notice_ntt_sn ON customs_admin_notice(ntt_sn);
CREATE INDEX IF NOT EXISTS idx_customs_notice_seq_no ON customs_admin_notice(seq_no);
CREATE INDEX IF NOT EXISTS idx_customs_notice_stage ON customs_admin_notice(stage1_done, stage2_done, crawl_status);
CREATE INDEX IF NOT EXISTS idx_customs_notice_reg_date ON customs_admin_notice(reg_date);
CREATE INDEX IF NOT EXISTS idx_customs_attach_notice ON customs_admin_notice_attach(notice_id);
CREATE INDEX IF NOT EXISTS idx_customs_attach_ntt ON customs_admin_notice_attach(ntt_sn);
CREATE INDEX IF NOT EXISTS idx_customs_attach_key ON customs_admin_notice_attach(file_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customs_attach_ntt_key ON customs_admin_notice_attach(ntt_sn, file_key);
"""

# -----------------------------------------------------------------------------
# 데이터 클래스
# -----------------------------------------------------------------------------
@dataclass
class NoticeItem:
    seq_no: Optional[int]
    ntt_sn: str
    ntt_sn_url: str
    bbs_id: str
    mi: str
    list_title: str
    writer: str
    reg_date: str
    view_count: Optional[int]
    full_title: str = ""
    content_html: str = ""
    content_text: str = ""
    detail_url: str = ""
    has_attachment: str = "N"
    attach_count: int = 0
    stage1_done: int = 1
    stage2_done: int = 0
    crawl_status: str = "LIST_DONE"
    error_message: str = ""
    source_screen: str = "관세청 > 알림·소식 > 공고·공시 > 행정규칙 행정예고"
    attachments: List["AttachItem"] = field(default_factory=list)


@dataclass
class AttachItem:
    file_key: str
    file_name: str
    file_ext: str = ""
    display_size: str = ""
    file_size_bytes: int = 0
    download_count: str = ""
    download_url: str = ""
    save_dir: str = ""
    saved_file_name: str = ""
    saved_full_path: str = ""
    download_status: str = "PENDING"
    error_message: str = ""
    downloaded_at: str = ""
    notice_id: Optional[int] = None
    ntt_sn: str = ""
    seq_no: Optional[int] = None
    file_seq: int = 0


# -----------------------------------------------------------------------------
# 설정 관리
# -----------------------------------------------------------------------------
class Config:
    """config.ini 설정 및 CLI 인자를 병합 관리하는 클래스"""

    def __init__(self, ini_path: Optional[str] = None):
        self.ini_path = ini_path or os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "config.ini"
        )
        self.db_path = DEFAULT_DB_PATH
        self.download_dir = DEFAULT_DOWNLOAD_DIR
        self.attach_naming = "seq_prefix"
        self.download_attachments = True
        self.skip_existing_files = True

        self.bbs_id = DEFAULT_BBS_ID
        self.mi = DEFAULT_MI
        self.delay = 1.0
        self.timeout = 30
        self.retries = 3
        self.retry_backoff = 1.5
        self.page_size = 10
        self.default_stage = "all"
        self.stage2_limit = 0
        # 페이지 자동 지정 (미지정 시 자동 수집 대상 페이지)
        self.target_page: Optional[int] = 1
        self.from_page: Optional[int] = None
        self.to_page: Optional[int] = None
        self.all_pages: bool = False

        self.log_dir = "logs"
        self.log_level = "INFO"
        self.console_output = True

        self._load_ini()

    def _load_ini(self):
        if not os.path.exists(self.ini_path):
            return
        parser = configparser.ConfigParser(inline_comment_prefixes=("#", ";"))
        try:
            parser.read(self.ini_path, encoding="utf-8")
        except Exception:
            return

        def get(section, key, default):
            try:
                return parser.get(section, key)
            except Exception:
                return default

        self.db_path = get("database", "db_path", self.db_path)
        self.download_dir = get("download", "download_dir", self.download_dir)
        self.attach_naming = get("download", "attach_naming", self.attach_naming)
        self.download_attachments = parser.getboolean(
            "download", "download_attachments", fallback=self.download_attachments
        )
        self.skip_existing_files = parser.getboolean(
            "download", "skip_existing_files", fallback=self.skip_existing_files
        )

        self.bbs_id = get("crawler", "bbs_id", self.bbs_id)
        self.mi = get("crawler", "mi", self.mi)
        self.delay = parser.getfloat("crawler", "delay", fallback=self.delay)
        self.timeout = parser.getint("crawler", "timeout", fallback=self.timeout)
        self.retries = parser.getint("crawler", "retries", fallback=self.retries)
        self.retry_backoff = parser.getfloat("crawler", "retry_backoff", fallback=self.retry_backoff)
        self.page_size = parser.getint("crawler", "page_size", fallback=self.page_size)
        self.default_stage = get("crawler", "default_stage", self.default_stage)
        self.stage2_limit = parser.getint("crawler", "stage2_limit", fallback=self.stage2_limit)
        self.all_pages = parser.getboolean("crawler", "all_pages", fallback=self.all_pages)
        tp = get("crawler", "target_page", "")
        self.target_page = int(tp) if tp.strip() and tp.strip().lower() not in ("none", "") else None
        fp = get("crawler", "from_page", "") or get("crawler", "start_page", "")
        self.from_page = int(fp) if fp.strip() and fp.strip().lower() not in ("none", "") else None
        tp2 = get("crawler", "to_page", "") or get("crawler", "end_page", "")
        self.to_page = int(tp2) if tp2.strip() and tp2.strip().lower() not in ("none", "") else None

        self.log_dir = get("logging", "log_dir", self.log_dir)
        self.log_level = get("logging", "log_level", self.log_level)
        self.console_output = parser.getboolean("logging", "console_output", fallback=self.console_output)


def resolve_path(p: str, purpose: str = "") -> str:
    """
    플랫폼(Windows/Linux) 호환 경로 해석:
    - Windows에서는 'D:\\...' 경로를 그대로 사용합니다.
    - 비-Windows 환경에서 드라이브 문자(D:\\ 등)가 포함된 경우 자동으로
      로컬 안전 경로로 전환하고 경고를 출력합니다 (Linux/Docker 테스트 지원용).
    """
    if sys.platform != "win32" and re.match(r"^[A-Za-z]:[\\/]", p):
        # Linux/macOS fallback: convert "C:\SQLiteDB\..." to "./SQLiteDB/..."
        rel = re.sub(r"^[A-Za-z]:[\\/]+", "", p)
        safe = os.path.join(os.getcwd(), rel.replace("\\", os.sep))
        logging.getLogger(PROGRAM_NAME).warning(
            "비-Windows 환경 감지: %s 경로 '%s' -> 로컬 안전 경로 '%s'로 자동 전환되었습니다. "
            "(Windows에서는 원래 경로가 사용됩니다)", purpose, p, safe
        )
        return safe
    return p


# -----------------------------------------------------------------------------
# 로깅 설정 (logs\날짜.log)
# -----------------------------------------------------------------------------
def setup_logging(cfg: Config) -> logging.Logger:
    log_dir = cfg.log_dir
    os.makedirs(log_dir, exist_ok=True)
    today = dt.date.today().strftime("%Y-%m-%d")
    log_file = os.path.join(log_dir, f"{today}.log")

    level = getattr(logging, cfg.log_level.upper(), logging.INFO)
    logger = logging.getLogger(PROGRAM_NAME)
    logger.setLevel(level)
    logger.handlers.clear()

    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
    )

    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setLevel(level)
    fh.setFormatter(formatter)
    logger.addHandler(fh)

    if cfg.console_output:
        ch = logging.StreamHandler(sys.stdout)
        ch.setLevel(level)
        ch.setFormatter(formatter)
        logger.addHandler(ch)

    logger.info("=" * 70)
    logger.info("관세청 행정예고 크롤러 v%s 시작", PROGRAM_VERSION)
    logger.info("로그 파일: %s", os.path.abspath(log_file))
    logger.info("=" * 70)
    return logger


# -----------------------------------------------------------------------------
# 데이터베이스 계층
# -----------------------------------------------------------------------------
class Database:
    """SQLite 데이터베이스 관리 클래스 (기존 DB와 분리된 전용 테이블 운용)"""

    def __init__(self, db_path: str, logger: logging.Logger):
        self.db_path = resolve_path(db_path, "데이터베이스")
        self.logger = logger
        parent = os.path.dirname(os.path.abspath(self.db_path))
        if parent:
            os.makedirs(parent, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path, timeout=60.0)
        self.conn.row_factory = sqlite3.Row
        self._init_pragmas()
        self.init_schema()
        self.logger.info("데이터베이스 연결 완료: %s", os.path.abspath(self.db_path))

    def _init_pragmas(self):
        try:
            self.conn.execute("PRAGMA journal_mode=WAL;")
            self.conn.execute("PRAGMA busy_timeout=30000;")
            self.conn.execute("PRAGMA foreign_keys=ON;")
            self.conn.commit()
        except Exception:
            pass

    def init_schema(self):
        self.conn.executescript(SCHEMA_SQL)
        self.conn.commit()

    def now(self) -> str:
        return dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ---- Stage 1: 목록 저장/갱신 --------------------------------------------
    def upsert_notice_list(self, items: List[NoticeItem]) -> Tuple[int, int]:
        """목록 항목 일괄 UPSERT. 반환값: (신규건수, 갱신건수)"""
        inserted, updated = 0, 0
        now = self.now()
        for it in items:
            cur = self.conn.cursor()
            cur.execute(
                "SELECT id, stage2_done, crawl_status FROM customs_admin_notice WHERE ntt_sn = ?",
                (it.ntt_sn,),
            )
            row = cur.fetchone()
            if row is None:
                cur.execute(
                    """
                    INSERT INTO customs_admin_notice (
                        seq_no, ntt_sn, ntt_sn_url, bbs_id, mi,
                        list_title, full_title, writer, reg_date, view_count,
                        detail_url, content_html, content_text,
                        has_attachment, attach_count,
                        stage1_done, stage2_done, crawl_status,
                        error_message, source_screen, created_at, updated_at
                    ) VALUES (
                        ?, ?, ?, ?, ?,
                        ?, ?, ?, ?, ?,
                        ?, ?, ?,
                        ?, ?,
                        1, 0, 'LIST_DONE',
                        NULL, ?, ?, ?
                    )
                    """,
                    (
                        it.seq_no, it.ntt_sn, it.ntt_sn_url, it.bbs_id, it.mi,
                        it.list_title, it.full_title or it.list_title, it.writer,
                        it.reg_date, it.view_count,
                        it.detail_url, "", "",
                        "N", 0,
                        it.source_screen, now, now,
                    ),
                )
                inserted += 1
            else:
                # 이미 존재하는 건: 조회수 등 가변 정보만 안전 갱신 (기존 상세 수집 결과 보존)
                cur.execute(
                    """
                    UPDATE customs_admin_notice SET
                        seq_no = ?, ntt_sn_url = ?, bbs_id = ?, mi = ?,
                        list_title = ?,
                        full_title = CASE WHEN full_title IS NULL OR full_title = '' THEN ? ELSE full_title END,
                        writer = ?, reg_date = ?, view_count = ?,
                        stage1_done = 1,
                        updated_at = ?
                    WHERE ntt_sn = ?
                    """,
                    (
                        it.seq_no, it.ntt_sn_url, it.bbs_id, it.mi,
                        it.list_title, it.full_title or it.list_title,
                        it.writer, it.reg_date, it.view_count,
                        now, it.ntt_sn,
                    ),
                )
                updated += 1
        self.conn.commit()
        return inserted, updated

    # ---- Stage 2: 본문 상세 갱신 --------------------------------------------
    def update_notice_detail(self, ntt_sn: str, it: NoticeItem):
        now = self.now()
        self.conn.execute(
            """
            UPDATE customs_admin_notice SET
                full_title = ?, writer = ?, reg_date = ?,
                detail_url = ?, content_html = ?, content_text = ?,
                has_attachment = ?, attach_count = ?,
                stage2_done = ?, crawl_status = ?, error_message = ?,
                updated_at = ?
            WHERE ntt_sn = ?
            """,
            (
                it.full_title, it.writer, it.reg_date,
                it.detail_url, it.content_html, it.content_text,
                it.has_attachment, it.attach_count,
                it.stage2_done, it.crawl_status, it.error_message,
                now, ntt_sn,
            ),
        )
        self.conn.commit()

    def get_notice_id(self, ntt_sn: str) -> Optional[int]:
        cur = self.conn.cursor()
        cur.execute("SELECT id FROM customs_admin_notice WHERE ntt_sn = ?", (ntt_sn,))
        row = cur.fetchone()
        return row["id"] if row else None

    # ---- 첨부파일 UPSERT ----------------------------------------------------
    def upsert_attachment(self, att: AttachItem):
        cur = self.conn.cursor()
        cur.execute(
            """
            INSERT INTO customs_admin_notice_attach (
                notice_id, ntt_sn, seq_no, file_seq, file_key,
                file_name, file_ext, display_size, file_size_bytes,
                download_count, download_url, save_dir, saved_file_name,
                saved_full_path, download_status, error_message, downloaded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(ntt_sn, file_key) DO UPDATE SET
                notice_id = excluded.notice_id,
                seq_no = excluded.seq_no,
                file_seq = excluded.file_seq,
                file_name = excluded.file_name,
                file_ext = excluded.file_ext,
                display_size = excluded.display_size,
                file_size_bytes = excluded.file_size_bytes,
                download_count = excluded.download_count,
                download_url = excluded.download_url,
                save_dir = excluded.save_dir,
                saved_file_name = excluded.saved_file_name,
                saved_full_path = excluded.saved_full_path,
                download_status = excluded.download_status,
                error_message = excluded.error_message,
                downloaded_at = excluded.downloaded_at
            """,
            (
                att.notice_id, att.ntt_sn, att.seq_no, att.file_seq, att.file_key,
                att.file_name, att.file_ext, att.display_size, att.file_size_bytes,
                att.download_count, att.download_url, att.save_dir, att.saved_file_name,
                att.saved_full_path, att.download_status, att.error_message, att.downloaded_at,
            ),
        )
        self.conn.commit()

    def select_failed_attachments(self, limit: int = 0) -> List[sqlite3.Row]:
        lim = f"LIMIT {int(limit)}" if limit > 0 else ""
        cur = self.conn.cursor()
        cur.execute(
            f"""
            SELECT id, notice_id, ntt_sn, seq_no, file_seq, file_key,
                   file_name, file_ext, display_size, file_size_bytes,
                   download_count, download_url, save_dir, saved_file_name,
                   saved_full_path, download_status, error_message, downloaded_at
            FROM customs_admin_notice_attach
            WHERE download_status = 'FAILED'
            ORDER BY id ASC
            {lim}
            """
        )
        return cur.fetchall()

    # ---- 대상 조회 -----------------------------------------------------------
    def select_pending_stage2(
        self,
        force: bool = False,
        seq: Optional[int] = None,
        seq_start: Optional[int] = None,
        seq_end: Optional[int] = None,
        ntt_sn: Optional[str] = None,
        limit: int = 0,
    ) -> List[sqlite3.Row]:
        where = []
        params: list = []
        if ntt_sn:
            where.append("ntt_sn = ?")
            params.append(ntt_sn)
        elif seq is not None:
            where.append("seq_no = ?")
            params.append(seq)
        elif seq_start is not None or seq_end is not None:
            if seq_start is not None and seq_end is not None:
                lo, hi = sorted((seq_start, seq_end))
                where.append("seq_no BETWEEN ? AND ?")
                params.extend([lo, hi])
            elif seq_start is not None:
                where.append("seq_no >= ?")
                params.append(seq_start)
            else:
                where.append("seq_no <= ?")
                params.append(seq_end)
        else:
            if not force:
                where.append("stage2_done = 0")
        clause = ("WHERE " + " AND ".join(where)) if where else ""
        lim = f"LIMIT {int(limit)}" if limit > 0 else ""
        sql = f"""
            SELECT id, seq_no, ntt_sn, ntt_sn_url, bbs_id, mi, list_title,
                   full_title, writer, reg_date, view_count, stage1_done, stage2_done
            FROM customs_admin_notice
            {clause}
            ORDER BY seq_no DESC NULLS LAST, id DESC
            {lim}
        """
        cur = self.conn.cursor()
        cur.execute(sql, params)
        return cur.fetchall()

    def select_notice_ids_for_page(self, ntt_sn_list: List[str]) -> List[sqlite3.Row]:
        if not ntt_sn_list:
            return []
        placeholders = ",".join("?" for _ in ntt_sn_list)
        cur = self.conn.cursor()
        cur.execute(
            f"""
            SELECT id, seq_no, ntt_sn, ntt_sn_url, bbs_id, mi, list_title,
                   full_title, writer, reg_date, view_count, stage1_done, stage2_done
            FROM customs_admin_notice
            WHERE ntt_sn IN ({placeholders})
            ORDER BY seq_no DESC NULLS LAST, id DESC
            """,
            ntt_sn_list,
        )
        return cur.fetchall()

    # ---- 통계 및 로그 --------------------------------------------------------
    def stats(self) -> Dict:
        cur = self.conn.cursor()
        def one(q):
            cur.execute(q)
            r = cur.fetchone()
            return r[0] if r else 0
        return {
            "total_notices": one("SELECT COUNT(*) FROM customs_admin_notice"),
            "stage1_done": one("SELECT COUNT(*) FROM customs_admin_notice WHERE stage1_done=1"),
            "stage2_done": one("SELECT COUNT(*) FROM customs_admin_notice WHERE stage2_done=1"),
            "stage2_pending": one("SELECT COUNT(*) FROM customs_admin_notice WHERE stage2_done=0"),
            "failed_notices": one("SELECT COUNT(*) FROM customs_admin_notice WHERE crawl_status='FAILED'"),
            "total_attachments": one("SELECT COUNT(*) FROM customs_admin_notice_attach"),
            "att_success": one("SELECT COUNT(*) FROM customs_admin_notice_attach WHERE download_status='SUCCESS'"),
            "att_exists": one("SELECT COUNT(*) FROM customs_admin_notice_attach WHERE download_status='EXISTS'"),
            "att_failed": one("SELECT COUNT(*) FROM customs_admin_notice_attach WHERE download_status='FAILED'"),
            "att_total_bytes": one("SELECT COALESCE(SUM(file_size_bytes),0) FROM customs_admin_notice_attach WHERE download_status IN ('SUCCESS','EXISTS')"),
            "min_seq": one("SELECT MIN(seq_no) FROM customs_admin_notice"),
            "max_seq": one("SELECT MAX(seq_no) FROM customs_admin_notice"),
        }

    def record_log(self, data: Dict):
        self.conn.execute(
            """
            INSERT INTO customs_admin_notice_crawl_log (
                run_id, stage, page_mode, page_start, page_end,
                target_count, success_count, fail_count, skip_count,
                started_at, finished_at, elapsed_seconds, status, message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["run_id"], data["stage"], data["page_mode"],
                data["page_start"], data["page_end"],
                data["target_count"], data["success_count"], data["fail_count"],
                data["skip_count"], data["started_at"], data["finished_at"],
                data["elapsed_seconds"], data["status"], data["message"],
            ),
        )
        self.conn.commit()

    def close(self):
        try:
            self.conn.close()
        except Exception:
            pass


# -----------------------------------------------------------------------------
# 스크래퍼 계층 (HTTP 세션 및 파싱)
# -----------------------------------------------------------------------------
class CustomsScraper:
    """관세청 행정규칙 행정예고 전용 HTTP 스크래퍼"""

    def __init__(self, cfg: Config, logger: logging.Logger):
        self.cfg = cfg
        self.logger = logger
        self.session = self._build_session()

    def _build_session(self) -> requests.Session:
        s = requests.Session()
        s.headers.update({
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Connection": "keep-alive",
        })
        retry = Retry(
            total=self.cfg.retries,
            backoff_factor=self.cfg.retry_backoff,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST", "HEAD"],
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
        s.mount("http://", adapter)
        s.mount("https://", adapter)
        return s

    def close(self):
        try:
            self.session.close()
        except Exception:
            pass

    # ---- 유틸 ----------------------------------------------------------------
    @staticmethod
    def norm_date(s: str) -> str:
        if not s:
            return ""
        s = re.sub(r"[.\s]+", "-", s.strip().rstrip(".")).strip("-")
        return s

    @staticmethod
    def parse_int(s: str) -> Optional[int]:
        if s is None:
            return None
        digits = re.sub(r"[^\d]", "", str(s))
        return int(digits) if digits else None

    @staticmethod
    def safe_filename(name: str) -> str:
        name = html.unescape(name or "")
        name = re.sub(r"[\x00-\x1f]", "", name)
        name = re.sub(r'[\\/:*?"<>|]', "_", name)
        name = re.sub(r"\s+", " ", name).strip(" .")
        return name[:180] or "attachment"

    @staticmethod
    def extract_filename_from_cd(cd: str) -> Optional[str]:
        if not cd:
            return None
        m = re.search(r"filename\*\s*=\s*UTF-8''([^;]+)", cd, re.I)
        if m:
            return urllib.parse.unquote(m.group(1).strip().strip('"'))
        m = re.search(r'filename\s*=\s*"([^"]+)"', cd, re.I) or re.search(
            r"filename\s*=\s*([^;]+)", cd, re.I
        )
        if m:
            raw = m.group(1).strip()
            return urllib.parse.unquote(raw) if "%" in raw else raw
        return None

    # ---- 1단계: 목록 페이지 파싱 --------------------------------------------
    def get_total_info(self, bbs_id: str = DEFAULT_BBS_ID, mi: str = DEFAULT_MI, list_co: int = 10):
        url = f"{LIST_URL}?mi={mi}&bbsId={bbs_id}&currPage=1&listCo={list_co}"
        r = self.session.get(url, timeout=self.cfg.timeout)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "lxml" if "lxml" in sys.modules else "html.parser")
        m = re.search(r"전체\s*([\d,]+)\s*건.*?(\d+)\s*/\s*(\d+)\s*페이지", soup.get_text())
        if not m:
            return None, None, None
        tot = self.parse_int(m.group(1))
        cur = self.parse_int(m.group(2))
        tpages = self.parse_int(m.group(3))
        return tot, cur, tpages

    def fetch_list_page(
        self,
        page: int,
        bbs_id: str = DEFAULT_BBS_ID,
        mi: str = DEFAULT_MI,
        list_co: int = 10,
    ) -> Tuple[List[NoticeItem], Optional[int], Optional[int]]:
        """단일 목록 페이지 파싱. 반환: (항목목록, 총항목수, 총페이지수)"""
        url = f"{LIST_URL}?mi={mi}&bbsId={bbs_id}&currPage={page}&listCo={list_co}"
        r = self.session.get(url, timeout=self.cfg.timeout)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "lxml" if "lxml" in sys.modules else "html.parser")

        # total info
        tot, tpages = None, None
        m = re.search(r"전체\s*([\d,]+)\s*건.*?(\d+)\s*/\s*(\d+)\s*페이지", soup.get_text())
        if m:
            tot = self.parse_int(m.group(1))
            tpages = self.parse_int(m.group(3))

        table = soup.find("table", class_="bbsList")
        if not table:
            return [], tot, tpages

        items: List[NoticeItem] = []
        for tr in table.find_all("tr")[1:]:
            tds = tr.find_all("td")
            if len(tds) < 5:
                continue
            # 빈 페이지 메시지 행 필터
            row_text = tr.get_text(" ", strip=True)
            if "등록된" in row_text and ("없습니다" in row_text or "없음" in row_text):
                continue
            seq = self.parse_int(tds[0].get_text(strip=True))
            a = tr.find("a", class_="nttInfoBtn") or tr.find("a")
            if not a:
                continue
            list_title = (a.get_text(strip=True) if a else tds[1].get_text(strip=True))
            full_title = a.get("title", "").strip() if a else list_title
            writer = tds[2].get_text(strip=True)
            reg_date = self.norm_date(tds[3].get_text(strip=True))
            view_count = self.parse_int(tds[4].get_text(strip=True))
            item_bbs = (a.get("data-bbs") or bbs_id).strip()
            item_mi = (a.get("data-mi") or mi).strip()
            ntt_sn = (a.get("data-id") or "").strip()
            ntt_sn_url = (a.get("data-url") or "").strip()
            if not ntt_sn:
                continue
            detail_url = (
                f"{DETAIL_URL}?mi={item_mi}&bbsId={item_bbs}"
                f"&nttSn={ntt_sn}&nttSnUrl={ntt_sn_url}"
            )
            it = NoticeItem(
                seq_no=seq,
                ntt_sn=ntt_sn,
                ntt_sn_url=ntt_sn_url,
                bbs_id=item_bbs,
                mi=item_mi,
                list_title=list_title,
                full_title=full_title or list_title,
                writer=writer,
                reg_date=reg_date,
                view_count=view_count,
                detail_url=detail_url,
            )
            items.append(it)
        return items, tot, tpages

    # ---- 2단계: 상세 페이지 파싱 --------------------------------------------
    def fetch_detail(
        self,
        ntt_sn: str,
        ntt_sn_url: str,
        bbs_id: str = DEFAULT_BBS_ID,
        mi: str = DEFAULT_MI,
    ) -> NoticeItem:
        """상세 페이지를 GET 조회하여 본문 및 첨부파일 메타정보를 수집"""
        detail_url = (
            f"{DETAIL_URL}?mi={mi}&bbsId={bbs_id}&nttSn={ntt_sn}&nttSnUrl={ntt_sn_url}"
        )
        r = self.session.get(detail_url, timeout=self.cfg.timeout)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "lxml" if "lxml" in sys.modules else "html.parser")

        # 제목
        h3 = soup.find("h3", class_="bbsTitle")
        full_title = h3.get_text(strip=True) if h3 else ""

        # 작성자 / 등록일
        writer, reg_date = "", ""
        tbl = soup.find("table", class_="bbsView")
        if tbl:
            for tr in tbl.find_all("tr"):
                ths = [th.get_text(strip=True) for th in tr.find_all("th")]
                tds = tr.find_all("td")
                if "작성자" in ths:
                    i = ths.index("작성자")
                    if i < len(tds):
                        writer = tds[i].get_text(strip=True)
                if "등록일" in ths:
                    i = ths.index("등록일")
                    if i < len(tds):
                        reg_date = self.norm_date(tds[i].get_text(strip=True))

        # 본문 HTML / 텍스트
        con = None
        if tbl:
            con = tbl.find("td", class_="conts")
        if not con:
            con = soup.find(class_=re.compile(r"\bconts\b"))
        content_html = str(con) if con else ""
        content_text = con.get_text("\n", strip=True) if con else ""

        # 첨부파일 메타 파싱
        attachments: List[AttachItem] = []
        file_container = soup.find("ul", class_="list_file")
        if file_container:
            for a in file_container.find_all("a"):
                href = a.get("href", "") or ""
                # 문서 바로보기 링크(#viewer 등) 제외, 다운로드 링크만 포함
                km = re.search(r"fileKey=([a-zA-Z0-9]+)", href)
                if not km:
                    continue
                file_key = km.group(1)
                title_attr = a.get("title", "")
                fn = title_attr.replace(" 다운로드", "").replace("다운로드", "").strip()
                tt = a.get_text(" ", strip=True)
                # 크기 표시 ([44007])
                sm = re.search(r"\[([^\]]+)\]", tt)
                disp_size = sm.group(1).strip() if sm else ""
                # 다운로드 횟수 ((다운로드 : 520회))
                dm = re.search(r"\(다운로드\s*:\s*([\d,]+)회\)", tt)
                dl_count = dm.group(1).strip() if dm else ""
                if not fn:
                    # 텍스트 앞부분에서 파일명 추정
                    head = re.split(r"\[|\(", tt, 1)[0].strip()
                    fn = head
                dl_url = urllib.parse.urljoin(BASE_URL, href)
                ext = ""
                if fn and "." in fn:
                    ext = fn.rsplit(".", 1)[-1].lower()
                att = AttachItem(
                    file_key=file_key,
                    file_name=fn,
                    file_ext=ext,
                    display_size=disp_size,
                    download_count=dl_count,
                    download_url=dl_url,
                    ntt_sn=ntt_sn,
                )
                attachments.append(att)

        has_att = "Y" if attachments else "N"
        it = NoticeItem(
            seq_no=None,
            ntt_sn=ntt_sn,
            ntt_sn_url=ntt_sn_url,
            bbs_id=bbs_id,
            mi=mi,
            list_title="",
            full_title=full_title,
            writer=writer,
            reg_date=reg_date,
            view_count=None,
            detail_url=detail_url,
            content_html=content_html,
            content_text=content_text,
            has_attachment=has_att,
            attach_count=len(attachments),
            stage1_done=1,
            stage2_done=1,
            crawl_status="DETAIL_DONE",
            attachments=attachments,
        )
        return it

    # ---- 첨부파일 다운로드 ---------------------------------------------------
    def download_attachment(
        self,
        att: AttachItem,
        save_dir: str,
        naming: str = "seq_prefix",
        seq_no: Optional[int] = None,
        title_hint: str = "",
        force: bool = False,
    ) -> AttachItem:
        """개별 첨부파일을 지정 폴더에 안전하게 다운로드"""
        out_dir = resolve_path(save_dir, "첨부파일 저장 폴더")
        os.makedirs(out_dir, exist_ok=True)
        url = att.download_url or f"{FILE_URL}?fileKey={att.file_key}"
        att.download_url = url
        att.save_dir = out_dir
        now = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # 1차 후보 파일명 (상세 메타 파싱 결과)
        candidate_name = self.safe_filename(att.file_name or f"attachment_{att.file_key}")

        try:
            r = self.session.get(
                url,
                stream=True,
                timeout=max(self.cfg.timeout * 2, 60),
                headers={"Referer": DETAIL_URL},
            )
            r.raise_for_status()

            # 서버 Content-Disposition 우선 적용
            server_name = self.extract_filename_from_cd(
                r.headers.get("Content-Disposition", "")
            )
            if server_name:
                candidate_name = self.safe_filename(server_name)

            # 저장 경로 조립
            final_name = candidate_name
            target_dir = out_dir
            if naming == "subfolder":
                folder_name = self.safe_filename(
                    f"{seq_no}_{title_hint[:40]}" if (seq_no and title_hint) else (str(seq_no or "etc"))
                )
                target_dir = os.path.join(out_dir, folder_name)
                os.makedirs(target_dir, exist_ok=True)
            elif naming == "original":
                final_name = candidate_name
            else:  # seq_prefix (기본)
                if seq_no:
                    final_name = self.safe_filename(f"{seq_no}_{candidate_name}")

            # original 모드 중복명 충돌 회피
            full_path = os.path.join(target_dir, final_name)
            if naming == "original" and os.path.exists(full_path):
                # 이미 동일 파일이 다른 건의 것으로 존재할 때 자동 번호
                stem, ext_part = os.path.splitext(final_name)
                k = 1
                while os.path.exists(full_path):
                    full_path = os.path.join(target_dir, f"{stem}_{k}{ext_part}")
                    k += 1
                final_name = os.path.basename(full_path)

            att.saved_file_name = final_name
            att.saved_full_path = os.path.abspath(full_path)
            att.file_name = server_name or candidate_name
            att.file_ext = (os.path.splitext(final_name)[1].lstrip(".").lower()) or att.file_ext

            # 기존 파일 재사용 체크
            if self.cfg.skip_existing_files and not force and os.path.exists(full_path):
                existing_size = os.path.getsize(full_path)
                if existing_size > 0:
                    att.file_size_bytes = existing_size
                    att.download_status = "EXISTS"
                    att.downloaded_at = now
                    r.close()
                    return att

            bytes_written = 0
            with open(full_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=65536):
                    if chunk:
                        f.write(chunk)
                        bytes_written += len(chunk)

            att.file_size_bytes = bytes_written
            att.download_status = "SUCCESS"
            att.downloaded_at = now
            return att

        except Exception as e:
            att.download_status = "FAILED"
            att.error_message = str(e)[:500]
            att.downloaded_at = now
            self.logger.warning("첨부파일 다운로드 실패 [%s]: %s", att.file_key, e)
            return att


# -----------------------------------------------------------------------------
# 크롤러 오케스트레이션 계층
# -----------------------------------------------------------------------------
class CustomsCrawler:
    """Stage 1 / Stage 2 / 통합 수집을 실행하는 상위 오케스트레이터"""

    def __init__(self, cfg: Config, logger: logging.Logger):
        self.cfg = cfg
        self.logger = logger
        self.cfg.db_path = resolve_path(self.cfg.db_path, "데이터베이스")
        self.cfg.download_dir = resolve_path(self.cfg.download_dir, "첨부파일 저장 폴더")
        self.db = Database(cfg.db_path, logger)
        self.scraper = CustomsScraper(cfg, logger)
        self.stop_requested = False
        signal.signal(signal.SIGINT, self._handle_signal)
        try:
            signal.signal(signal.SIGTERM, self._handle_signal)
        except Exception:
            pass

    def _handle_signal(self, signum, frame):
        self.logger.warning("중단 신호(SIGINT/SIGTERM) 수신. 현재 작업 완료 후 안전 종료합니다...")
        self.stop_requested = True

    def close(self):
        self.scraper.close()
        self.db.close()

    def _sleep(self):
        if self.cfg.delay > 0 and not self.stop_requested:
            time.sleep(self.cfg.delay)

    # -------------------------------------------------------------------------
    # Stage 1: 목록 수집
    # -------------------------------------------------------------------------
    def run_stage1(
        self,
        pages: List[int],
        bbs_id: str = DEFAULT_BBS_ID,
        mi: str = DEFAULT_MI,
    ) -> Tuple[int, int, List[NoticeItem]]:
        """
        지정 페이지 목록에 대해 공고 목록을 수집하여 DB에 저장합니다.
        반환: (신규건수, 갱신건수, 전체수집항목리스트)
        """
        self.logger.info("-" * 70)
        self.logger.info("[Stage 1] 목록 수집 시작 - 대상 페이지: %s", self._pages_summary(pages))
        self.logger.info("-" * 70)

        total_inserted = 0
        total_updated = 0
        all_items: List[NoticeItem] = []
        consecutive_empty = 0

        for idx, page in enumerate(pages, 1):
            if self.stop_requested:
                break
            try:
                items, tot, tpages = self.scraper.fetch_list_page(
                    page=page, bbs_id=bbs_id, mi=mi, list_co=self.cfg.page_size
                )
            except Exception as e:
                self.logger.error("[Stage 1] 페이지 %d 수집 실패: %s", page, e)
                self._sleep()
                continue

            if not items:
                self.logger.info("[Stage 1] 페이지 %d: 데이터 없음", page)
                consecutive_empty += 1
                if consecutive_empty >= 2:
                    self.logger.info("[Stage 1] 연속 빈 페이지 감지 - 목록 수집 조기 종료")
                    break
                self._sleep()
                continue
            consecutive_empty = 0

            seqs = [it.seq_no for it in items if it.seq_no is not None]
            min_s, max_s = (min(seqs), max(seqs)) if seqs else ("-", "-")
            inserted, updated = self.db.upsert_notice_list(items)
            total_inserted += inserted
            total_updated += updated
            all_items.extend(items)

            self.logger.info(
                "[Stage 1] (%d/%d) 페이지 %d 완료: %d건 수집 (seq %s ~ %s) | 신규 %d건, 갱신 %d건 "
                "[전체게시물 %s건 / %s페이지]",
                idx, len(pages), page, len(items), max_s, min_s, inserted, updated,
                f"{tot:,}" if tot else "?", tpages if tpages else "?",
            )
            self._sleep()

        self.logger.info(
            "[Stage 1] 목록 수집 완료 - 총 %d건 수집 (신규 %d건, 갱신 %d건)",
            len(all_items), total_inserted, total_updated,
        )
        return total_inserted, total_updated, all_items

    # -------------------------------------------------------------------------
    # Stage 2: 본문 및 첨부파일 수집
    # -------------------------------------------------------------------------
    def run_stage2(
        self,
        targets: Optional[List[sqlite3.Row]] = None,
        force: bool = False,
        seq: Optional[int] = None,
        seq_start: Optional[int] = None,
        seq_end: Optional[int] = None,
        ntt_sn: Optional[str] = None,
        limit: int = 0,
        no_attach: bool = False,
    ) -> Tuple[int, int, int]:
        """
        DB에 저장된 공고 목록을 대상으로 본문(HTML/텍스트) 및 첨부파일을 수집합니다.
        반환: (성공건수, 실패건수, 건너뜀건수)
        """
        if targets is None:
            targets = self.db.select_pending_stage2(
                force=force, seq=seq, seq_start=seq_start, seq_end=seq_end,
                ntt_sn=ntt_sn, limit=limit,
            )
        total = len(targets)
        self.logger.info("-" * 70)
        self.logger.info(
            "[Stage 2] 본문/첨부파일 수집 시작 - 대상: %d건 (첨부파일 다운로드: %s)",
            total, "비활성화" if no_attach or not self.cfg.download_attachments else "활성화",
        )
        self.logger.info("-" * 70)

        success, fail, skipped = 0, 0, 0

        for i, row in enumerate(targets, 1):
            if self.stop_requested:
                break
            sn = row["ntt_sn"]
            sn_url = row["ntt_sn_url"]
            seq_no = row["seq_no"]
            bbs = row["bbs_id"] or DEFAULT_BBS_ID
            mi = row["mi"] or DEFAULT_MI
            preview = (row["full_title"] or row["list_title"] or sn)[:45]

            # ntt_sn_url 누락 방어
            if not sn_url:
                self.logger.warning("[Stage 2] (%d/%d) ntt_sn_url 누락으로 건너뜀: ntt_sn=%s", i, total, sn)
                skipped += 1
                continue

            try:
                it = self.scraper.fetch_detail(ntt_sn=sn, ntt_sn_url=sn_url, bbs_id=bbs, mi=mi)
                it.seq_no = seq_no
                it.list_title = row["list_title"]
                self.db.update_notice_detail(sn, it)

                notice_id = row["id"] or self.db.get_notice_id(sn)

                # 첨부파일 처리
                dl_ok, dl_ex, dl_fail = 0, 0, 0
                for fseq, att in enumerate(it.attachments, 1):
                    att.notice_id = notice_id
                    att.seq_no = seq_no
                    att.file_seq = fseq

                    if no_attach or not self.cfg.download_attachments:
                        att.download_status = "PENDING"
                    else:
                        att = self.scraper.download_attachment(
                            att,
                            save_dir=self.cfg.download_dir,
                            naming=self.cfg.attach_naming,
                            seq_no=seq_no,
                            title_hint=it.full_title or preview,
                            force=force,
                        )
                    self.db.upsert_attachment(att)
                    if att.download_status == "SUCCESS":
                        dl_ok += 1
                    elif att.download_status == "EXISTS":
                        dl_ex += 1
                    elif att.download_status == "FAILED":
                        dl_fail += 1

                att_info = (
                    f"첨부 {len(it.attachments)}개(신규{dl_ok}/기존{dl_ex}/실패{dl_fail})"
                    if it.attachments else "첨부 없음"
                )
                self.logger.info(
                    "[Stage 2] (%d/%d) #%s [%s] 본문 OK | %s",
                    i, total, seq_no or "-", preview, att_info,
                )
                success += 1

            except Exception as e:
                self.logger.error("[Stage 2] (%d/%d) #%s [%s] 실패: %s", i, total, seq_no or "-", preview, e)
                # 실패 상태 DB 기록
                fail_it = NoticeItem(
                    seq_no=seq_no, ntt_sn=sn, ntt_sn_url=sn_url, bbs_id=bbs, mi=mi,
                    list_title=row["list_title"] or "", full_title=row["full_title"] or "",
                    writer=row["writer"] or "", reg_date=row["reg_date"] or "",
                    view_count=row["view_count"],
                    crawl_status="FAILED", stage2_done=0, error_message=str(e)[:500],
                )
                self.db.update_notice_detail(sn, fail_it)
                fail += 1

            self._sleep()

        self.logger.info(
            "[Stage 2] 본문/첨부파일 수집 완료 - 성공 %d건, 실패 %d건, 건너뜀 %d건 (총 %d건)",
            success, fail, skipped, total,
        )
        return success, fail, skipped

    def run_retry_failed_attachments(self) -> Tuple[int, int]:
        """download_status = 'FAILED'인 첨부파일만 재시도"""
        targets = self.db.select_failed_attachments()
        total = len(targets)
        self.logger.info("-" * 70)
        self.logger.info("[실패 첨부파일 재시도] 대상: %d개", total)
        self.logger.info("-" * 70)
        ok, fail = 0, 0
        for i, row in enumerate(targets, 1):
            if self.stop_requested:
                break
            att = AttachItem(
                file_key=row["file_key"],
                file_name=row["file_name"] or "",
                file_ext=row["file_ext"] or "",
                display_size=row["display_size"] or "",
                download_count=row["download_count"] or "",
                download_url=row["download_url"] or "",
                notice_id=row["notice_id"],
                ntt_sn=row["ntt_sn"],
                seq_no=row["seq_no"],
                file_seq=row["file_seq"] or 0,
            )
            att = self.scraper.download_attachment(
                att,
                save_dir=row["save_dir"] or self.cfg.download_dir,
                naming=self.cfg.attach_naming,
                seq_no=row["seq_no"],
                force=True,
            )
            self.db.upsert_attachment(att)
            if att.download_status in ("SUCCESS", "EXISTS"):
                ok += 1
                self.logger.info("[재시도] (%d/%d) #%s [%s] 성공", i, total, row["seq_no"] or "-", att.saved_file_name)
            else:
                fail += 1
                self.logger.warning("[재시도] (%d/%d) #%s 실패: %s", i, total, row["seq_no"] or "-", att.error_message)
            self._sleep()
        self.logger.info("[실패 첨부파일 재시도] 완료 - 성공 %d개, 실패 %d개", ok, fail)
        return ok, fail

    # -------------------------------------------------------------------------
    # 통합 수집 (Stage 1 + Stage 2)
    # -------------------------------------------------------------------------
    def run_combined(
        self,
        pages: List[int],
        no_attach: bool = False,
        force: bool = False,
    ):
        """지정 페이지에 대해 목록 수집(Stage 1) 후 해당 건들의 본문/첨부 수집(Stage 2)을 수행"""
        self.logger.info("=" * 70)
        self.logger.info("관세청 행정예고 크롤러 - 통합 수집(Stage 1 + 2) 시작")
        self.logger.info("=" * 70)

        t_inserted, t_updated, items = self.run_stage1(pages)
        if self.stop_requested or not items:
            return

        sn_list = [it.ntt_sn for it in items]
        targets = self.db.select_notice_ids_for_page(sn_list)
        if not force:
            targets = [t for t in targets if t["stage2_done"] == 0]

        if not targets:
            self.logger.info("[Stage 2] 이미 상세 수집이 완료된 건들입니다. 추가 작업 없음.")
            return

        self.run_stage2(targets=targets, force=force, no_attach=no_attach)

    # -------------------------------------------------------------------------
    # 페이지 계산 헬퍼
    # -------------------------------------------------------------------------
    def resolve_pages(
        self,
        page: Optional[int],
        from_page: Optional[int],
        to_page: Optional[int],
        all_pages: bool,
    ) -> Tuple[List[int], str, int, int]:
        """(pages, page_mode, page_start, page_end) 계산
        CLI 인자가 없으면 config.ini(또는 기본 1페이지) 설정을 자동 적용합니다."""
        tot, _, tpages = self.scraper.get_total_info(list_co=self.cfg.page_size)
        if tpages is None:
            tpages = 146
            self.logger.warning("전체 페이지 수 감지 실패 - 기본 %d페이지로 대체", tpages)
        else:
            self.logger.info("사이트 전체 통계: 게시물 약 %s건 / %d페이지", f"{tot:,}" if tot else "?", tpages)

        # 1) 전체 페이지: CLI 플래그 또는 config.ini all_pages
        if all_pages or (page is None and from_page is None and to_page is None and self.cfg.all_pages):
            return list(range(1, tpages + 1)), "all", 1, tpages

        # 2) CLI 명시 단일 페이지
        if page is not None:
            if page < 1:
                page = 1
            if page > tpages:
                self.logger.warning("요청 페이지(%d)가 전체 페이지(%d)를 초과합니다.", page, tpages)
            return [page], "single", page, page

        # 3) CLI 명시 범위 페이지
        if from_page is not None or to_page is not None:
            f = max(1, from_page if from_page is not None else 1)
            t = min(tpages, to_page if to_page is not None else f)
            if f > t:
                f, t = t, f
            return list(range(f, t + 1)), "range", f, t

        # 4) config.ini 범위 설정
        if self.cfg.from_page is not None or self.cfg.to_page is not None:
            f = max(1, self.cfg.from_page if self.cfg.from_page is not None else 1)
            t = min(tpages, self.cfg.to_page if self.cfg.to_page is not None else f)
            if f > t:
                f, t = t, f
            return list(range(f, t + 1)), "range", f, t

        # 5) config.ini 단일 페이지 (또는 최종 기본 1페이지)
        p = self.cfg.target_page if self.cfg.target_page is not None else 1
        p = max(1, min(tpages, p))
        return [p], "single", p, p

    @staticmethod
    def _pages_summary(pages: List[int]) -> str:
        if not pages:
            return "없음"
        if len(pages) == 1:
            return f"{pages[0]}페이지"
        if pages == list(range(pages[0], pages[-1] + 1)):
            return f"{pages[0]} ~ {pages[-1]}페이지 (총 {len(pages)}페이지)"
        return f"{pages[0]} ~ {pages[-1]}페이지 외 (총 {len(pages)}페이지)"

    # -------------------------------------------------------------------------
    # 실행 통계 및 상태 출력
    # -------------------------------------------------------------------------
    def show_status(self):
        st = self.db.stats()
        print("\n" + "=" * 60)
        print("          관세청 행정예고 크롤링 DB 현황")
        print("=" * 60)
        print(f" * DB 경로            : {os.path.abspath(self.db.db_path)}")
        print(f" * 첨부파일 저장 경로 : {os.path.abspath(self.cfg.download_dir)}")
        print(f" * 대상 게시판        : 행정규칙 행정예고 (bbsId={self.cfg.bbs_id}, mi={self.cfg.mi})")
        print("-" * 60)
        print(f" * 전체 수집 공고 수  : {st['total_notices']:,} 건 (seq {st['min_seq']} ~ {st['max_seq']})")
        print(f" * 목록(Stage 1) 완료 : {st['stage1_done']:,} 건")
        print(f" * 상세(Stage 2) 완료 : {st['stage2_done']:,} 건")
        print(f" * 상세 미수집(대기)  : {st['stage2_pending']:,} 건")
        print(f" * 수집 실패          : {st['failed_notices']:,} 건")
        print("-" * 60)
        print(f" * 전체 첨부파일 수   : {st['total_attachments']:,} 개")
        print(f" * 다운로드 성공      : {st['att_success']:,} 개")
        print(f" * 기존 파일 재사용   : {st['att_exists']:,} 개")
        print(f" * 다운로드 실패      : {st['att_failed']:,} 개")
        print(f" * 다운로드 누적 용량 : {st['att_total_bytes'] / (1024*1024):,.1f} MB")
        print("=" * 60 + "\n")


# -----------------------------------------------------------------------------
# 대화형 메뉴 (run_crawler.bat 등 배치 실행 시 편리하게 사용)
# -----------------------------------------------------------------------------
def interactive_menu(crawler: CustomsCrawler, args: argparse.Namespace):
    while True:
        crawler.show_status()
        print("[크롤링 메뉴 선택]")
        print("  1. 전체 수집 - 1페이지만 (빠른 테스트, Stage 1+2)")
        print("  2. 전체 수집 - 페이지 범위 지정 (From ~ To, Stage 1+2)")
        print("  3. 전체 수집 - 전체 페이지 (Stage 1+2, 시간 소요)")
        print("  4. 1단계만 - 목록 정보만 수집")
        print("  5. 2단계만 - 미수집 본문/첨부파일 수집")
        print("  6. 2단계만 - 특정 공고번호 지정 수집")
        print("  7. DB 현황 새로고침")
        print("  0. 종료")
        try:
            choice = input("\n메뉴 번호를 입력하세요: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n종료합니다.")
            break

        if choice == "1":
            crawler.run_combined([1], no_attach=args.no_attach, force=args.force)
        elif choice == "2":
            try:
                f = int(input("시작 페이지(From): ").strip())
                t = int(input("종료 페이지(To): ").strip())
            except ValueError:
                print("올바른 숫자를 입력하세요.")
                continue
            pages, mode, ps, pe = crawler.resolve_pages(
                page=None, from_page=f, to_page=t, all_pages=False
            )
            crawler.run_combined(pages, no_attach=args.no_attach, force=args.force)
        elif choice == "3":
            cf = input("전체 페이지 수집을 시작합니다. 계속하시겠습니까? (y/n): ").strip().lower()
            if cf == "y":
                pages, mode, ps, pe = crawler.resolve_pages(
                    page=None, from_page=None, to_page=None, all_pages=True
                )
                crawler.run_combined(pages, no_attach=args.no_attach, force=args.force)
        elif choice == "4":
            print("  4-1. 1페이지만")
            print("  4-2. 페이지 범위 지정")
            print("  4-3. 전체 페이지")
            sub = input("선택: ").strip()
            if sub == "1":
                crawler.run_stage1([1])
            elif sub == "2":
                try:
                    f = int(input("시작 페이지(From): ").strip())
                    t = int(input("종료 페이지(To): ").strip())
                except ValueError:
                    print("올바른 숫자를 입력하세요.")
                    continue
                pages, mode, ps, pe = crawler.resolve_pages(
                    page=None, from_page=f, to_page=t, all_pages=False
                )
                crawler.run_stage1(pages)
            elif sub == "3":
                pages, mode, ps, pe = crawler.resolve_pages(
                    page=None, from_page=None, to_page=None, all_pages=True
                )
                crawler.run_stage1(pages)
        elif choice == "5":
            lim = input("처리 건수 제한 (0=무제한, 기본 0): ").strip()
            try:
                lim = int(lim) if lim else 0
            except ValueError:
                lim = 0
            crawler.run_stage2(limit=lim, force=args.force, no_attach=args.no_attach)
        elif choice == "6":
            try:
                seq = int(input("공고번호(seq_no, 예: 1451): ").strip())
            except ValueError:
                print("올바른 숫자를 입력하세요.")
                continue
            crawler.run_stage2(seq=seq, force=True, no_attach=args.no_attach)
        elif choice == "7":
            continue
        elif choice in ("0", "q", "exit"):
            print("종료합니다.")
            break
        else:
            print("잘못된 선택입니다.")
        crawler.stop_requested = False


# -----------------------------------------------------------------------------
# CLI 파서 및 main()
# -----------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog=PROGRAM_NAME,
        description=(
            "관세청 행정규칙 행정예고 크롤러 - 국민참여 > 알림·소식 > 공고·공시 > 행정규칙 행정예고 "
            "게시판의 공고 목록, 본문, 첨부파일을 수집하여 SQLite DB 및 로컬 폴더에 저장합니다."
        ),
        formatter_class=argparse.RawTextHelpFormatter,
    )
    p.add_argument(
        "--stage",
        choices=["1", "2", "all"],
        default=None,
        help=(
            "수집 단계 선택 (기본: all)\n"
            "  1   : 목록(Stage 1) 정보만 수집하여 DB에 저장\n"
            "  2   : DB에 저장된 목록 기준으로 본문/첨부파일(Stage 2) 수집\n"
            "  all : Stage 1 후 Stage 2를 순차 통합 실행"
        ),
    )
    p.add_argument(
        "pos_page",
        nargs="*",
        default=[],
        help=r"""단축 페이지 지정 (선택, 위치 인자):
  customs_crawler.py 1       → 1페이지 자동 수집
  customs_crawler.py 1 5     → 1~5페이지 자동 수집
  customs_crawler.py all     → 전체 페이지 자동 수집
  (생략 시 config.ini 설정 또는 1페이지 자동 수집)""",
    )
    grp = p.add_argument_group("페이지 지정 (1단계 또는 통합 모드에서 적용)")
    grp.add_argument("--page", "-p", type=int, help="단일 페이지 번호 (예: 1)")
    grp.add_argument("--from-page", type=int, help="시작 페이지 번호")
    grp.add_argument("--to-page", type=int, help="종료 페이지 번호")
    grp.add_argument("--start-page", dest="from_page", type=int, help="시작 페이지 번호 (별칭: --from-page 와 동일)")
    grp.add_argument("--end-page", dest="to_page", type=int, help="종료 페이지 번호 (별칭: --to-page 와 동일)")
    grp.add_argument("--from", dest="from_page", type=int, help="시작 페이지 번호 (예: --from 1)")
    grp.add_argument("--to", dest="to_page", type=int, help="종료 페이지 번호 (예: --to 10)")
    grp.add_argument("--all-pages", action="store_true", help="전체 페이지 자동 순회 수집")
    grp.add_argument(
        "--page-size",
        type=int,
        choices=[10, 20, 30, 40, 50],
        default=None,
        help="목록 페이지당 항목 수 (10/20/30/40/50, 기본: 10)",
    )

    grp2 = p.add_argument_group("2단계 전용 옵션")
    grp2.add_argument("--seq", type=int, help="특정 공고번호(seq_no) 1건만 상세 수집")
    grp2.add_argument("--seq-from", type=int, help="공고번호 범위 시작")
    grp2.add_argument("--seq-to", type=int, help="공고번호 범위 종료")
    grp2.add_argument("--ntt-sn", type=str, help="특정 게시물 ID(ntt_sn) 1건만 상세 수집")
    grp2.add_argument("--limit", type=int, default=0, help="2단계 처리 최대 건수 (0=무제한)")
    grp2.add_argument(
        "--force",
        action="store_true",
        help="이미 완료된 건도 재수집/재다운로드",
    )
    grp2.add_argument(
        "--retry-failed",
        action="store_true",
        help="다운로드 실패('FAILED') 상태인 첨부파일만 재시도",
    )

    grp3 = p.add_argument_group("저장소 및 네트워크 옵션")
    grp3.add_argument("--db-path", default=None, help="SQLite DB 파일 경로 (기본: D:\\SQLiteDB\\smart_law_ai.db)")
    grp3.add_argument(
        "--download-dir",
        default=None,
        help="첨부파일 저장 폴더 (기본: C:\\SQLiteDB\\downloads\\관세청\\행정규칙예고)",
    )
    grp3.add_argument(
        "--attach-naming",
        choices=["seq_prefix", "subfolder", "original"],
        default=None,
        help=(
            "첨부파일 저장명 방식\n"
            "  seq_prefix : 1451_원본파일명.hwpx (기본 권장, 충돌 방지)\n"
            "  subfolder  : 1451_제목/원본파일명.hwpx\n"
            "  original   : 원본파일명 그대로"
        ),
    )
    grp3.add_argument("--no-attach", action="store_true", help="첨부파일 다운로드 비활성화")
    grp3.add_argument("--delay", type=float, default=None, help="요청 간 대기시간(초, 기본 1.0)")
    grp3.add_argument("--timeout", type=int, default=None, help="HTTP 타임아웃(초, 기본 30)")
    grp3.add_argument("--retries", type=int, default=None, help="실패 재시도 횟수(기본 3)")
    grp3.add_argument("--config", dest="config_path", help="설정 파일(config.ini) 경로")

    grp4 = p.add_argument_group("운영 모드")
    grp4.add_argument("--interactive", "-i", action="store_true", help="대화형 메뉴 모드로 실행 (run_crawler.bat용)")
    grp4.add_argument("--status", action="store_true", help="DB 수집 현황 통계를 출력하고 종료")
    grp4.add_argument("--version", "-v", action="version", version=f"%(prog)s {PROGRAM_VERSION}")
    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)

    # 위치 인자 해석 (예: customs_crawler.py 1 / 1 10 / all / from 1 to 10)
    if args.pos_page and args.page is None and args.from_page is None and args.to_page is None and not args.all_pages:
        toks = [str(x).strip().lower() for x in args.pos_page]
        if "all" in toks or "전체" in toks:
            args.all_pages = True
        else:
            # "from 1 to 10" 또는 "1 to 10" 같은 키워드 스타일 지원
            nums = [int(t) for t in toks if t.isdigit()]
            if len(nums) >= 2:
                args.from_page = nums[0]
                args.to_page = nums[1]
            elif len(nums) == 1:
                args.page = nums[0]

    cfg = Config(args.config_path)

    # CLI 인자 오버라이드
    if args.db_path:
        cfg.db_path = args.db_path
    if args.download_dir:
        cfg.download_dir = args.download_dir
    if args.attach_naming:
        cfg.attach_naming = args.attach_naming
    if args.no_attach:
        cfg.download_attachments = False
    if args.delay is not None:
        cfg.delay = args.delay
    if args.timeout is not None:
        cfg.timeout = args.timeout
    if args.retries is not None:
        cfg.retries = args.retries
    if args.page_size is not None:
        cfg.page_size = args.page_size

    logger = setup_logging(cfg)
    crawler = CustomsCrawler(cfg, logger)

    stage = args.stage or cfg.default_stage

    run_id = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    t0 = time.time()
    started_at = crawler.db.now()

    try:
        if args.status:
            crawler.show_status()
            return 0

        if args.retry_failed:
            crawler.run_retry_failed_attachments()
            crawler.show_status()
            logger.info("모든 작업이 정상 종료되었습니다. (소요: %.1f초)", time.time() - t0)
            return 0

        if args.interactive:
            interactive_menu(crawler, args)
            return 0

        # 비대화형 단독 실행
        if stage == "1":
            pages, mode, ps, pe = crawler.resolve_pages(
                args.page, args.from_page, args.to_page, args.all_pages
            )
            ins, upd, items = crawler.run_stage1(pages)
            crawler.record_log = lambda: None  # handled below
            crawler.db.record_log({
                "run_id": run_id, "stage": "1", "page_mode": mode,
                "page_start": ps, "page_end": pe, "target_count": len(pages),
                "success_count": ins + upd, "fail_count": 0, "skip_count": 0,
                "started_at": started_at, "finished_at": crawler.db.now(),
                "elapsed_seconds": round(time.time() - t0, 1),
                "status": "SUCCESS", "message": f"목록 수집 {len(items)}건 (신규 {ins}/갱신 {upd})",
            })

        elif stage == "2":
            lim = args.limit if args.limit else cfg.stage2_limit
            mode = "seq" if (args.seq or args.seq_from or args.seq_to or args.ntt_sn) else "pending"
            suc, fail, skip = crawler.run_stage2(
                force=args.force, seq=args.seq, seq_start=args.seq_from,
                seq_end=args.seq_to, ntt_sn=args.ntt_sn, limit=lim,
                no_attach=args.no_attach,
            )
            crawler.db.record_log({
                "run_id": run_id, "stage": "2", "page_mode": mode,
                "page_start": args.seq_from or args.seq, "page_end": args.seq_to or args.seq,
                "target_count": suc + fail + skip, "success_count": suc, "fail_count": fail,
                "skip_count": skip, "started_at": started_at, "finished_at": crawler.db.now(),
                "elapsed_seconds": round(time.time() - t0, 1),
                "status": "FAILED" if fail and not suc else ("PARTIAL" if fail else "SUCCESS"),
                "message": f"상세 수집: 성공 {suc}, 실패 {fail}, 건너뜀 {skip}",
            })

        else:  # all
            pages, mode, ps, pe = crawler.resolve_pages(
                args.page, args.from_page, args.to_page, args.all_pages
            )
            crawler.run_combined(pages, no_attach=args.no_attach, force=args.force)
            # 수집 후 실패한 첨부파일이 있으면 1회 자동 재시도
            if crawler.db.stats()["att_failed"] > 0 and not crawler.stop_requested:
                crawler.logger.info("실패한 첨부파일이 감지되어 1회 자동 재시도를 수행합니다...")
                time.sleep(2)
                crawler.run_retry_failed_attachments()
            st = crawler.db.stats()
            crawler.db.record_log({
                "run_id": run_id, "stage": "all", "page_mode": mode,
                "page_start": ps, "page_end": pe, "target_count": len(pages),
                "success_count": st["stage2_done"], "fail_count": st["failed_notices"],
                "skip_count": 0, "started_at": started_at, "finished_at": crawler.db.now(),
                "elapsed_seconds": round(time.time() - t0, 1),
                "status": "SUCCESS" if st["failed_notices"] == 0 else "PARTIAL",
                "message": f"통합 수집 완료: 총공고 {st['total_notices']}, 상세완료 {st['stage2_done']}",
            })

        crawler.show_status()
        logger.info("모든 작업이 정상 종료되었습니다. (소요: %.1f초)", time.time() - t0)
        return 0

    finally:
        crawler.close()


if __name__ == "__main__":
    sys.exit(main())
