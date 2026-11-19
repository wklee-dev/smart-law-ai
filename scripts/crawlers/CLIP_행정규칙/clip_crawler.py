"""
관세법령정보포탈(CLIP) 행정규칙 크롤러
===========================================
대상 URL : https://unipass.customs.go.kr/clip/index.do
수집 항목 : 행정규칙 목록, 본문, 연혁, 별표/서식(HWP·PDF), 첨부파일
저장 위치 : SQLite DB + 파일 시스템
"""

import requests
import urllib3
import sqlite3
import os
import time
import argparse
from bs4 import BeautifulSoup

# SSL 경고 무시 (서버 인증서 검증 생략)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ─────────────────────────────────────────────────────────────
# 설정 (운영 환경에 맞게 수정)
# ─────────────────────────────────────────────────────────────
DB_PATH       = r"D:\SQLiteDB\smart_law_ai.db"   # SQLite DB 경로
ATTACH_DIR    = r"C:\SQLiteDB\ATTACH"               # 파일 저장 루트 경로
REQUEST_DELAY = 1                                    # 요청 간격(초) – 서버 부하 방지

# Linux 테스트 환경 자동 전환
if os.name == "posix":
    DB_PATH    = "/home/ubuntu/smart_law_ai.db"
    ATTACH_DIR = "/home/ubuntu/ATTACH"

BASE_URL = "https://unipass.customs.go.kr/clip"


# ─────────────────────────────────────────────────────────────
# DB 초기화
# ─────────────────────────────────────────────────────────────
def init_db() -> sqlite3.Connection:
    """SQLite DB 연결 및 테이블 생성"""
    db_dir = os.path.dirname(os.path.abspath(DB_PATH))
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    # ── 행정규칙 목록 테이블 ──────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS clip_ar_rule (
        rule_id       TEXT PRIMARY KEY,   -- 행정규칙명-종류-소관부처-담당부서-발령번호-발령일자
        rule_name     TEXT,               -- 행정규칙명
        rule_type     TEXT,               -- 종류 (고시·훈령·예규·공고 등)
        dept_name     TEXT,               -- 소관부처명
        manager_name  TEXT,               -- 담당부서명
        issue_no      TEXT,               -- 발령번호
        issue_date    TEXT,               -- 발령일자 (YYYYMMDD)
        revision_type TEXT,               -- 개정유형 (일부개정·전부개정 등)
        lworAdmnRulNo TEXT,               -- 내부 행정규칙 번호
        pmgtDtTpNo    TEXT,               -- 내부 관리 날짜 번호
        content       TEXT,               -- 본문 HTML (전체 조문)
        gubun         TEXT DEFAULT 'clip_ar_rule'  -- 구분 (인덱스용)
    )""")

    # ── 연혁 테이블 ───────────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS clip_ar_history (
        history_id       TEXT PRIMARY KEY,  -- 행정규칙명-공고번호-개정일자-개정상태
        rule_id          TEXT,              -- clip_ar_rule.rule_id 참조
        rule_name        TEXT,              -- 행정규칙명
        issue_no         TEXT,              -- 공고번호
        revision_date    TEXT,              -- 개정일자 (YYYYMMDD)
        revision_status  TEXT,              -- 개정상태 (일부개정·폐지제정 등)
        gubun            TEXT DEFAULT 'clip_ar_history',
        FOREIGN KEY(rule_id) REFERENCES clip_ar_rule(rule_id)
    )""")

    # ── 별표/서식 테이블 ──────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS clip_ar_annex (
        annex_id         TEXT PRIMARY KEY,  -- rule_id-annex-일련번호
        rule_id          TEXT,              -- clip_ar_rule.rule_id 참조
        rule_name        TEXT,              -- 행정규칙명
        srno             TEXT,              -- 별표/서식 일련번호
        title            TEXT,              -- 별표/서식명
        annex_type       TEXT,              -- 유형코드 (01:별표, 02:서식 등)
        enfrDt           TEXT,              -- 시행일자
        hwp_file_id      TEXT,              -- HWP 첨부파일ID
        hwp_file_name    TEXT,              -- HWP 저장파일명
        pdf_file_id      TEXT,              -- PDF 첨부파일ID
        pdf_file_name    TEXT,              -- PDF 저장파일명
        hwp_local_path   TEXT,              -- HWP 로컬 저장경로
        pdf_local_path   TEXT,              -- PDF 로컬 저장경로
        gubun            TEXT DEFAULT 'clip_ar_annex',
        FOREIGN KEY(rule_id) REFERENCES clip_ar_rule(rule_id)
    )""")

    # ── 첨부파일 테이블 ───────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS clip_ar_attachment (
        attach_id        TEXT PRIMARY KEY,  -- rule_id-attach-일련번호
        rule_id          TEXT,              -- clip_ar_rule.rule_id 참조
        rule_name        TEXT,              -- 행정규칙명
        srno             TEXT,              -- 첨부파일 일련번호
        file_name        TEXT,              -- 첨부파일명
        lnk_url          TEXT,              -- 외부 링크 URL (법제처 등)
        local_path       TEXT,              -- 로컬 저장경로 (다운로드 성공 시)
        gubun            TEXT DEFAULT 'clip_ar_attachment',
        FOREIGN KEY(rule_id) REFERENCES clip_ar_rule(rule_id)
    )""")

    conn.commit()
    return conn


# ─────────────────────────────────────────────────────────────
# 코드 매핑
# ─────────────────────────────────────────────────────────────
ENRF_TPCD_MAP = {
    "01": "제정",    "02": "전부개정", "03": "타법개정",
    "04": "폐지제정","05": "폐지",    "06": "폐지제정",
    "07": "일부개정","08": "폐지",    "09": "제정",
    "10": "전부개정","11": "타법개정","12": "일부개정",
    "13": "폐지",   "14": "연장",    "15": "기타",
}


# ─────────────────────────────────────────────────────────────
# HTTP 세션 설정 (두 개 분리)
# ─────────────────────────────────────────────────────────────

# ① AJAX 세션 – POST API 전용 (X-Requested-With 헤더 포함)
ajax_session = requests.Session()
ajax_session.verify = False
ajax_session.headers.update({
    "User-Agent"      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept"          : "application/json, text/javascript, */*; q=0.01",
    "Accept-Language" : "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Content-Type"    : "application/x-www-form-urlencoded; charset=UTF-8",
    "Origin"          : "https://unipass.customs.go.kr",
    "Referer"         : "https://unipass.customs.go.kr/clip/index.do",
    "X-Requested-With": "XMLHttpRequest",
})

# ② HTML 세션 – 상세 페이지 본문 GET 전용 (일반 브라우저 요청처럼 동작)
html_session = requests.Session()
html_session.verify = False
html_session.headers.update({
    "User-Agent"      : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept"          : "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language" : "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer"         : "https://unipass.customs.go.kr/clip/index.do",
})


def init_html_session():
    """HTML 세션 초기화 – 메인 페이지를 방문하여 쿠키 획득"""
    try:
        html_session.get(f"{BASE_URL}/index.do", timeout=15)
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────
# API 호출 함수
# ─────────────────────────────────────────────────────────────
def _post(endpoint: str, data: dict) -> dict:
    """POST 요청 공통 처리 (AJAX 세션 사용)"""
    try:
        resp = ajax_session.post(f"{BASE_URL}{endpoint}", data=data, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"  [오류] POST {endpoint}: {e}")
        return {}


def _get_html(url: str) -> str:
    """GET 요청 공통 처리 – HTML 반환 (HTML 세션 사용)"""
    try:
        resp = html_session.get(url, timeout=30)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        print(f"  [오류] GET {url}: {e}")
        return ""


def get_total_pages() -> int:
    """전체 행정규칙 건수로 총 페이지 수 계산 (화면 기본 조회 기준)"""
    result = _post("/lworsrch/retrieveAdmnRulLst.do", {
        "lworKcd"        : "",
        "searchCondition": "",
        "searchKeyword"  : "",
        "repealYn"       : "",   # 빈값: 화면 기본 조회와 동일 (현행 규칙)
        "lworKoreNm"     : "",
        "pagePerRecord"  : "10",
        "pageIndex"      : "1",
        "currentPageNo"  : "1",
        "initPageIndex"  : "1",
    })
    total = result.get("paginationInfo", {}).get("totalRecordCount", 0)
    return (total + 9) // 10


def get_rule_list(page_index: int) -> list:
    """행정규칙 목록 조회 (1페이지 = 10건, 화면 기본 조회 기준)"""
    result = _post("/lworsrch/retrieveAdmnRulLst.do", {
        "lworKcd"        : "",
        "searchCondition": "",
        "searchKeyword"  : "",
        "repealYn"       : "",   # 빈값: 화면 기본 조회와 동일 (현행 규칙)
        "lworKoreNm"     : "",
        "pagePerRecord"  : "10",
        "pageIndex"      : str(page_index),
        "currentPageNo"  : str(page_index),
        "initPageIndex"  : str(page_index),
    })
    return result.get("rAdmnRulLst", [])


def get_rule_content(lworAdmnRulNo: str, pmgtDtTpNo: str) -> str:
    """
    행정규칙 본문 수집 – 상세 페이지 HTML 파싱
    HTML 세션(일반 브라우저 요청)으로 lworDtlInfoArea div 전체 HTML 반환
    """
    url  = f"{BASE_URL}/lworsrch/openULS0102002S.do?lworAdmnRulNo={lworAdmnRulNo}&pmgtDtTpNo={pmgtDtTpNo}"
    html = _get_html(url)
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    doc  = soup.find("div", id="lworDtlInfoArea")
    return str(doc) if doc else ""


def get_rule_history(lworAdmnRulNo: str, pmgtDtTpNo: str) -> list:
    """행정규칙 연혁 목록 조회"""
    result = _post("/lworsrch/retrieveAdmnRulHstrInfo.do", {
        "lworAdmnRulNo": lworAdmnRulNo,
        "pmgtDtTpNo"   : pmgtDtTpNo,
        "pageIndex"    : "1",
        "pageUnit"     : "100",
    })
    return result.get("rAdmnRulHstrInfo", [])


def get_rule_forms(lworAdmnRulNo: str, pmgtDtTpNo: str) -> list:
    """별표/서식 목록 조회"""
    result = _post("/lworsrch/retrieveLworAnxFrmlInfo.do", {
        "lworAdmnRulNo": lworAdmnRulNo,
        "pmgtDtTpNo"   : pmgtDtTpNo,
        "pageIndex"    : "1",
        "pageUnit"     : "500",
    })
    return result.get("rLworAnxFrmlInfo", [])


def get_rule_attachments(lworAdmnRulNo: str, pmgtDtTpNo: str) -> list:
    """첨부파일 목록 조회"""
    result = _post("/lworsrch/retrieveLworAttchFileInfo.do", {
        "lworAdmnRulNo": lworAdmnRulNo,
        "pmgtDtTpNo"   : pmgtDtTpNo,
        "pageIndex"    : "1",
        "pageUnit"     : "500",
    })
    return result.get("rLworAttchFileInfo", [])


# ─────────────────────────────────────────────────────────────
# 파일 다운로드 함수
# ─────────────────────────────────────────────────────────────
def _download(url: str, save_path: str, use_html_session: bool = False) -> bool:
    """스트리밍 방식으로 파일 다운로드"""
    sess = html_session if use_html_session else ajax_session
    try:
        resp = sess.get(url, stream=True, timeout=60, verify=False)
        resp.raise_for_status()
        with open(save_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"  [다운로드 오류] {url}: {e}")
        return False


def download_clip_file(file_id: str, save_path: str) -> bool:
    """CLIP 내부 파일 다운로드 (attchFileId 사용)"""
    url = f"{BASE_URL}/framework/filedownload/kcs4gDownload.do?attchFileId={file_id}"
    return _download(url, save_path, use_html_session=True)


def download_external_file(url: str, save_path: str) -> bool:
    """법제처 등 외부 파일 다운로드"""
    if url.startswith("http:"):
        url = url.replace("http:", "https:")
    return _download(url, save_path, use_html_session=True)


def sanitize_filename(name: str) -> str:
    """파일명에 사용 불가한 문자 치환"""
    for ch in r'<>:"/\|?*':
        name = name.replace(ch, "_")
    return name.strip()


# ─────────────────────────────────────────────────────────────
# 메인 크롤링 함수
# ─────────────────────────────────────────────────────────────
def crawl_clip_ar_rules(start_page: int = 1, end_page: int = None):
    """
    행정규칙 크롤링 메인 함수

    Parameters
    ----------
    start_page : 시작 페이지 번호 (기본값 1)
    end_page   : 종료 페이지 번호 (None이면 전체 자동 계산)
    """
    os.makedirs(ATTACH_DIR, exist_ok=True)

    # HTML 세션 초기화 (메인 페이지 방문 → 쿠키 획득)
    print("세션 초기화 중...")
    init_html_session()

    conn   = init_db()
    cursor = conn.cursor()

    # 전체 페이지 수 자동 계산
    if end_page is None:
        end_page = get_total_pages()
        print(f"전체 페이지 수: {end_page}")

    for page in range(start_page, end_page + 1):
        print(f"\n{'='*60}")
        print(f"  페이지 {page}/{end_page} 크롤링 중...")
        print(f"{'='*60}")

        rules = get_rule_list(page)
        if not rules:
            print("  목록 없음 – 다음 페이지로 이동")
            continue

        for rule in rules:
            # ── 기본 메타데이터 추출 ─────────────────────────
            rule_name     = rule.get("lworKoreNm",     "")
            rule_type     = rule.get("molegLworKcdNm", "")
            dept_name     = rule.get("lworJursdMsofNm","")
            manager_name  = rule.get("cgeDvsnCdNm",   "")
            issue_no      = rule.get("pmgtGoorNo",     "")
            issue_date    = rule.get("pmgtGoorDt",     "")
            revision_type = rule.get("enrfTpcdNm",    "")
            lworAdmnRulNo = rule.get("lworAdmnRulNo",  "")
            pmgtDtTpNo    = rule.get("pmgtDtTpNo",     "")

            # ── 중복 방지 키 ─────────────────────────────────
            rule_id = f"{rule_name}-{rule_type}-{dept_name}-{manager_name}-{issue_no}-{issue_date}"

            cursor.execute("SELECT rule_id FROM clip_ar_rule WHERE rule_id = ?", (rule_id,))
            if cursor.fetchone():
                print(f"  [SKIP] {rule_name} (이미 존재)")
                continue

            print(f"  [NEW ] {rule_name}")

            # ── 본문 크롤링 (HTML 세션으로 상세 페이지 파싱) ─
            content = get_rule_content(lworAdmnRulNo, pmgtDtTpNo)
            if not content:
                print(f"  [경고] 본문 수집 실패 – 재시도")
                time.sleep(2)
                content = get_rule_content(lworAdmnRulNo, pmgtDtTpNo)

            # ── DB 저장 (clip_ar_rule) ─────────────────────────
            cursor.execute("""
            INSERT INTO clip_ar_rule
                (rule_id, rule_name, rule_type, dept_name, manager_name,
                 issue_no, issue_date, revision_type, lworAdmnRulNo, pmgtDtTpNo,
                 content, gubun)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (rule_id, rule_name, rule_type, dept_name, manager_name,
                  issue_no, issue_date, revision_type, lworAdmnRulNo, pmgtDtTpNo,
                  content, "clip_ar_rule"))

            # ── 연혁 크롤링 & DB 저장 (clip_ar_history) ───
            histories = get_rule_history(lworAdmnRulNo, pmgtDtTpNo)
            for hist in histories:
                h_name   = hist.get("lworKoreNm",  "")
                h_no     = hist.get("pmgtGoorNo",  "")
                h_date   = hist.get("pmgtGoorDt",  "")
                h_status = ENRF_TPCD_MAP.get(hist.get("enrfTpcd", ""), hist.get("enrfTpcdNm", ""))
                h_id     = f"{h_name}-{h_no}-{h_date}-{h_status}"

                cursor.execute("""
                INSERT OR IGNORE INTO clip_ar_history
                    (history_id, rule_id, rule_name, issue_no, revision_date, revision_status, gubun)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (h_id, rule_id, h_name, h_no, h_date, h_status, "clip_ar_history"))

            # ── 파일 저장 디렉토리 생성 ──────────────────────
            safe_name  = sanitize_filename(rule_name)
            form_dir   = os.path.join(ATTACH_DIR, safe_name, "별표서식")
            attach_dir = os.path.join(ATTACH_DIR, safe_name, "첨부파일")
            os.makedirs(form_dir,   exist_ok=True)
            os.makedirs(attach_dir, exist_ok=True)

            # ── 별표/서식 다운로드 & DB 저장 ─────────────────
            forms = get_rule_forms(lworAdmnRulNo, pmgtDtTpNo)
            for form in forms:
                srno      = form.get("anxFrmlSrno",  "")
                title     = form.get("frmlTtle",     "")
                ann_type  = form.get("anxFrmlTpcd",  "")
                enfrDt    = form.get("enfrDt",       "")
                hwp_id    = form.get("hwpAttchFileId") or ""
                hwp_name  = form.get("hwpSaveFileNm")  or ""
                pdf_id    = form.get("pdfAttchFileId") or ""
                pdf_name  = form.get("pdfSaveFileNm")  or ""

                hwp_local = ""
                pdf_local = ""

                if hwp_id and hwp_name:
                    hwp_local = os.path.join(form_dir, sanitize_filename(hwp_name))
                    if not download_clip_file(hwp_id, hwp_local):
                        hwp_local = ""

                if pdf_id and pdf_name:
                    pdf_local = os.path.join(form_dir, sanitize_filename(pdf_name))
                    if not download_clip_file(pdf_id, pdf_local):
                        pdf_local = ""

                annex_id = f"{rule_id}-annex-{srno}"
                cursor.execute("""
                INSERT OR IGNORE INTO clip_ar_annex
                    (annex_id, rule_id, rule_name, srno, title, annex_type, enfrDt,
                     hwp_file_id, hwp_file_name, pdf_file_id, pdf_file_name,
                     hwp_local_path, pdf_local_path, gubun)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (annex_id, rule_id, rule_name, srno, title, ann_type, enfrDt,
                      hwp_id, hwp_name, pdf_id, pdf_name,
                      hwp_local, pdf_local, "clip_ar_annex"))

            # ── 첨부파일 다운로드 & DB 저장 ──────────────────
            # lnk_url은 다운로드 성공 여부와 무관하게 항상 저장
            attachments = get_rule_attachments(lworAdmnRulNo, pmgtDtTpNo)
            for att in attachments:
                srno     = att.get("lworAttchFileSrno", "")
                att_name = att.get("attchFileNm") or att.get("saveFileNm") or ""
                lnk_url  = att.get("lnkUrl") or ""

                if not att_name:
                    continue

                local_path = ""
                if lnk_url:
                    save_path = os.path.join(attach_dir, sanitize_filename(att_name))
                    if download_external_file(lnk_url, save_path):
                        local_path = save_path
                    # 다운로드 실패해도 lnk_url은 DB에 저장됨

                attach_id = f"{rule_id}-attach-{srno}"
                cursor.execute("""
                INSERT OR IGNORE INTO clip_ar_attachment
                    (attach_id, rule_id, rule_name, srno, file_name, lnk_url, local_path, gubun)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (attach_id, rule_id, rule_name, srno, att_name, lnk_url, local_path,
                      "clip_ar_attachment"))

            conn.commit()
            time.sleep(REQUEST_DELAY)

    conn.close()
    print("\n크롤링 완료")


# ─────────────────────────────────────────────────────────────
# 실행 진입점
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="관세법령정보포탈(CLIP) 행정규칙 크롤러",
        formatter_class=argparse.RawTextHelpFormatter,
        epilog="""사용 예시:
  python clip_crawler.py                          # 전체 크롤링
  python clip_crawler.py --start 1 --end 5        # 1~5페이지만 크롤링
  python clip_crawler.py --start 28 --end 28      # 28페이지만 크롤링
  python clip_crawler.py --db D:\\SQLiteDB\\clip_clip_ar_rule.db
  python clip_crawler.py --attach C:\\SQLiteDB\\ATTACH
  python clip_crawler.py --delay 0.5              # 요청 간격 0.5초"""
    )
    parser.add_argument("--start",  type=int,   default=1,    metavar="PAGE", help="시작 페이지 번호 (기본값: 1)")
    parser.add_argument("--end",    type=int,   default=None, metavar="PAGE", help="종료 페이지 번호 (기본값: 전체 자동 계산)")
    parser.add_argument("--db",     type=str,   default=None, metavar="PATH", help=f"SQLite DB 파일 경로 (기본값: {DB_PATH})")
    parser.add_argument("--attach", type=str,   default=None, metavar="PATH", help=f"파일 저장 루트 경로 (기본값: {ATTACH_DIR})")
    parser.add_argument("--delay",  type=float, default=None, metavar="SEC",  help=f"요청 간격(초) (기본값: {REQUEST_DELAY})")

    args = parser.parse_args()

    # 커맨드라인 인자로 전역 설정 덮어쓰기
    if args.db:
        DB_PATH = args.db
    if args.attach:
        ATTACH_DIR = args.attach
    if args.delay is not None:
        REQUEST_DELAY = args.delay

    crawl_clip_ar_rules(start_page=args.start, end_page=args.end)
