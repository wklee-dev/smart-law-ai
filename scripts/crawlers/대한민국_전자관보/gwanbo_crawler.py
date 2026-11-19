#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
================================================================================
 대한민국 전자관보 품목분류 고시 크롤러 (gwanbo_crawler.py)
 버전: v1.0
================================================================================
 [요구사항 충족 내역]
 1. 대한민국 전자관보(https://gwanbo.go.kr) 기본검색 페이지 기반 크롤링
 2. 1차 검색어: 「품목분류 변경고시」 → 결과 없으면 「품목분류」로 자동 재검색
 3. 구분: '고시'(category_order=10) 필터링
 4. 제목에 '품목분류'가 포함된 건만 대상
 5. 조건 불문 전건 수집: '폐지제정' 등 포함된 건도 제외 없이 수집
 6. 자동 페이징 + 페이지 단위 크롤링: 1페이지(--page 1) 또는 From~To 범위 지정
 7. 상세 본문 내용 저장(PDF 텍스트 추출) 및 원문 PDF 저장
 8. 첨부파일 저장 경로: C:\\SQLiteDB\\downloads\\대한민국 전자관보\\
 9. 기존 데이터가 존재하는 DB에 구분된 전용 테이블 설계 (D:\\SQLiteDB\\smart_law_ai.db)
 10. 로그 파일: logs\\YYYYMMDD.log
 11. 가상환경 없이 최소 의존성(requests, pypdf)으로 실행 가능
================================================================================
"""

import argparse
import datetime as dt
import json
import logging
import math
import os
import re
import sqlite3
import sys
import time
from typing import Dict, List, Optional, Tuple

import requests
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ==============================================================================
# 기본 설정
# ==============================================================================
DEFAULT_CONFIG = {
    "base_url": "https://gwanbo.go.kr",
    "search_endpoint": "/SearchRestApi.jsp",
    "pdf_endpoint": "/user/common/ofcttCntntDownload.do",
    "pdf_endpoint_alt": "/user/common/ofcttDownload.do",
    "primary_keyword": "품목분류 변경고시",
    "fallback_keyword": "품목분류",
    "target_category_name": "고시",
    "target_category_order": 10,
    "title_filter_keyword": "품목분류",
    "include_pejijaejeong": True,
    "db_path": r"D:\SQLiteDB\smart_law_ai.db",
    "download_dir": r"C:\SQLiteDB\downloads\대한민국 전자관보",
    "log_dir": "logs",
    "list_size": 10,
    "request_delay": 2.0,
    "timeout": 60,
    "max_retries": 5,
    "skip_existing": True,
    "user_agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
}

# ==============================================================================
# DB 스키마 (기존 DB 충돌 방지: TB_GWANBO_* 접두어)
# ==============================================================================
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS TB_GWANBO_NOTICE (
    notice_id          TEXT PRIMARY KEY,
    toc_id             TEXT,
    content_id         TEXT,
    category_name      TEXT,
    category_order     INTEGER,
    reg_date           TEXT,
    ofctt_num          INTEGER,
    title              TEXT,
    organ_nm           TEXT,
    organ_code         TEXT,
    laword_nm          TEXT,
    laword_seq_no      TEXT,
    viewer_url         TEXT,
    pdf_file_name      TEXT,
    pdf_file_path      TEXT,
    pdf_file_size      INTEGER,
    page_count         INTEGER,
    body_text          TEXT,
    search_keyword     TEXT,
    collect_page       INTEGER,
    crawl_dt           TEXT,
    updated_dt         TEXT
);

CREATE TABLE IF NOT EXISTS TB_GWANBO_ITEM (
    item_id            INTEGER PRIMARY KEY AUTOINCREMENT,
    notice_id          TEXT,
    item_no            INTEGER,
    item_name          TEXT,
    prev_doc_no        TEXT,
    prev_hs_code       TEXT,
    new_hs_code        TEXT,
    change_reason      TEXT,
    goods_desc         TEXT,
    effective_date     TEXT,
    FOREIGN KEY(notice_id) REFERENCES TB_GWANBO_NOTICE(notice_id)
);

CREATE TABLE IF NOT EXISTS TB_GWANBO_CRAWL_LOG (
    log_id             INTEGER PRIMARY KEY AUTOINCREMENT,
    start_dt           TEXT,
    end_dt             TEXT,
    keyword            TEXT,
    fallback_used      INTEGER,
    target_category    TEXT,
    total_count        INTEGER,
    collected_count    INTEGER,
    error_count        INTEGER,
    pages_processed    INTEGER,
    status             TEXT,
    message            TEXT
);

CREATE INDEX IF NOT EXISTS IDX_GWANBO_REGDATE ON TB_GWANBO_NOTICE(reg_date);
CREATE INDEX IF NOT EXISTS IDX_GWANBO_KEYWORD ON TB_GWANBO_NOTICE(search_keyword);
CREATE INDEX IF NOT EXISTS IDX_GWANBO_ITEM_FK ON TB_GWANBO_ITEM(notice_id);
"""

# ==============================================================================
# 로깅 (logs/날짜.log)
# ==============================================================================
def setup_logging(log_dir: str) -> logging.Logger:
    os.makedirs(log_dir, exist_ok=True)
    today = dt.date.today().strftime("%Y%m%d")
    log_file = os.path.join(log_dir, f"{today}.log")

    logger = logging.getLogger("gwanbo_crawler")
    logger.setLevel(logging.INFO)
    logger.handlers.clear()

    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    fh = logging.FileHandler(log_file, encoding="utf-8")
    fh.setLevel(logging.INFO)
    fh.setFormatter(formatter)
    logger.addHandler(fh)

    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(formatter)
    logger.addHandler(ch)

    logger.info("=" * 80)
    logger.info("로그 시작: %s", log_file)
    logger.info("=" * 80)
    return logger

# ==============================================================================
# 유틸리티
# ==============================================================================
TAG_RE = re.compile(r"<[^>]+>")
SAFE_CHR_RE = re.compile(r'[\\/:*?"<>|\r\n\t]+')


def clean_html(text: str) -> str:
    if not text:
        return ""
    text = TAG_RE.sub(" ", text)
    text = text.replace("&nbsp;", " ").replace("&amp;", "&")
    text = text.replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&quot;", '"').replace("&#34;", '"').replace("&apos;", "'")
    return " ".join(text.split())


def safe_filename(name: str, max_len: int = 150) -> str:
    name = SAFE_CHR_RE.sub("_", name).strip()
    name = re.sub(r"_+", "_", name)
    if len(name.encode("utf-8")) > max_len * 3:
        name = name[:max_len]
    return name or "untitled"


def build_lucene_query(keyword: str, category_order: int) -> Tuple[str, str]:
    cleaned = re.sub(r'[-_!@#$%^&*()~+|[\]{}:;\'"\\,.<>/?`\t\r\n=]', " ", keyword)
    tokens = [t for t in cleaned.split() if t]
    joined = " AND ".join(tokens)
    p_query = f"(unstored_field_subject:({joined})) AND keyword_category_order:({category_order})"
    return p_query, keyword


# ==============================================================================
# DB 관리
# ==============================================================================
def init_db(db_path: str, logger: logging.Logger) -> None:
    db_dir = os.path.dirname(os.path.abspath(db_path))
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(SCHEMA_SQL)
    logger.info("DB 초기화 완료: %s", db_path)


def upsert_notice(db_path: str, record: dict) -> None:
    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    sql = """
    INSERT INTO TB_GWANBO_NOTICE (
        notice_id, toc_id, content_id, category_name, category_order,
        reg_date, ofctt_num, title, organ_nm, organ_code, laword_nm,
        laword_seq_no, viewer_url, pdf_file_name, pdf_file_path,
        pdf_file_size, page_count, body_text, search_keyword,
        collect_page, crawl_dt, updated_dt
    ) VALUES (
        :notice_id, :toc_id, :content_id, :category_name, :category_order,
        :reg_date, :ofctt_num, :title, :organ_nm, :organ_code, :laword_nm,
        :laword_seq_no, :viewer_url, :pdf_file_name, :pdf_file_path,
        :pdf_file_size, :page_count, :body_text, :search_keyword,
        :collect_page, :crawl_dt, :updated_dt
    )
    ON CONFLICT(notice_id) DO UPDATE SET
        pdf_file_name  = excluded.pdf_file_name,
        pdf_file_path  = excluded.pdf_file_path,
        pdf_file_size  = excluded.pdf_file_size,
        page_count     = excluded.page_count,
        body_text      = excluded.body_text,
        updated_dt     = excluded.updated_dt
    """
    record["crawl_dt"] = now
    record["updated_dt"] = now
    with sqlite3.connect(db_path) as conn:
        conn.execute(sql, record)


def is_already_collected(db_path: str, notice_id: str) -> bool:
    if not os.path.isfile(db_path):
        return False
    try:
        with sqlite3.connect(db_path) as conn:
            cur = conn.cursor()
            cur.execute("SELECT pdf_file_size FROM TB_GWANBO_NOTICE WHERE notice_id = ?",
                        (notice_id,))
            row = cur.fetchone()
            return row is not None and (row[0] or 0) > 0
    except sqlite3.OperationalError:
        return False


def insert_items(db_path: str, notice_id: str, items: List[dict]) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.execute("DELETE FROM TB_GWANBO_ITEM WHERE notice_id = ?", (notice_id,))
        conn.executemany("""
            INSERT INTO TB_GWANBO_ITEM (
                notice_id, item_no, item_name, prev_doc_no,
                prev_hs_code, new_hs_code, change_reason, goods_desc, effective_date
            ) VALUES (
                :notice_id, :item_no, :item_name, :prev_doc_no,
                :prev_hs_code, :new_hs_code, :change_reason, :goods_desc, :effective_date
            )
        """, items)


def write_crawl_log(db_path: str, record: dict) -> None:
    sql = """
    INSERT INTO TB_GWANBO_CRAWL_LOG (
        start_dt, end_dt, keyword, fallback_used, target_category,
        total_count, collected_count, error_count, pages_processed,
        status, message
    ) VALUES (
        :start_dt, :end_dt, :keyword, :fallback_used, :target_category,
        :total_count, :collected_count, :error_count, :pages_processed,
        :status, :message
    )
    """
    with sqlite3.connect(db_path) as conn:
        conn.execute(sql, record)


# ==============================================================================
# PDF 텍스트 추출 & 물품별 파싱
# ==============================================================================
def extract_pdf_text(pdf_path: str, logger: logging.Logger) -> Tuple[str, int]:
    try:
        import pypdf
        reader = pypdf.PdfReader(pdf_path)
        pages = []
        for i, page in enumerate(reader.pages):
            txt = page.extract_text() or ""
            pages.append(txt)
        return "\n\n".join(pages), len(reader.pages)
    except Exception as e:
        logger.warning("pypdf 텍스트 추출 실패 (%s): %s", pdf_path, e)
        return "", 0


def parse_items_from_text(text: str, notice_id: str) -> List[dict]:
    items: List[dict] = []
    block_pattern = re.compile(r"(\d{3,5})\.\s+([^\n]+에 대한 품목분류 변경고시)", re.M)
    blocks = list(block_pattern.finditer(text))
    if not blocks:
        return items
    for idx, m in enumerate(blocks):
        item_no = int(m.group(1))
        item_title = clean_html(m.group(2)).replace("에 대한 품목분류 변경고시", "").strip()
        start = m.start()
        end = blocks[idx + 1].start() if idx + 1 < len(blocks) else len(text)
        chunk = text[start:end]

        prev_hs = re.search(r"변경전\s*HS\s*품목번호\s*:\s*([^\n]+)", chunk)
        new_hs = re.search(r"변경후\s*HS\s*품목번호\s*:\s*([^\n]+)", chunk)
        reason = re.search(r"변경사유\s*\n\s*-\s*([^\n]+)", chunk)
        goods_desc = re.search(r"물품설명\s*\n\s*-\s*([^\n]+)", chunk)
        eff = re.search(r"\(적용일\)[^\n]*?(통지받은 날[^\n]{0,200})", chunk, re.S)
        prev_doc = re.search(r"종전\s*공문\s*\n([^\n]+)", chunk)

        items.append({
            "notice_id": notice_id,
            "item_no": item_no,
            "item_name": item_title[:200],
            "prev_doc_no": clean_html(prev_doc.group(1))[:100] if prev_doc else "",
            "prev_hs_code": clean_html(prev_hs.group(1))[:100] if prev_hs else "",
            "new_hs_code": clean_html(new_hs.group(1))[:100] if new_hs else "",
            "change_reason": clean_html(reason.group(1))[:300] if reason else "",
            "goods_desc": clean_html(goods_desc.group(1))[:300] if goods_desc else "",
            "effective_date": clean_html(eff.group(1))[:200] if eff else "",
        })
    return items


# ==============================================================================
# 크롤러 메인 클래스
# ==============================================================================
class GwanboCrawler:

    def __init__(self, cfg: dict, logger: logging.Logger):
        self.cfg = cfg
        self.logger = logger
        self.session = self._new_session()

    def _new_session(self) -> requests.Session:
        s = requests.Session()
        s.headers.update({
            "User-Agent": self.cfg["user_agent"],
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
            "Referer": f"{self.cfg['base_url']}/user/search/searchKeyword.do",
        })
        return s

    def _post(self, url: str, data: dict, referer: Optional[str] = None) -> requests.Response:
        """재시도 + 세션 재생성 로직이 포함된 POST"""
        full_url = url if url.startswith("http") else self.cfg["base_url"] + url
        last_exc = None
        for attempt in range(1, self.cfg["max_retries"] + 1):
            try:
                headers = {}
                if referer:
                    headers["Referer"] = referer
                    headers["Origin"] = self.cfg["base_url"]
                headers["Connection"] = "close"
                r = self.session.post(
                    full_url,
                    data=data,
                    headers=headers,
                    timeout=self.cfg["timeout"],
                    verify=False,
                )
                if r.status_code == 200:
                    return r
                self.logger.warning("HTTP %s (시도 %d/%d) url=%s", r.status_code,
                                    attempt, self.cfg["max_retries"], full_url)
            except Exception as e:
                last_exc = e
                self.logger.warning("요청 실패 (시도 %d/%d): %s", attempt,
                                    self.cfg["max_retries"], e)
                # 연결이 끊기면 세션을 재생성하여 다음 재시도
                self.session.close()
                self.session = self._new_session()
            time.sleep(attempt * 2)
        raise RuntimeError(f"요청 최종 실패: {full_url} ({last_exc})")

    # --------------------------------------------------------------------------
    # 1. 검색
    # --------------------------------------------------------------------------
    def search(self, keyword: str, page_no: int = 1,
               list_size: int = 10) -> Tuple[int, List[dict], str]:
        p_query, _ = build_lucene_query(keyword, self.cfg["target_category_order"])
        data = {
            "mode": "keyword",
            "index": "gwanbo",
            "query": p_query,
            "pQuery_tmp": keyword,
            "pageNo": str(page_no),
            "listSize": str(list_size),
            "sort": "",
        }
        r = self._post(self.cfg["search_endpoint"], data)
        res = r.json()
        count = 0
        items: List[dict] = []
        for cat in res.get("data", []):
            try:
                order = int(cat.get("category_order", -1))
            except (TypeError, ValueError):
                continue
            if order == self.cfg["target_category_order"]:
                count = int(cat.get("count", 0))
                items = cat.get("list") or []
                break
        return count, items, p_query

    def search_with_fallback(self) -> Tuple[str, int, bool]:
        kw = self.cfg["primary_keyword"]
        self.logger.info("[1차 검색] 키워드: 「%s」, 구분: %s",
                         kw, self.cfg["target_category_name"])
        count, _, pq = self.search(kw, page_no=1, list_size=self.cfg["list_size"])
        self.logger.info("-> 검색 결과: %d건 (query=%s)", count, pq)

        if count == 0:
            fb = self.cfg["fallback_keyword"]
            self.logger.info("[2차 폴백 검색] 키워드: 「%s」 (1차 결과 0건에 따라 확장)", fb)
            count, _, pq = self.search(fb, page_no=1,
                                       list_size=self.cfg["list_size"])
            self.logger.info("-> 검색 결과: %d건 (query=%s)", count, pq)
            return fb, count, True
        return kw, count, False

    # --------------------------------------------------------------------------
    # 2. 항목 필터링
    # --------------------------------------------------------------------------
    def filter_items(self, items: List[dict]) -> List[dict]:
        filtered = []
        fk = self.cfg["title_filter_keyword"]
        for it in items:
            title = clean_html(it.get("stored_field_subject", ""))
            if fk and fk not in title:
                self.logger.debug("필터 제외(제목 키워드 미포함): %s", title)
                continue
            # '폐지제정' 케이스: 항상 유지 (사용자 지침: 조건 불문 전건 수집)
            filtered.append(it)
        return filtered

    # --------------------------------------------------------------------------
    # 3. PDF 다운로드 & 본문 텍스트 저장
    # --------------------------------------------------------------------------
    def download_pdf(self, item: dict, dest_path: str) -> Optional[int]:
        toc_id = (item.get("stored_toc_seq") or "").strip()
        content_id = (item.get("stored_org_file_seq") or
                      item.get("stored_file_name") or "").strip()
        referer = f"{self.cfg['base_url']}/ezpdf/customLayout.jsp?contentId={content_id}&tocId={toc_id}&isTocOrder=N"

        if toc_id:
            url = self.cfg["pdf_endpoint"]
            data = {"cntnt_seq_no": toc_id}
        else:
            url = self.cfg["pdf_endpoint_alt"]
            data = {"downType": "1", "ofctt_seq_no": content_id}

        try:
            r = self._post(url, data, referer=referer)
        except Exception as e:
            self.logger.error("PDF 다운로드 실패 (%s): %s", dest_path, e)
            return None

        # Content-Length 검증
        exp_len = r.headers.get("Content-Length")
        if exp_len and exp_len.isdigit() and len(r.content) < int(exp_len):
            self.logger.error("불완전 다운로드 (%d/%s bytes): %s", len(r.content), exp_len, dest_path)
            return None

        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(r.content)
        size = os.path.getsize(dest_path)
        self.logger.info("PDF 저장 완료 (%d bytes): %s", size, dest_path)
        return size

    # --------------------------------------------------------------------------
    # 4. 단일 항목 수집 처리
    # --------------------------------------------------------------------------
    def process_item(self, item: dict, page_no: int, keyword: str,
                     dry_run: bool = False) -> bool:
        toc_id = (item.get("stored_toc_seq") or "").strip()
        content_id = (item.get("stored_org_file_seq") or "").strip()
        reg_date = str(item.get("keyword_field_regdate", "")).strip()
        ofctt_num = item.get("stored_ebook_no") or 0
        try:
            ofctt_num = int(ofctt_num)
        except (ValueError, TypeError):
            ofctt_num = 0
        title = clean_html(item.get("stored_field_subject", ""))
        notice_id = f"GWB_{reg_date}_{toc_id or content_id}"

        self.logger.info("[%s] #%d | %s", reg_date, ofctt_num, title)
        if dry_run:
            return True

        fn = safe_filename(f"{reg_date}_{ofctt_num}_{title}")
        pdf_name = f"{fn}.pdf"
        txt_name = f"{fn}.txt"
        dest_dir = self.cfg["download_dir"]
        pdf_path = os.path.join(dest_dir, pdf_name)
        txt_path = os.path.join(dest_dir, txt_name)

        # 이어받기: 이미 수집된 건은 스킵
        if self.cfg.get("skip_existing") and is_already_collected(self.cfg["db_path"], notice_id):
            if os.path.isfile(pdf_path) and os.path.getsize(pdf_path) > 0:
                self.logger.info("-> 이미 수집됨 (스킵): %s", pdf_name)
                return True

        # PDF 저장
        size = self.download_pdf(item, pdf_path)
        if size is None:
            return False

        # 본문 내용 추출 & txt 파일 저장
        body_text, page_cnt = extract_pdf_text(pdf_path, self.logger)
        if body_text:
            try:
                with open(txt_path, "w", encoding="utf-8") as f:
                    f.write(body_text)
                self.logger.info("본문 텍스트 저장 완료: %s", txt_path)
            except OSError as e:
                self.logger.warning("본문 텍스트 파일 저장 실패: %s", e)

        viewer_path = (item.get("stored_field_url") or
                       f"/ezpdf/customLayout.jsp?contentId={content_id}&tocId={toc_id}&isTocOrder=N")
        viewer_url = (viewer_path if viewer_path.startswith("http")
                      else self.cfg["base_url"] + viewer_path)

        # DB 저장
        record = {
            "notice_id": notice_id,
            "toc_id": toc_id,
            "content_id": content_id,
            "category_name": item.get("stored_category_name", "고시"),
            "category_order": self.cfg["target_category_order"],
            "reg_date": reg_date,
            "ofctt_num": ofctt_num,
            "title": title,
            "organ_nm": item.get("stored_organ_nm", ""),
            "organ_code": str(item.get("stored_organ_code", "")),
            "laword_nm": item.get("stored_laword_nm", ""),
            "laword_seq_no": str(item.get("stored_laword_seq_no", "")),
            "viewer_url": viewer_url,
            "pdf_file_name": pdf_name,
            "pdf_file_path": pdf_path,
            "pdf_file_size": size,
            "page_count": page_cnt,
            "body_text": body_text,
            "search_keyword": keyword,
            "collect_page": page_no,
        }
        upsert_notice(self.cfg["db_path"], record)

        # 물품 항목 파싱 & 저장
        if body_text:
            items = parse_items_from_text(body_text, notice_id)
            if items:
                insert_items(self.cfg["db_path"], notice_id, items)
                self.logger.info("-> 물품 항목 %d건 파싱/저장", len(items))

        return True

    # --------------------------------------------------------------------------
    # 5. 실행
    # --------------------------------------------------------------------------
    def run(self, page_mode: str, page: Optional[int],
            from_page: Optional[int], to_page: Optional[int],
            dry_run: bool = False) -> None:
        start_dt = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if not dry_run:
            init_db(self.cfg["db_path"], self.logger)

        keyword, total_count, fb_used = self.search_with_fallback()
        if total_count == 0:
            self.logger.warning("수집 대상 고시가 없습니다. 종료합니다.")
            if not dry_run:
                write_crawl_log(self.cfg["db_path"], {
                    "start_dt": start_dt,
                    "end_dt": dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "keyword": keyword,
                    "fallback_used": int(fb_used),
                    "target_category": self.cfg["target_category_name"],
                    "total_count": 0,
                    "collected_count": 0,
                    "error_count": 0,
                    "pages_processed": 0,
                    "status": "EMPTY",
                    "message": "검색 결과 0건",
                })
            return

        list_size = self.cfg["list_size"]
        max_page = max(1, math.ceil(total_count / list_size))

        if page_mode == "single":
            page = page or 1
            pages = [page]
        elif page_mode == "range":
            from_page = from_page or 1
            to_page = min(to_page or max_page, max_page)
            pages = list(range(from_page, to_page + 1))
        else:
            pages = list(range(1, max_page + 1))

        self.logger.info("총 고시 건수: %d건, 총 %d페이지 | 수집 대상 페이지: %s",
                         total_count, max_page,
                         f"{pages[0]}~{pages[-1]}" if len(pages) > 3 else str(pages))

        collected = 0
        errors = 0
        pages_done = 0

        for p in pages:
            self.logger.info("-" * 80)
            self.logger.info("[페이지 %d/%d 조회]", p, max_page)
            try:
                cnt, items, _ = self.search(keyword, page_no=p, list_size=list_size)
            except Exception as e:
                self.logger.error("페이지 %d 조회 실패: %s", p, e)
                errors += 1
                continue

            targets = self.filter_items(items)
            self.logger.info("-> 페이지 원본 %d건 중 대상 %d건", len(items), len(targets))

            for it in targets:
                try:
                    ok = self.process_item(it, p, keyword, dry_run=dry_run)
                    if ok:
                        collected += 1
                    else:
                        errors += 1
                except Exception as e:
                    self.logger.error("항목 처리 오류: %s", e, exc_info=True)
                    errors += 1
                time.sleep(self.cfg["request_delay"])

            pages_done += 1
            time.sleep(self.cfg["request_delay"])

        end_dt = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        status = "SUCCESS" if errors == 0 else "PARTIAL"
        msg = f"페이지 {pages_done}개 처리, 수집 {collected}건, 오류 {errors}건"
        self.logger.info("=" * 80)
        self.logger.info("[크롤링 완료] %s (시작: %s / 종료: %s)", msg, start_dt, end_dt)
        self.logger.info("=" * 80)

        if not dry_run:
            write_crawl_log(self.cfg["db_path"], {
                "start_dt": start_dt,
                "end_dt": end_dt,
                "keyword": keyword,
                "fallback_used": int(fb_used),
                "target_category": self.cfg["target_category_name"],
                "total_count": total_count,
                "collected_count": collected,
                "error_count": errors,
                "pages_processed": pages_done,
                "status": status,
                "message": msg,
            })


# ==============================================================================
# CLI
# ==============================================================================
def parse_args():
    p = argparse.ArgumentParser(
        description="대한민국 전자관보 품목분류 변경고시 크롤러",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    p.add_argument("--config", default="config.json",
                   help="설정 파일 경로 (기본: config.json)")
    p.add_argument("--page", type=int, default=None,
                   help="단일 페이지 번호 지정 (예: --page 1)")
    p.add_argument("--from-page", type=int, default=None,
                   help="수집 시작 페이지 번호 (예: --from-page 1)")
    p.add_argument("--to-page", type=int, default=None,
                   help="수집 종료 페이지 번호 (예: --to-page 5)")
    p.add_argument("--all", action="store_true",
                   help="전체 페이지 수집 (기본 동작)")
    p.add_argument("--keyword", default=None,
                   help="1차 검색어 (기본: '품목분류 변경고시')")
    p.add_argument("--fallback-keyword", default=None,
                   help="결과 0건 시 2차 폴백 검색어 (기본: '품목분류')")
    p.add_argument("--db", default=None,
                   help="SQLite DB 파일 경로 (기본: D:\\SQLiteDB\\smart_law_ai.db)")
    p.add_argument("--download-dir", default=None,
                   help="첨부파일(PDF/txt) 저장 폴더 (기본: C:\\SQLiteDB\\downloads\\대한민국 전자관보)")
    p.add_argument("--log-dir", default=None,
                   help="로그 폴더 (기본: logs)")
    p.add_argument("--list-size", type=int, default=None,
                   help="페이지당 조회 건수 (기본: 10)")
    p.add_argument("--delay", type=float, default=None,
                   help="요청 간 대기 시간 초 (기본: 2.0)")
    p.add_argument("--dry-run", action="store_true",
                   help="다운로드 없이 검색/필터 결과만 출력")
    p.add_argument("--no-skip", action="store_true",
                   help="이미 수집된 건도 다시 다운로드")
    return p.parse_args()


def load_config(path: str) -> dict:
    cfg = dict(DEFAULT_CONFIG)
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                user = json.load(f)
            cfg.update({k: v for k, v in user.items() if v is not None})
        except Exception as e:
            print(f"[WARN] 설정 파일({path}) 읽기 실패, 기본값 사용: {e}",
                  file=sys.stderr)
    return cfg


def main():
    args = parse_args()
    cfg = load_config(args.config)

    if args.keyword:
        cfg["primary_keyword"] = args.keyword
    if args.fallback_keyword:
        cfg["fallback_keyword"] = args.fallback_keyword
    if args.db:
        cfg["db_path"] = args.db
    if args.download_dir:
        cfg["download_dir"] = args.download_dir
    if args.log_dir:
        cfg["log_dir"] = args.log_dir
    if args.list_size:
        cfg["list_size"] = args.list_size
    if args.delay:
        cfg["request_delay"] = args.delay
    if args.no_skip:
        cfg["skip_existing"] = False

    if args.page is not None:
        mode = "single"
    elif args.from_page is not None or args.to_page is not None:
        mode = "range"
    else:
        mode = "all"

    logger = setup_logging(cfg["log_dir"])
    logger.info("파이썬 크롤링 프로그램 v1.0 시작 (가상환경 없이 실행 가능)")
    logger.info("DB 경로: %s", cfg["db_path"])
    logger.info("첨부파일 저장 경로: %s", cfg["download_dir"])
    logger.info("페이지 모드: %s (page=%s, from=%s, to=%s)",
                mode, args.page, args.from_page, args.to_page)
    logger.info("지침 준수: 폐지제정 등 조건 불문 전건 수집(include_pejijaejeong=%s)",
                cfg["include_pejijaejeong"])

    crawler = GwanboCrawler(cfg, logger)
    crawler.run(page_mode=mode, page=args.page,
                from_page=args.from_page, to_page=args.to_page,
                dry_run=args.dry_run)


if __name__ == "__main__":
    main()
