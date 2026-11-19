import urllib3
urllib3.disable_warnings()
import os
import re
import sys
import json
import time
import random
import sqlite3
import argparse
import logging
import requests
from pathlib import Path
from bs4 import BeautifulSoup
from datetime import datetime

# DB 및 첨부파일 경로 설정
# 개별 clip_precedent.db 폐지 — 통합 DB(smart_law_ai.db)만 사용
if sys.platform.startswith('win'):
    DB_PATH = r"D:\SQLiteDB\smart_law_ai.db"
    ATTACH_BASE_DIR = r"C:\SQLiteDB\ATTACH\CLIP_PRECEDENT"
else:
    DB_PATH = "/home/ubuntu/upload/smart_law_ai.db"
    ATTACH_BASE_DIR = "/home/ubuntu/upload/ATTACH/CLIP_PRECEDENT"

SCRIPT_DIR = Path(__file__).resolve().parent
logger = logging.getLogger("clip_precedent")


def setup_logging() -> Path:
    """Create YYYYMMDD.log in the script folder and mirror logs to console."""
    log_path = SCRIPT_DIR / f"{datetime.now().strftime('%Y%m%d')}.log"
    logger.setLevel(logging.INFO)
    logger.handlers.clear()
    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    fh = logging.FileHandler(log_path, encoding="utf-8")
    fh.setFormatter(formatter)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(formatter)
    logger.addHandler(fh)
    logger.addHandler(sh)
    logger.info("Log file: %s", log_path)
    return log_path

def sanitize_filename(name: str, max_len: int = 150) -> str:
    """파일명으로 사용할 수 없는 문자 제거"""
    if not name:
        return "unnamed_file"
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    name = name.strip()
    # 확장자 보존하며 길이 제한
    if len(name) > max_len:
        base, ext = os.path.splitext(name)
        allowed_len = max_len - len(ext)
        if allowed_len > 0:
            name = base[:allowed_len] + ext
        else:
            name = name[:max_len]
    return name

class ClipPrecedentCrawler:
    def __init__(self, db_path, attach_dir):
        self.db_path = db_path
        self.attach_dir = Path(attach_dir)
        self.gubun = 'clip_precedent'
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://unipass.customs.go.kr/clip/index.do",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
        })
        self.init_db()
        self.init_session()

    def init_session(self):
        """세션 초기화 (쿠키 발급)"""
        try:
            self.session.get("https://unipass.customs.go.kr/clip/index.do", timeout=10, verify=False)
            self.session.get("https://unipass.customs.go.kr/clip/clip0105/clip0105001Q.do", timeout=10, verify=False)
        except Exception as e:
            logger.error("Session init error: %s", e)

    def init_db(self):
        """DB 초기화 및 테이블 생성"""
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)
        self.attach_dir.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # 스키마 파일이 같은 디렉토리에 있으면 읽어서 실행
        schema_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'clip_precedent_schema.sql')
        if os.path.exists(schema_path):
            with open(schema_path, 'r', encoding='utf-8') as f:
                cursor.executescript(f.read())
        conn.commit()
        conn.close()
        logger.info("DB initialized at %s", self.db_path)
        logger.info("Attachment dir at %s", self.attach_dir)

    def update_meta(self, param, url, status, message=""):
        """크롤링 메타 데이터 업데이트 (smart_law_ai 공유 crawl_meta / 구 스키마 모두 지원)"""
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.cursor()
            cols = {
                r[1] for r in cursor.execute("PRAGMA table_info(crawl_meta)").fetchall()
            }
            if not cols:
                logger.warning("crawl_meta table missing; skip meta update")
                return

            # 통합 DB 스키마: PK(gubun, param), description/url/seq_id/crawled_at/status
            if "id" not in cols and "crawled_at" in cols:
                cursor.execute(
                    """
                    INSERT INTO crawl_meta
                        (gubun, param, description, url, seq_id, crawled_at, status)
                    VALUES (?, ?, ?, ?, ?, datetime('now','localtime'), ?)
                    ON CONFLICT(gubun, param) DO UPDATE SET
                        description = excluded.description,
                        url = excluded.url,
                        status = excluded.status,
                        crawled_at = excluded.crawled_at
                    """,
                    (
                        self.gubun,
                        param,
                        (message or "")[:2000] or None,
                        url,
                        None,
                        status,
                    ),
                )
            # 구 clip_precedent.db 스키마: id / message / updated_at
            elif "id" in cols:
                cursor.execute(
                    "SELECT id FROM crawl_meta WHERE gubun=? AND param=?",
                    (self.gubun, param),
                )
                row = cursor.fetchone()
                if row:
                    if "message" in cols:
                        cursor.execute(
                            """
                            UPDATE crawl_meta
                               SET status=?, message=?,
                                   updated_at=datetime('now','localtime')
                             WHERE id=?
                            """,
                            (status, message, row[0]),
                        )
                    else:
                        cursor.execute(
                            """
                            UPDATE crawl_meta
                               SET status=?, updated_at=datetime('now','localtime')
                             WHERE id=?
                            """,
                            (status, row[0]),
                        )
                else:
                    if "message" in cols:
                        cursor.execute(
                            """
                            INSERT INTO crawl_meta
                                (gubun, param, url, status, message)
                            VALUES (?, ?, ?, ?, ?)
                            """,
                            (self.gubun, param, url, status, message),
                        )
                    else:
                        cursor.execute(
                            """
                            INSERT INTO crawl_meta (gubun, param, url, status)
                            VALUES (?, ?, ?, ?)
                            """,
                            (self.gubun, param, url, status),
                        )
            else:
                logger.warning(
                    "Unsupported crawl_meta columns: %s", sorted(cols)
                )
                return

            conn.commit()
        except Exception as e:
            logger.error("update_meta failed (%s / %s): %s", param, status, e)
            try:
                conn.rollback()
            except Exception:
                pass
        finally:
            conn.close()

    def get_list(self, page_index=1, page_unit=100):
        """판례·결정례 목록 조회 API 호출"""
        url = "https://unipass.customs.go.kr/clip/lworsrch/retrieveDtrmCaseDsbdLst.do"
        
        data = {
            "dsbdIncdClsfCd": "",
            "searchUseYn": "",
            "filters": "",
            "incdNo": "",
            "wrdcTtle": "",
            "searchCondition": "",
            "searchKeyword": "",
            "pagePerRecord": str(page_unit),
            "initPageIndex": "1",
            "pageIndex": str(page_index)
        }
        
        logger.info("Fetching list page %s...", page_index)
        
        try:
            response = self.session.post(url, data=data, timeout=30, verify=False)
            response.raise_for_status()
            
            # JSON 응답이 비어있거나 올바르지 않은 경우 세션 재초기화 후 재시도
            try:
                result = response.json()
                if not result or 'rDtrmCaseDsbdLst' not in result:
                    self.init_session()
                    response = self.session.post(url, data=data, timeout=30, verify=False)
                    result = response.json()
                return result
            except json.JSONDecodeError:
                self.init_session()
                response = self.session.post(url, data=data, timeout=30, verify=False)
                return response.json()
                
        except Exception as e:
            logger.error("Error fetching list page %s: %s", page_index, e)
            self.update_meta(f"page_{page_index}", url, "ERROR", str(e))
            return None

    def get_detail(self, dsbd_incd_no, dsbd_incd_clsf_cd="0160"):
        """판례·결정례 상세 HTML 조회 API 호출"""
        url = "https://unipass.customs.go.kr/clip/lworsrch/openULS0105002S.do"
        
        data = {
            "dsbdIncdNo": dsbd_incd_no,
            "curDsbdIncdClsfCd": dsbd_incd_clsf_cd,
            "curmenuid": "UI-ULS-0105-012Q",
            "pageIndex": "1",
            "pageUnit": "10"
        }
        
        headers = self.session.headers.copy()
        headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        
        try:
            response = self.session.post(url, data=data, headers=headers, timeout=30, verify=False)
            response.raise_for_status()
            return response.text
        except Exception as e:
            logger.error("Error fetching detail %s: %s", dsbd_incd_no, e)
            self.update_meta(f"detail_{dsbd_incd_no}", url, "ERROR", str(e))
            return None

    def get_sub_data(self, dsbd_incd_no, dsbd_incd_clsf_cd, data_type):
        """전심사건, 관련법령, HS코드 등 하위 데이터 API 호출"""
        endpoints = {
            'history': "https://unipass.customs.go.kr/clip/lworsrch/retrieveDtrmCaseDsbdPrvtDputInfoLst.do",
            'law': "https://unipass.customs.go.kr/clip/lworsrch/retrieveDtrmCaseDsbdRelaLworLst.do",
            'hs': "https://unipass.customs.go.kr/clip/lworsrch/retrieveDtrmCaseDsbdJgmtPrlstLst.do"
        }
        
        if data_type not in endpoints:
            return None
            
        url = endpoints[data_type]
        data = {
            "dsbdIncdNo": dsbd_incd_no,
            "curDsbdIncdClsfCd": dsbd_incd_clsf_cd
        }
        
        try:
            response = self.session.post(url, data=data, timeout=30, verify=False)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error("Error fetching %s for %s: %s", data_type, dsbd_incd_no, e)
            return None

    def download_attachment(self, attch_file_id, file_name, dsbd_incd_no, incd_no):
        """첨부파일 다운로드"""
        url = f"https://unipass.customs.go.kr/clip/framework/filedownload/kcs4gDownload.do?attchFileId={attch_file_id}"
        
        # 파일명 정리
        safe_file_name = sanitize_filename(file_name)
        
        # 확장자 추출
        _, ext = os.path.splitext(safe_file_name)
        ext = ext.lower().replace('.', '') if ext else 'unknown'
        
        # 사건번호별 디렉토리 생성
        safe_incd_no = sanitize_filename(incd_no)
        target_dir = self.attach_dir / safe_incd_no
        target_dir.mkdir(parents=True, exist_ok=True)
        
        local_path = str(target_dir / safe_file_name)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # 파일 다운로드
            logger.info("  Downloading attachment: %s", file_name)
            response = self.session.get(url, timeout=60, stream=True, verify=False)
            response.raise_for_status()
            
            with open(local_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
                    
            # DB 기록
            cursor.execute("""
                INSERT INTO clip_precedent_attachment (
                    gubun, dsbd_incd_no, incd_no, attch_file_id, 
                    file_name, file_type, local_path, download_url, downloaded
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                self.gubun, dsbd_incd_no, incd_no, attch_file_id,
                file_name, ext, local_path, url, 1
            ))
            conn.commit()
            
        except Exception as e:
            logger.error("  Failed to download attachment %s: %s", file_name, e)
            # 실패해도 메타정보는 기록
            cursor.execute("""
                INSERT INTO clip_precedent_attachment (
                    gubun, dsbd_incd_no, incd_no, attch_file_id, 
                    file_name, file_type, local_path, download_url, downloaded
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                self.gubun, dsbd_incd_no, incd_no, attch_file_id,
                file_name, ext, local_path, url, 0
            ))
            conn.commit()
        finally:
            conn.close()
            time.sleep(0.5)

    def download_image(self, img_url, dsbd_incd_no, incd_no, order):
        """본문 내 이미지 다운로드 및 DB 저장"""
        if not img_url.startswith('http'):
            if img_url.startswith('/'):
                img_url = f"https://unipass.customs.go.kr{img_url}"
            else:
                return
                
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            logger.info("  Downloading image %s: %s", order, img_url)
            response = self.session.get(img_url, timeout=30, verify=False)
            response.raise_for_status()
            
            image_data = response.content
            
            # MIME 타입 및 확장자 확인
            ct = response.headers.get("Content-Type", "")
            mime_type = ct.split(";")[0].strip()
            ext_map = {
                "image/png": "png", "image/gif": "gif", "image/jpeg": "jpg",
                "image/jpg": "jpg", "image/bmp": "bmp", "image/webp": "webp",
            }
            file_ext = ext_map.get(mime_type, "bin")
            
            cursor.execute("""
                INSERT INTO clip_precedent_image (
                    gubun, dsbd_incd_no, incd_no, img_order, 
                    mime_type, file_ext, image_data, download_url
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                self.gubun, dsbd_incd_no, incd_no, order,
                mime_type, file_ext, image_data, img_url
            ))
            conn.commit()
            
        except Exception as e:
            logger.error("  Failed to download image %s: %s", img_url, e)
        finally:
            conn.close()
            time.sleep(0.3)

    def parse_detail_html(self, html, dsbd_incd_no, incd_no):
        """상세 HTML 파싱 및 DB 저장"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # 상세 데이터 저장용 딕셔너리
        detail_data = {
            'dtrm_type': '', 'order_text': '', 'claim_reason': '', 
            'claimant_arg': '', 'agency_arg': '', 'issue': '', 
            'judgement': '', 'conclusion': ''
        }
        
        # 메인 테이블 파싱 (과세전적부심사, 심사청구, 심판청구 모두 대응)
        main_table = soup.find('table', {'summary': lambda x: x and '불복상세' in x}) or soup.find('table')
        if main_table:
            rows = main_table.find_all('tr')
            for row in rows:
                th_elements = row.find_all('th')
                td_elements = row.find_all('td')
                
                # th와 td를 매핑
                for i in range(min(len(th_elements), len(td_elements))):
                    th_text = th_elements[i].get_text(strip=True)
                    # 줄바꿈 유지하며 텍스트 추출
                    td_text = td_elements[i].get_text(separator='\n', strip=True)
                    
                    if '결정유형' in th_text:
                        detail_data['dtrm_type'] = td_text
                    elif '주문' in th_text:
                        detail_data['order_text'] = td_text
                    elif '청구경위' in th_text:
                        detail_data['claim_reason'] = td_text
                    elif '청구인주장' in th_text:
                        detail_data['claimant_arg'] = td_text
                    elif '처분청주장' in th_text:
                        detail_data['agency_arg'] = td_text
                    elif '쟁점사항' in th_text:
                        detail_data['issue'] = td_text
                    elif '심리 및 판단' in th_text:
                        detail_data['judgement'] = td_text
                    elif '결론' in th_text:
                        detail_data['conclusion'] = td_text

        # 첨부파일 찾기 (law_linkstyle 클래스의 data-attchfileid 속성)
        attachments = soup.find_all('a', class_='law_linkstyle')
        for a in attachments:
            attch_id = a.get('data-attchfileid')
            if attch_id:
                file_name = a.get_text(strip=True)
                self.download_attachment(attch_id, file_name, dsbd_incd_no, incd_no)
                
        # 본문 내 이미지 찾기
        content_area = soup.find('div', class_='content_area') or soup
        imgs = content_area.find_all('img')
        img_order = 1
        for img in imgs:
            src = img.get('src')
            # UI용 아이콘 등 제외
            if src and 'btn_layer' not in src and 'icon' not in src and not src.endswith('.gif'):
                self.download_image(src, dsbd_incd_no, incd_no, img_order)
                img_order += 1

        # DB 저장
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # 상세 본문 저장
            cursor.execute("""
                INSERT INTO clip_precedent_detail (
                    gubun, dsbd_incd_no, incd_no, dtrm_type, order_text,
                    claim_reason, claimant_arg, agency_arg, issue, judgement, conclusion
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                self.gubun, dsbd_incd_no, incd_no,
                detail_data['dtrm_type'], detail_data['order_text'], detail_data['claim_reason'],
                detail_data['claimant_arg'], detail_data['agency_arg'], detail_data['issue'],
                detail_data['judgement'], detail_data['conclusion']
            ))
            conn.commit()
            self.update_meta(f"detail_{dsbd_incd_no}", f"dsbd_incd_no={dsbd_incd_no}", "SUCCESS")
        except Exception as e:
            conn.rollback()
            logger.error("DB Error on detail %s: %s", dsbd_incd_no, e)
            self.update_meta(f"detail_{dsbd_incd_no}", f"dsbd_incd_no={dsbd_incd_no}", "ERROR", str(e))
        finally:
            conn.close()

    def process_sub_data(self, dsbd_incd_no, dsbd_incd_clsf_cd):
        """API를 통해 전심사건, 관련법령, 관련HS 수집 및 저장"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # 1. 전심사건내역
            hist_data = self.get_sub_data(dsbd_incd_no, dsbd_incd_clsf_cd, 'history')
            if hist_data and 'rDtrmCaseDsbdPrvtDputInfoLst' in hist_data:
                for item in hist_data['rDtrmCaseDsbdPrvtDputInfoLst']:
                    hist_no = item.get('prvtDputIncdNo')
                    if hist_no:
                        cursor.execute("""
                            INSERT INTO clip_precedent_history (gubun, dsbd_incd_no, hist_incd_no)
                            VALUES (?, ?, ?)
                        """, (self.gubun, dsbd_incd_no, hist_no))
            
            # 2. 관련법령
            law_data = self.get_sub_data(dsbd_incd_no, dsbd_incd_clsf_cd, 'law')
            if law_data and 'rDtrmCaseDsbdRelaLworLst' in law_data:
                for item in law_data['rDtrmCaseDsbdRelaLworLst']:
                    law_name = item.get('lworKoreNm', '')
                    law_title = item.get('lworUtCnTit', '')
                    law_content = item.get('lworUtCn', '')
                    
                    full_name = f"{law_name} {law_title}".strip()
                    if full_name:
                        cursor.execute("""
                            INSERT INTO clip_precedent_law (gubun, dsbd_incd_no, law_name, law_content)
                            VALUES (?, ?, ?, ?)
                        """, (self.gubun, dsbd_incd_no, full_name, law_content))
                        
            # 3. 관련HS
            hs_data = self.get_sub_data(dsbd_incd_no, dsbd_incd_clsf_cd, 'hs')
            if hs_data and 'rDtrmCaseDsbdJgmtPrlstLst' in hs_data:
                for item in hs_data['rDtrmCaseDsbdJgmtPrlstLst']:
                    hs_code = item.get('hskCd', '')
                    if hs_code:
                        cursor.execute("""
                            INSERT INTO clip_precedent_hs (gubun, dsbd_incd_no, hs_code, kor_name, eng_name)
                            VALUES (?, ?, ?, ?, ?)
                        """, (
                            self.gubun, dsbd_incd_no, hs_code, 
                            item.get('koreNm', ''), item.get('engNm', '')
                        ))
            
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error("Error processing sub data for %s: %s", dsbd_incd_no, e)
        finally:
            conn.close()

    def crawl_page(self, page_index, page_unit=10):
        """특정 페이지 크롤링"""
        data = self.get_list(page_index, page_unit)
        if not data:
            return False
            
        items = data.get('rDtrmCaseDsbdLst', [])
        if not items:
            logger.info("No items found on page %s", page_index)
            return False
            
        logger.info("Found %s items on page %s", len(items), page_index)
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        for item in items:
            incd_no = item.get('incdNo')
            dsbd_incd_no = item.get('dsbdIncdNo')
            dsbd_incd_clsf_cd = item.get('dsbdIncdClsfCd', '0160')
            
            if not dsbd_incd_no:
                continue
                
            # 중복 체크
            cursor.execute("SELECT id FROM clip_precedent WHERE dsbd_incd_no=?", (dsbd_incd_no,))
            if cursor.fetchone():
                logger.info("Skipping %s (already exists)", incd_no)
                continue
                
            logger.info("Processing: %s (%s)", incd_no, dsbd_incd_no)
            
            # 목록 데이터 저장
            try:
                cursor.execute("""
                    INSERT INTO clip_precedent (
                        gubun, dsbd_incd_clsf_cd, dsbd_incd_clsf_cd_nm,
                        dsbd_incd_dtrm_ofc_cstm_sgn, dsbd_incd_dtrm_ofc_cstm_sgn_nm,
                        dsbd_incd_no, dsbd_isue_lrcl_cd, dsbd_isue_lrcl_cd_nm,
                        dtrm_dt, incd_no, wrdc_ttle
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    self.gubun,
                    item.get('dsbdIncdClsfCd'), item.get('dsbdIncdClsfCdNm'),
                    item.get('dsbdIncdDtrmOfcCstmSgn'), item.get('dsbdIncdDtrmOfcCstmSgnNm'),
                    dsbd_incd_no, item.get('dsbdIsueLrclCd'), item.get('dsbdIsueLrclCdNm'),
                    item.get('dtrmDt'), incd_no, item.get('wrdcTtle')
                ))
                conn.commit()
            except Exception as e:
                logger.error("DB Error on list item %s: %s", incd_no, e)
                continue
                
            # 1. 상세 데이터 HTML 크롤링 (본문, 이미지, 첨부파일)
            html = self.get_detail(dsbd_incd_no, dsbd_incd_clsf_cd)
            if html:
                self.parse_detail_html(html, dsbd_incd_no, incd_no)
                
            # 2. 서브 데이터 API 크롤링 (전심사건, 관련법령, 관련HS)
            self.process_sub_data(dsbd_incd_no, dsbd_incd_clsf_cd)
                
            # 서버 부하 방지
            time.sleep(random.uniform(0.5, 1.5))
            
        conn.close()
        self.update_meta(f"page_{page_index}", f"page={page_index}", "SUCCESS")
        return True

    def crawl_all(self, start_page=1, end_page=None, page_unit=100):
        """전체 또는 지정된 범위의 페이지 크롤링"""
        # 첫 페이지를 조회하여 전체 페이지 수 파악
        first_page_data = self.get_list(1, page_unit)
        if not first_page_data:
            logger.error("Failed to get initial data.")
            return
            
        pagination = first_page_data.get('paginationInfo', {})
        total_pages = pagination.get('totalPageCount', 1)
        total_records = pagination.get('totalRecordCount', 0)
        
        logger.info("Total records: %s, Total pages: %s", total_records, total_pages)
        
        if end_page is None or end_page > total_pages:
            end_page = total_pages
            
        logger.info(
            "Starting crawl from page %s to %s (page_unit=%s)",
            start_page,
            end_page,
            page_unit,
        )
        
        for page in range(start_page, end_page + 1):
            self.crawl_page(page, page_unit)
            logger.info("Completed page %s/%s", page, end_page)
            time.sleep(random.uniform(1, 3))

if __name__ == "__main__":
    setup_logging()
    parser = argparse.ArgumentParser(description="관세법령정보포털 판례·결정례 크롤러")
    parser.add_argument("--page", type=int, help="특정 페이지만 크롤링")
    parser.add_argument("--start", type=int, default=1, help="시작 페이지 (기본값: 1)")
    parser.add_argument("--end", type=int, help="종료 페이지 (기본값: 전체)")
    parser.add_argument("--unit", type=int, default=10, help="페이지당 항목 수 (기본값: 10, 최대: 100)")
    parser.add_argument("--db", type=str, default=DB_PATH, help=f"DB 경로 (기본값: {DB_PATH})")
    parser.add_argument("--attach", type=str, default=ATTACH_BASE_DIR, help=f"첨부파일 저장 경로 (기본값: {ATTACH_BASE_DIR})")
    
    args = parser.parse_args()
    
    logger.info("Starting CLIP Precedent Crawler")
    logger.info("DB Path: %s", args.db)
    logger.info("Attach Path: %s", args.attach)
    
    crawler = ClipPrecedentCrawler(args.db, args.attach)
    
    if args.page:
        logger.info("Crawling specific page: %s", args.page)
        crawler.crawl_page(args.page, args.unit)
    else:
        crawler.crawl_all(args.start, args.end, args.unit)
    
    logger.info("Crawling finished.")
