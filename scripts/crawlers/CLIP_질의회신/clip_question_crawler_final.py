#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
관세법령정보포털(CLIP) 질의회신 크롤러
====================================
대상: https://unipass.customs.go.kr/clip/index.do (질의회신 게시판)
DB : D:/SQLiteDB/smart_law_ai.db (SQLite, 개별 clip_question.db 폐지)
첨부파일 : C:/SQLiteDB/ATTACH/CLIP_QUESTION/
크롤러이름: clip_question

페이지 단위로 가져올 수 있게 작성되었습니다.
기존 행정규칙 크롤러 소스를 참조하여 구조화하였습니다.

[기능]
- 페이지 단위 크롤링 (--start, --end 인자로 범위 지정)
- 카테고리 필터 (--category: all/fta/통관/심사/조사/공통)
- 첨부파일 다운로드 (C:/SQLiteDB/ATTACH/CLIP_QUESTION)
- 본문 내 이미지 DB 저장 (clip_question_image 테이블)
- 크롤링 이력 관리 (clip_question_crawl_meta 테이블)
  ※ 통합 DB 공유 crawl_meta 와 분리 (스키마 충돌 방지)

[카테고리 코드]
  all : 전체 (기본값, 1,263건)
  01  : FTA (64건)
  02  : 통관 (305건)
  03  : 심사 (871건)
  04  : 조사 (18건)
  05  : 공통 (5건)

[상세 페이지 공통 필드 구조]
  - 업무분야 / 접수일자
  - 제목
  - 질의요지
  - 해석대상 법령/규칙
  - 관련법령 근거규정
  - 상세내용
  - 첨부파일
  - 회신부서 / 회신일자
  - 회신서내용

[사용 예시]
  python clip_question_crawler_final.py --start 1 --end 10
  python clip_question_crawler_final.py --start 1 --end 127 --category all
  python clip_question_crawler_final.py --start 1 --end 7  --category 01
  python clip_question_crawler_final.py --start 1 --end 31 --category 02
  python clip_question_crawler_final.py --start 1 --end 88 --category 03
  python clip_question_crawler_final.py --start 1 --end 2  --category 04
  python clip_question_crawler_final.py --start 1 --end 1  --category 05
"""

import argparse
import logging
import os
import re
import sqlite3
import ssl
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import unquote

import requests
import urllib3
from bs4 import BeautifulSoup

# ─────────────────────────────────────────────────────────
# 상수
# ─────────────────────────────────────────────────────────
BASE_URL      = "https://unipass.customs.go.kr"
HTML_PARSER   = "html.parser"
REQUEST_DELAY = 1.5          # 기본 요청 간격 (초)
MAX_RETRY     = 5            # 최대 재시도 횟수

# 카테고리 코드 매핑
CATEGORY_CODE_MAP = {
    "all":  "all",
    "fta":  "01",
    "01":   "01",
    "통관": "02",
    "02":   "02",
    "심사": "03",
    "03":   "03",
    "조사": "04",
    "04":   "04",
    "공통": "05",
    "05":   "05",
}

# 질의구분 코드 매핑
TPCD_MAP = {
    "01": "민원질의-개인",
    "02": "민원질의-업체",
    "03": "내부질의-세관",
    "04": "외부질의-기관",
    "05": "내부질의-본청",
}

# 본문 내 이미지 필터링 (아이콘/버튼 이미지 제외)
IMAGE_EXCLUDE_PATTERNS = [
    'btn_', 'icon', 'logo', '/images/', 'pdf.png', 'hwp.png',
    'xls.png', 'doc.png', 'zip.png', 'arrow', 'bullet',
]

# ─────────────────────────────────────────────────────────
# SSL 경고 억제
# ─────────────────────────────────────────────────────────
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ─────────────────────────────────────────────────────────
# 로깅 설정
# ─────────────────────────────────────────────────────────
_LOG_DIR = Path("logs")
_LOG_DIR.mkdir(exist_ok=True)
_LOG_FILE = _LOG_DIR / datetime.now().strftime("clip_question_%Y%m%d_%H%M%S.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s,%(msecs)03d [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(str(_LOG_FILE), encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────
# TLS 1.2 어댑터 (관세청 서버 TLS 1.2 강제 적용)
# ─────────────────────────────────────────────────────────
class TLS12Adapter(requests.adapters.HTTPAdapter):
    def init_poolmanager(self, *args, **kwargs):
        ctx = ssl.create_default_context()
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_NONE
        kwargs["ssl_context"] = ctx
        super().init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, proxy, **proxy_kwargs):
        ctx = ssl.create_default_context()
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
        ctx.minimum_version = ssl.TLSVersion.TLSv1_2
        ctx.check_hostname = False
        ctx.verify_mode    = ssl.CERT_NONE
        proxy_kwargs["ssl_context"] = ctx
        return super().proxy_manager_for(proxy, **proxy_kwargs)


# ─────────────────────────────────────────────────────────
# 유틸리티 함수
# ─────────────────────────────────────────────────────────
def clean_text(text: str) -> str:
    """공백 정규화"""
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def make_session() -> requests.Session:
    """HTTP 세션 생성 (TLS 1.2, 재시도 설정 포함)"""
    session = requests.Session()
    adapter = TLS12Adapter(
        max_retries=urllib3.Retry(
            total=MAX_RETRY,
            backoff_factor=2,
            status_forcelist=[429, 500, 502, 503, 504],
        )
    )
    session.mount("https://", adapter)
    session.mount("http://",  adapter)
    session.verify = False
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Referer":         BASE_URL,
    })
    return session


# ─────────────────────────────────────────────────────────
# DB 매니저
# ─────────────────────────────────────────────────────────
class DatabaseManager:
    def __init__(self, db_path: str):
        db_dir = Path(db_path).parent
        db_dir.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self._create_tables()
        logger.info(f"DB 연결: {db_path}")

    def _create_tables(self):
        cur = self.conn.cursor()

        # 질의회신 본문 테이블
        cur.execute("""
            CREATE TABLE IF NOT EXISTS clip_question (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                seq_id              TEXT UNIQUE,      -- 게시물 고유 ID
                gubun               TEXT,             -- 질의구분 (민원질의-개인/업체, 내부질의-세관/본청, 외부질의-기관)
                category            TEXT,             -- 업무분야 (예: FTA > 한미FTA)
                title               TEXT,             -- 제목
                receive_date        TEXT,             -- 접수일자
                reply_date          TEXT,             -- 회신일자
                reply_dept          TEXT,             -- 회신부서
                question_summary    TEXT,             -- 질의요지
                law_target          TEXT,             -- 해석대상 법령/규칙
                law_basis           TEXT,             -- 관련법령 근거규정
                detail_content      TEXT,             -- 상세내용
                reply_content       TEXT,             -- 회신서내용
                content             TEXT,             -- 전체 본문 (위 필드 통합)
                created_at          TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_clip_question_seq
            ON clip_question (seq_id)
        """)

        # 이미지 데이터 저장 테이블 (기본원칙: 이미지는 테이블에 저장)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS clip_question_image (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                seq_id      TEXT,             -- 게시물 고유 ID
                img_src     TEXT,             -- 원본 이미지 src
                img_data    BLOB,             -- 이미지 바이너리 데이터
                created_at  TEXT DEFAULT (datetime('now','localtime')),
                FOREIGN KEY(seq_id) REFERENCES clip_question(seq_id)
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_clip_question_image_seq
            ON clip_question_image (seq_id)
        """)

        # 질의회신 전용 크롤링 이력 (공유 crawl_meta 와 스키마 충돌 방지)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS clip_question_crawl_meta (
                page_no     INTEGER NOT NULL,
                category    TEXT    NOT NULL,
                crawled_at  TEXT,
                status      TEXT,
                PRIMARY KEY (page_no, category)
            )
        """)

        self.conn.commit()

    def insert_question(self, d: dict):
        try:
            self.conn.execute("""
                INSERT OR REPLACE INTO clip_question
                    (seq_id, gubun, category, title, receive_date, reply_date, reply_dept,
                     question_summary, law_target, law_basis, detail_content, reply_content, content)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                d.get("seq_id", ""),
                d.get("gubun", ""),
                d.get("category", ""),
                d.get("title", ""),
                d.get("receive_date", ""),
                d.get("reply_date", ""),
                d.get("reply_dept", ""),
                d.get("question_summary", ""),
                d.get("law_target", ""),
                d.get("law_basis", ""),
                d.get("detail_content", ""),
                d.get("reply_content", ""),
                d.get("content", ""),
            ))
            self.conn.commit()
        except sqlite3.Error as e:
            logger.error(f"DB 저장 오류(clip_question): {e}")

    def insert_image(self, seq_id: str, img_src: str, img_data: bytes):
        """이미지 바이너리 데이터를 DB에 저장 (중복 방지)"""
        try:
            cur = self.conn.cursor()
            cur.execute(
                "SELECT id FROM clip_question_image WHERE seq_id=? AND img_src=?",
                (seq_id, img_src)
            )
            if not cur.fetchone():
                self.conn.execute("""
                    INSERT INTO clip_question_image (seq_id, img_src, img_data)
                    VALUES (?, ?, ?)
                """, (seq_id, img_src, img_data))
                self.conn.commit()
        except sqlite3.Error as e:
            logger.error(f"DB 저장 오류(clip_question_image): {e}")

    def upsert_meta(self, page_no: int, category: str, status: str):
        """페이지·카테고리별 크롤 이력 저장 (clip_question_crawl_meta)."""
        try:
            self.conn.execute(
                """
                INSERT INTO clip_question_crawl_meta
                    (page_no, category, crawled_at, status)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(page_no, category) DO UPDATE SET
                    crawled_at = excluded.crawled_at,
                    status     = excluded.status
                """,
                (page_no, category, datetime.now().isoformat(), status),
            )
            self.conn.commit()
        except sqlite3.Error as e:
            logger.error(
                "DB 저장 오류(clip_question_crawl_meta page=%s cat=%s): %s",
                page_no,
                category,
                e,
            )

    def close(self):
        self.conn.close()


# ─────────────────────────────────────────────────────────
# 크롤러 메인 클래스
# ─────────────────────────────────────────────────────────
class ClipQuestionCrawler:
    def __init__(self, db_path: str, attach_dir: str):
        self.session    = make_session()
        self.db         = DatabaseManager(db_path)
        self.attach_dir = Path(attach_dir)
        self.attach_dir.mkdir(parents=True, exist_ok=True)

    def _post(self, url: str, data: dict = None, headers: dict = None) -> Optional[requests.Response]:
        try:
            resp = self.session.post(url, data=data, headers=headers, timeout=30)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            logger.error(f"POST 요청 오류: {url} - {e}")
            return None

    def _get(self, url: str, params: dict = None, stream: bool = False) -> Optional[requests.Response]:
        try:
            resp = self.session.get(url, params=params, stream=stream, timeout=30)
            resp.raise_for_status()
            return resp
        except requests.RequestException as e:
            logger.error(f"GET 요청 오류: {url} - {e}")
            return None

    def download_attachment(self, attch_file_id: str, seq_id: str):
        """
        첨부파일 다운로드 후 C:/SQLiteDB/ATTACH/CLIP_QUESTION 에 저장
        파일명 형식: {seq_id}_{원본파일명}
        """
        check_url = f"{BASE_URL}/clip/framework/filedownload/checkDownloadFile.do"
        dl_url    = f"{BASE_URL}/clip/framework/filedownload/kcs4gDownload.do"

        # 1. 다운로드 권한 체크
        check_resp = self._post(
            check_url,
            data={"attchFileId": attch_file_id},
            headers={"X-Requested-With": "XMLHttpRequest"}
        )
        if not check_resp:
            logger.warning(f"[{seq_id}] 첨부파일 권한 체크 실패: {attch_file_id}")
            return
        try:
            if check_resp.json().get("checkResult") != "true":
                logger.warning(f"[{seq_id}] 첨부파일 다운로드 권한 없음: {attch_file_id}")
                return
        except Exception:
            pass  # checkResult 없는 경우 그냥 진행

        # 2. 실제 파일 다운로드
        dl_resp = self._get(dl_url, params={"attchFileId": attch_file_id}, stream=True)
        if not dl_resp:
            return

        # 3. 파일명 추출 (Content-Disposition 헤더 우선)
        filename = f"{seq_id}_{attch_file_id}"
        cd = dl_resp.headers.get("Content-Disposition", "")
        if 'filename="' in cd:
            filename = cd.split('filename="')[1].split('"')[0]
        elif "filename=" in cd:
            filename = cd.split("filename=")[1].split(";")[0]
        filename = unquote(filename)

        # 4. 안전한 파일명으로 변환 후 저장
        safe_filename = re.sub(r'[\\/*?:"<>|]', "", filename)
        save_path = self.attach_dir / f"{seq_id}_{safe_filename}"

        try:
            with open(save_path, "wb") as f:
                for chunk in dl_resp.iter_content(chunk_size=8192):
                    f.write(chunk)
            logger.info(f"[{seq_id}] 첨부파일 저장 완료: {save_path.name}")
        except Exception as e:
            logger.error(f"[{seq_id}] 첨부파일 저장 실패: {e}")

    def download_image_to_db(self, seq_id: str, img_src: str):
        """본문 이미지를 다운로드하여 DB(BLOB)에 저장"""
        url = img_src if img_src.startswith("http") else f"{BASE_URL}{img_src}"
        resp = self._get(url)
        if resp and resp.content:
            self.db.insert_image(seq_id, img_src, resp.content)
            logger.info(f"[{seq_id}] 이미지 DB 저장 완료: {img_src}")

    def _parse_detail(self, soup: BeautifulSoup, seq_id: str, item: dict) -> dict:
        """
        상세 페이지 HTML 파싱.
        FTA/통관/심사/조사/공통 모두 동일한 테이블 구조를 사용하므로
        th 텍스트 기반으로 필드를 추출합니다.
        """
        data = {
            "seq_id":           seq_id,
            "gubun":            TPCD_MAP.get(item.get("lworQuesTpcd", ""), item.get("lworQuesTpcd", "")),
            "category":         "",
            "title":            "",
            "receive_date":     "",
            "reply_date":       "",
            "reply_dept":       "",
            "question_summary": "",
            "law_target":       "",
            "law_basis":        "",
            "detail_content":   "",
            "reply_content":    "",
            "content":          "",
        }

        for table in soup.find_all("table"):
            for row in table.find_all("tr"):
                ths = row.find_all("th")
                tds = row.find_all("td")
                if not ths:
                    continue

                # 단일 th-td 쌍
                if len(ths) == 1 and len(tds) >= 1:
                    th_text = clean_text(ths[0].text)
                    td_text = clean_text(tds[0].text)

                    if "업무분야" in th_text:
                        data["category"] = td_text
                    elif "제목" in th_text:
                        data["title"] = td_text
                    elif "질의요지" in th_text:
                        data["question_summary"] = td_text
                    elif "해석대상 법령" in th_text:
                        data["law_target"] = td_text
                    elif "관련법령 근거규정" in th_text:
                        data["law_basis"] = td_text
                    elif "상세내용" in th_text:
                        data["detail_content"] = td_text
                    elif "회신서내용" in th_text:
                        data["reply_content"] = td_text

                # 복수 th-td 쌍 (업무분야+접수일자, 회신부서+회신일자)
                elif len(ths) >= 2 and len(tds) >= 2:
                    for i, th in enumerate(ths):
                        th_text = clean_text(th.text)
                        td_text = clean_text(tds[i].text) if i < len(tds) else ""

                        if "업무분야" in th_text:
                            data["category"] = td_text
                        elif "접수일자" in th_text:
                            data["receive_date"] = td_text
                        elif "회신부서" in th_text:
                            data["reply_dept"] = td_text
                        elif "회신일자" in th_text:
                            data["reply_date"] = td_text

        # 전체 본문 통합 (content 필드)
        parts = []
        for field, label in [
            ("question_summary", "질의요지"),
            ("law_target",       "해석대상 법령/규칙"),
            ("law_basis",        "관련법령 근거규정"),
            ("detail_content",   "상세내용"),
            ("reply_content",    "회신서내용"),
        ]:
            if data[field]:
                parts.append(f"[{label}]\n{data[field]}")
        data["content"] = "\n\n".join(parts)

        return data

    def _process_attachments(self, soup: BeautifulSoup, seq_id: str):
        """
        첨부파일 행에서 파일 ID를 추출하여 다운로드.
        지원 패턴:
          1. data-attchfileid 속성
          2. onclick="uls_cf_filedown2('...')" 패턴
          3. href="/clip/framework/filedownload/kcs4gDownload.do?attchFileId=..." 패턴
        """
        for row in soup.find_all("tr"):
            th = row.find("th")
            if not (th and "첨부" in th.text):
                continue

            collected_ids = set()

            # 패턴 1: data-attchfileid 속성
            for a in row.find_all(attrs={"data-attchfileid": True}):
                attch_id = a.get("data-attchfileid", "").strip()
                if attch_id and attch_id not in collected_ids:
                    collected_ids.add(attch_id)
                    self.download_attachment(attch_id, seq_id)

            # 패턴 2: onclick 속성
            for tag in row.find_all(["button", "a"]):
                onclick = tag.get("onclick", "")
                if "uls_cf_filedown" in onclick:
                    m = re.search(r"uls_cf_filedown2?\(['\"]([^'\"]+)['\"]\)", onclick)
                    if m:
                        attch_id = m.group(1).strip()
                        if attch_id and attch_id not in collected_ids:
                            collected_ids.add(attch_id)
                            self.download_attachment(attch_id, seq_id)

            # 패턴 3: href 속성에서 attchFileId 파싱
            for a in row.find_all("a"):
                href = a.get("href", "")
                if "attchFileId=" in href:
                    m = re.search(r"attchFileId=([^&\"']+)", href)
                    if m:
                        attch_id = m.group(1).strip()
                        if attch_id and attch_id not in collected_ids:
                            collected_ids.add(attch_id)
                            self.download_attachment(attch_id, seq_id)

    def _process_images(self, soup: BeautifulSoup, seq_id: str):
        """
        본문 내 이미지를 DB에 저장.
        아이콘/버튼/로고 이미지는 제외.
        """
        for img in soup.find_all("img"):
            src = img.get("src", "")
            if not src:
                continue
            if any(pat in src for pat in IMAGE_EXCLUDE_PATTERNS):
                continue
            self.download_image_to_db(seq_id, src)

    def crawl_page(self, page_no: int, category: str = "all") -> int:
        """
        특정 페이지의 질의회신 목록을 가져와서 상세 내용을 크롤링합니다.

        Args:
            page_no:  페이지 번호 (1부터 시작)
            category: 카테고리 코드 (all/01~05)

        Returns:
            저장된 게시물 수
        """
        logger.info(f"[{category}] {page_no} 페이지 크롤링 시작")

        list_url = f"{BASE_URL}/clip/lworsrch/retrieveLworQuesRpyLst.do"
        data = {
            "jdafCgeBsopRlmCd": category,
            "filterOnYn":        "N",
            "initPageIndex":     "1",
            "pageIndex":         str(page_no),
            "recordCountPerPage": "10",
            "lworQuesTpcd":      "",
        }
        headers = {
            "Accept":           "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type":     "application/x-www-form-urlencoded; charset=UTF-8",
        }

        resp = self._post(list_url, data=data, headers=headers)
        if not resp:
            self.db.upsert_meta(page_no, category, "FAILED_LIST")
            return 0

        try:
            result = resp.json()
        except Exception as e:
            logger.error(f"JSON 파싱 오류: {e}")
            self.db.upsert_meta(page_no, category, "FAILED_LIST")
            return 0

        items = result.get("rLworQuesRpyLst", [])
        if not items:
            logger.info(f"[{category}] {page_no} 페이지 데이터 없음")
            self.db.upsert_meta(page_no, category, "EMPTY")
            return 0

        count = 0
        for item in items:
            seq_id = item.get("lworQuesNo", "").strip()
            if not seq_id:
                continue

            # 상세 페이지 요청
            detail_url  = f"{BASE_URL}/clip/lworsrch/openULS0107002S.do"
            detail_resp = self._post(detail_url, data={"lworQuesNo": seq_id})
            if not detail_resp:
                logger.error(f"상세 페이지 요청 실패: {seq_id}")
                continue

            soup = BeautifulSoup(detail_resp.text, HTML_PARSER)

            # 1. 상세 데이터 파싱 (카테고리 공통 구조)
            question_data = self._parse_detail(soup, seq_id, item)

            # 2. DB 저장
            self.db.insert_question(question_data)
            logger.info(
                f"[{seq_id}] 저장 완료 - 카테고리={question_data['category']}, "
                f"제목={question_data['title'][:30]}"
            )

            # 3. 첨부파일 다운로드 (C:/SQLiteDB/ATTACH/CLIP_QUESTION)
            self._process_attachments(soup, seq_id)

            # 4. 본문 이미지 DB 저장
            self._process_images(soup, seq_id)

            count += 1
            time.sleep(REQUEST_DELAY)

        self.db.upsert_meta(page_no, category, "SUCCESS")
        logger.info(f"[{category}] {page_no} 페이지 완료: {count}건")
        return count

    def crawl(self, start_page: int = 1, end_page: int = 1, category: str = "all"):
        """
        지정된 페이지 범위를 크롤링합니다.

        Args:
            start_page: 시작 페이지 번호
            end_page:   종료 페이지 번호
            category:   카테고리 코드 (all/01~05)
        """
        logger.info(
            f"크롤링 시작: 카테고리={category}, "
            f"{start_page} ~ {end_page} 페이지"
        )

        total = 0
        for page in range(start_page, end_page + 1):
            count = self.crawl_page(page, category)
            total += count
            time.sleep(REQUEST_DELAY)

        self.db.close()
        logger.info(f"크롤링 완료: 총 {total}건 저장")


# ─────────────────────────────────────────────────────────
# 진입점
# ─────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="관세법령정보포털(CLIP) 질의회신 크롤러",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
카테고리 코드:
  all  전체 (기본값, 1,263건, 127페이지)
  01   FTA (64건, 7페이지)
  02   통관 (305건, 31페이지)
  03   심사 (871건, 88페이지)
  04   조사 (18건, 2페이지)
  05   공통 (5건, 1페이지)

사용 예시:
  python clip_question_crawler_final.py --start 1 --end 10
  python clip_question_crawler_final.py --start 1 --end 127 --category all
  python clip_question_crawler_final.py --start 1 --end 7  --category 01
  python clip_question_crawler_final.py --start 1 --end 31 --category 02
  python clip_question_crawler_final.py --start 1 --end 88 --category 03
        """,
    )
    parser.add_argument(
        "--db",
        default=r"D:/SQLiteDB/smart_law_ai.db",
        help="DB 파일 경로 (기본값: D:/SQLiteDB/smart_law_ai.db)",
    )
    parser.add_argument(
        "--attach-dir",
        default=r"C:/SQLiteDB/ATTACH/CLIP_QUESTION",
        help="첨부파일 저장 디렉토리 (기본값: C:/SQLiteDB/ATTACH/CLIP_QUESTION)",
    )
    parser.add_argument(
        "--start",
        type=int,
        default=1,
        help="시작 페이지 번호 (기본값: 1)",
    )
    parser.add_argument(
        "--end",
        type=int,
        default=1,
        help="종료 페이지 번호 (기본값: 1)",
    )
    parser.add_argument(
        "--category",
        default="all",
        choices=list(CATEGORY_CODE_MAP.keys()),
        help="카테고리 필터 (기본값: all)",
    )
    args = parser.parse_args()

    # 카테고리 코드 정규화
    cat_code = CATEGORY_CODE_MAP.get(args.category, "all")

    crawler = ClipQuestionCrawler(
        db_path    = args.db,
        attach_dir = args.attach_dir,
    )
    crawler.crawl(
        start_page = args.start,
        end_page   = args.end,
        category   = cat_code,
    )


if __name__ == "__main__":
    main()
