"""
유니패스(UNI-PASS) 전자등기 우편발송 목록 크롤러

핵심 동작
- 로그인 후 비밀번호 변경 안내 레이어를 자동 해제하되, 해제 실패 여부와 관계없이
  내부 메뉴 실행 함수로 전자등기 우편발송 목록 화면에 진입합니다.
- Chrome PDF 뷰어를 열지 않고 PDF를 파일로 바로 내려받아 렌더러 중단을 예방합니다.
- 행/페이지 탐색에 암묵적 대기를 사용하지 않아 빈 링크 탐색마다 5초씩 지연되지 않습니다.
- 기존 SQLite 파일의 post_detail 테이블도 필요한 컬럼을 자동 보정합니다.

실행 예
    python unipass_post_crawler.py --year 2026 --week 10
    python unipass_post_crawler.py --year 2026 --week 10 --headless
"""

import argparse
import logging
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

import pdfplumber
from dotenv import load_dotenv
from selenium import webdriver
from selenium.common.exceptions import (
    NoSuchElementException,
    NoAlertPresentException,
    StaleElementReferenceException,
    TimeoutException,
    UnexpectedAlertPresentException,
    WebDriverException,
)
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

UNIPASS_BASE = "https://unipass.customs.go.kr"
UNIPASS_LOGIN_URL = f"{UNIPASS_BASE}/csp/openLogin.do"
POST_MENU_ID = "MYC_MNU_00011141"
TARGET_DOC_NAME = "품목분류회신서"
SCRIPT_VERSION = "2026.09.09-v10-query-verified"

USER_ID = os.getenv("UNIPASS_ID", "").strip()
USER_PW = os.getenv("UNIPASS_PW", "")
DB_PATH = os.getenv("DB_PATH", "D:/SQLiteDB/unipass_bunsuk.db")
LOG_DIR = os.getenv("LOG_DIR", str(BASE_DIR / "logs"))
DOWNLOAD_DIR = Path(
    os.getenv(
        "DOWNLOAD_DIR",
        str(BASE_DIR / "downloads" / "전자등기우편발송목록"),
    )
).resolve()

GRID_SELECTORS = (
    # 절대로 일반 ``tbody tr``로 대체하지 않습니다. 메인/사이트맵의 테이블 행을
    # 전자등기 목록으로 오인해 허위 저장하는 문제를 막기 위한 대상 화면 전용 셀렉터입니다.
    "#mainarea #MYC0302001Q_table1 tbody tr",
)
NEXT_PAGE_SELECTORS = (
    "a.next",
    "a[title='다음']",
    "a[title='다음 페이지']",
    ".pagination a.next",
    ".paging a.next",
)

logger = logging.getLogger("unipass_crawler")


class SessionTokenRejected(RuntimeError):
    """UNI-PASS가 현재 브라우저 세션의 요청 토큰을 거부한 경우입니다."""


class TargetScreenNotReady(RuntimeError):
    """전자등기 우편발송 목록의 실제 조회 화면을 확인하지 못한 경우입니다."""


class QueryNotConfirmed(RuntimeError):
    """조회 버튼을 눌렀지만 표 갱신과 전체 건수를 확인하지 못한 경우입니다."""


# -----------------------------------------------------------------------------
# Logging and dates
# -----------------------------------------------------------------------------
def setup_logger(log_dir: str) -> logging.Logger:
    """콘솔과 UTF-8 로그 파일에 실행 상태를 기록합니다."""
    Path(log_dir).mkdir(parents=True, exist_ok=True)
    log_file = Path(log_dir) / f"unipass_{datetime.now():%Y%m%d_%H%M}.log"

    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()
    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.INFO)
    console.setFormatter(formatter)
    logger.addHandler(console)

    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    logger.info("로그 파일: %s", log_file.resolve())
    return logger


def get_week_dates(year: int, week: int) -> tuple[str, str]:
    """ISO 주차의 월요일과 일요일을 YYYY-MM-DD 형식으로 반환합니다."""
    first_day = datetime(year, 1, 4)
    first_monday = first_day - timedelta(days=first_day.weekday())
    start_date = first_monday + timedelta(weeks=week - 1)
    end_date = start_date + timedelta(days=6)
    return start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")


# -----------------------------------------------------------------------------
# SQLite
# -----------------------------------------------------------------------------
def resolve_db_path(path: str) -> str:
    """DB 경로의 상위 폴더를 만들고, 만들 수 없으면 프로젝트 폴더로 대체합니다."""
    db_dir = os.path.dirname(path)
    if db_dir and not os.path.exists(db_dir):
        try:
            os.makedirs(db_dir, exist_ok=True)
        except OSError:
            fallback = str(BASE_DIR / "unipass_bunsuk.db")
            logger.warning("DB 폴더 생성 실패. 대체 경로 사용: %s", fallback)
            return fallback
    return path


def ensure_columns(
    conn: sqlite3.Connection, table_name: str, column_definitions: dict[str, str]
) -> None:
    """구버전 SQLite 테이블에 누락된 비키 컬럼을 안전하게 추가합니다."""
    existing = {
        row[1] for row in conn.execute(f'PRAGMA table_info("{table_name}")').fetchall()
    }
    for column, definition in column_definitions.items():
        if column not in existing:
            conn.execute(
                f'ALTER TABLE "{table_name}" ADD COLUMN "{column}" {definition}'
            )
            logger.info("[DB] 기존 %s 테이블에 '%s' 컬럼을 추가했습니다.", table_name, column)


def init_db(path: str) -> sqlite3.Connection:
    """필요한 테이블을 만들고, 이전 버전 스키마를 호환 가능하게 보정합니다."""
    resolved = resolve_db_path(path)
    conn = sqlite3.connect(resolved)
    conn.execute("PRAGMA busy_timeout = 10000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS post_list (
            발송일자 TEXT NOT NULL,
            업무구분 TEXT NOT NULL,
            대상문서명 TEXT NOT NULL,
            문서구분부호 TEXT NOT NULL,
            수신확인일자 TEXT NOT NULL,
            등록일시 DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (발송일자, 업무구분, 대상문서명, 문서구분부호, 수신확인일자)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS post_detail (
            발송일자 TEXT NOT NULL,
            업무구분 TEXT NOT NULL,
            대상문서명 TEXT NOT NULL,
            문서구분부호 TEXT NOT NULL,
            수신확인일자 TEXT NOT NULL,
            전자등기우편번호 TEXT,
            pdf_경로 TEXT,
            본문내용 TEXT,
            등록일시 DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (발송일자, 업무구분, 대상문서명, 문서구분부호, 수신확인일자)
        )
    """)
    ensure_columns(
        conn,
        "post_detail",
        {
            "전자등기우편번호": "TEXT",
            "pdf_경로": "TEXT",
            "본문내용": "TEXT",
        },
    )
    conn.commit()
    logger.info("[DB] 초기화 완료: %s", resolved)
    return conn


def upsert_list(conn: sqlite3.Connection, row: dict[str, Any]) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO post_list
        (발송일자, 업무구분, 대상문서명, 문서구분부호, 수신확인일자)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            row["발송일자"],
            row["업무구분"],
            row["대상문서명"],
            row["문서구분부호"],
            row["수신확인일자"],
        ),
    )


def upsert_detail(
    conn: sqlite3.Connection,
    row: dict[str, Any],
    erpst_no: str,
    pdf_path: str,
    content: str,
) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO post_detail
        (발송일자, 업무구분, 대상문서명, 문서구분부호, 수신확인일자,
         전자등기우편번호, pdf_경로, 본문내용)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            row["발송일자"],
            row["업무구분"],
            row["대상문서명"],
            row["문서구분부호"],
            row["수신확인일자"],
            erpst_no,
            pdf_path,
            content,
        ),
    )


# -----------------------------------------------------------------------------
# Browser and login
# -----------------------------------------------------------------------------
def build_driver(headless: bool = False) -> webdriver.Chrome:
    """PDF 내장 뷰어를 끄고 전용 폴더로 자동 저장되는 Chrome을 실행합니다."""
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    options = Options()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--start-maximized")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.add_experimental_option(
        "prefs",
        {
            "credentials_enable_service": False,
            "profile.password_manager_enabled": False,
            "profile.password_manager_leak_detection": False,
            "profile.default_content_setting_values.notifications": 2,
            "autofill.profile_enabled": False,
            "autofill.credit_card_enabled": False,
            "download.default_directory": str(DOWNLOAD_DIR),
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
            # 가장 중요: application/pdf 응답을 Chrome PDF 탭으로 렌더링하지 않습니다.
            "plugins.always_open_pdf_externally": True,
        },
    )

    driver = webdriver.Chrome(options=options)
    # 빈 <a> 탐색에도 5초씩 소비하던 현상을 제거합니다. 필요한 지점에서만 명시적 대기를 씁니다.
    driver.implicitly_wait(0)
    driver.maximize_window()

    # 일부 Chrome 버전에서 옵션보다 CDP 설정이 우선되는 경우를 함께 처리합니다.
    try:
        driver.execute_cdp_cmd(
            "Page.setDownloadBehavior",
            {"behavior": "allow", "downloadPath": str(DOWNLOAD_DIR)},
        )
    except WebDriverException:
        logger.debug("CDP 다운로드 설정 미지원: Chrome 옵션을 사용합니다.")
    return driver


def dismiss_password_change_popup(driver: webdriver.Chrome) -> bool:
    """비밀번호 변경 안내 레이어를 닫거나 비표시 처리합니다.

    사이트 개편으로 닫기 버튼의 id/class가 달라져도 동작하도록, 안내 문구를 기준으로
    레이어를 찾습니다. 이 함수가 실패해도 다음 메뉴 진입은 JavaScript로 직접 호출하므로
    크롤링은 계속됩니다.
    """
    script = r"""
        const visible = (el) => {
          if (!el) return false;
          const s = getComputedStyle(el), r = el.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' &&
                 Number(s.opacity || 1) !== 0 && r.width > 0 && r.height > 0;
        };
        const words = ['비밀번호 변경', '비밀번호 변경주기', 'password change'];
        const all = Array.from(document.querySelectorAll(
          '[role="dialog"], .ui-dialog, .modal, .popup, .pop, .layer, .layerpop, .blockUI, div'
        ));
        const roots = all.filter((el) => {
          if (!visible(el) || !words.some((word) =>
            (el.innerText || el.textContent || '').includes(word)
          )) return false;
          const style = getComputedStyle(el);
          const namedLayer = /dialog|modal|popup|pop_|layer|blockui/i
            .test(`${el.id || ''} ${el.className || ''}`);
          const positionedLayer = ['fixed', 'absolute'].includes(style.position) &&
            Number(style.zIndex || 0) >= 10;
          return el.getAttribute('role') === 'dialog' || namedLayer || positionedLayer;
        });
        let clicked = false;
        for (const root of roots) {
          const controls = Array.from(root.querySelectorAll(
            'button, a, input[type="button"], [role="button"], .close, .btn_close, .pop_close, .ui-dialog-titlebar-close'
          ));
          const close = controls.find((el) => {
            const label = `${el.innerText || ''} ${el.textContent || ''} ${el.title || ''} ${el.getAttribute('aria-label') || ''}`
              .replace(/\s+/g, ' ').trim().toLowerCase();
            return label === 'x' || label === '×' || /닫기|close/.test(label) ||
                   /(^|\s)(btn_)?close(\s|$)/.test(el.className || '');
          });
          if (close) {
            try {
              close.click();
              close.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
              clicked = true;
            } catch (_) {}
          }
          // X 클릭이 실제로 닫히지 않거나 제어를 찾지 못하면, 안내 레이어만 비표시 처리합니다.
          if (visible(root)) {
            root.style.setProperty('display', 'none', 'important');
            root.style.setProperty('pointer-events', 'none', 'important');
          }
        }
        if (roots.length) {
          document.querySelectorAll('.blockUI, .blockOverlay, .modal-backdrop, .ui-widget-overlay')
            .forEach((el) => { el.style.setProperty('display', 'none', 'important'); });
          document.body.classList.remove('modal-open');
        }
        return {found: roots.length, clicked};
    """
    try:
        result = driver.execute_script(script)
        if result and result.get("found"):
            action = "닫기 클릭" if result.get("clicked") else "레이어 비표시"
            logger.info("[로그인] 비밀번호 변경 안내 %s 처리 완료", action)
            return True
    except WebDriverException as exc:
        logger.debug("비밀번호 변경 안내 처리 중 무시 가능한 오류: %s", exc)
    return False


def do_login(driver: webdriver.Chrome) -> None:
    """일반 사용자 로그인을 수행한 뒤 비밀번호 변경 안내를 처리합니다."""
    if not USER_ID or not USER_PW:
        raise RuntimeError(".env 파일에 UNIPASS_ID와 UNIPASS_PW를 설정해야 합니다.")

    logger.info("[단계2] 유니패스 로그인 시작...")
    driver.get(UNIPASS_LOGIN_URL)
    id_el = WebDriverWait(driver, 15).until(
        EC.presence_of_element_located(
            (By.CSS_SELECTOR, "input#loginId, input[name='loginId']")
        )
    )
    pw_el = driver.find_element(
        By.CSS_SELECTOR, "input#loginPwd, input[name='loginPwd']"
    )
    id_el.clear()
    id_el.send_keys(USER_ID)
    pw_el.clear()
    pw_el.send_keys(USER_PW)

    try:
        login_button = driver.find_element(By.CSS_SELECTOR, "button#btnIdLgn")
        driver.execute_script("arguments[0].click();", login_button)
    except NoSuchElementException:
        pw_el.submit()

    try:
        WebDriverWait(driver, 25).until(
            lambda d: "openLogin.do" not in d.current_url
        )
    except TimeoutException as exc:
        raise RuntimeError("로그인 완료 화면을 확인하지 못했습니다.") from exc

    logger.info("[단계2] 로그인 완료")
    # 렌더링 직후 팝업이 생성되는 경우도 있어 두 번 짧게 시도합니다.
    dismiss_password_change_popup(driver)
    time.sleep(0.3)
    dismiss_password_change_popup(driver)


def _wait_for_post_screen(driver: webdriver.Chrome, timeout: int = 15) -> bool:
    """실제 조회 화면의 전용 폼이 ``#mainarea`` 안에 로드됐는지 확인합니다.

    로그인 메인 화면에도 같은 메뉴명과 각종 ``tbody``가 존재합니다. 따라서 URL, 메뉴
    제목, 일반 테이블의 존재만으로는 목록 화면 진입 성공이라고 볼 수 없습니다.
    """
    try:
        WebDriverWait(driver, timeout, poll_frequency=0.2).until(
            lambda d: bool(
                d.execute_script(
                    """
                    const main = document.getElementById('mainarea');
                    const start = document.getElementById('MYC0302001Q_erpstSendStrtDt');
                    const end = document.getElementById('MYC0302001Q_erpstSendEndDt');
                    const table = document.getElementById('MYC0302001Q_table1');
                    return Boolean(
                      main && start && end && table &&
                      main.contains(start) && main.contains(end) && main.contains(table)
                    );
                    """
                )
            )
        )
        return True
    except (TimeoutException, WebDriverException):
        return False


def navigate_to_post_menu(driver: webdriver.Chrome) -> None:
    """화면 클릭·사이트맵·로그인 화면 재호출 없이 내부 메뉴를 직접 실행합니다.

    ``selA_MYC_MNU_00011141``의 원래 href는 로그인 페이지를 여는
    ``myc_f_openLgnDrt(...)``입니다. 따라서 이 앵커나 사이트맵을 대체 경로로 클릭하면
    이미 로그인된 상태에서도 로그인 절차가 다시 시작될 수 있습니다. 이 함수에서는 그
    경로를 절대 사용하지 않고, 로그인된 메인 화면의 메뉴 로드 함수만 호출합니다.
    """
    logger.info("[단계3] 전자등기 우편발송 목록으로 직접 진입합니다...")
    dismiss_password_change_popup(driver)

    # 로그인 후 실제 메뉴 링크가 실행하는 경로입니다. 브라우저 화면에서 확인한 링크도
    # ``myc_f_createLeftMenuLst('MYC_MNU_00011141', 'Y')`` 형태입니다. 이 함수는
    # 왼쪽 메뉴를 갱신한 뒤 내부적으로 myc_f_prccMenu를 호출하여 #mainarea를 로드합니다.
    # 앵커를 Selenium으로 클릭하지 않으므로 myc_f_openLgnDrt 재로그인 경로는 거치지 않습니다.
    internal_paths = (
        (
            "logged-in-menu-path",
            """
            if (typeof myc_f_createLeftMenuLst !== 'function') return 'missing-left-menu';
            myc_f_createLeftMenuLst(arguments[0], 'Y');
            return 'left-menu-called';
            """,
        ),
        (
            "direct-menu-path",
            """
            if (typeof myc_f_prccMenu !== 'function') return 'missing-prcc-menu';
            myc_f_prccMenu(arguments[0], 'Y');
            return 'prcc-menu-called';
            """,
        ),
    )
    for path_name, script in internal_paths:
        try:
            result = driver.execute_script(script, POST_MENU_ID)
            logger.debug("%s 호출 결과: %s", path_name, result)
            if str(result).endswith("-called") and _wait_for_post_screen(driver, timeout=20):
                logger.info("[단계4] 전자등기 우편발송 목록 실제 조회 화면 로딩 완료")
                return
        except WebDriverException as exc:
            logger.warning("%s 호출 실패: %s", path_name, exc)

    raise TargetScreenNotReady(
        "전자등기 우편발송 목록의 실제 조회 화면을 확인하지 못했습니다. "
        "메인/사이트맵의 HTML을 목록으로 저장하지 않았고, 재로그인도 시도하지 않았습니다."
    )


def ensure_post_screen(driver: webdriver.Chrome) -> bool:
    """주차 처리 직전에 실제 조회 화면을 확인하고 필요할 때만 내부 메뉴로 복구합니다.

    조회 결과가 0건인 것과 화면 자체가 없는 것은 다릅니다. 전자는 정상적으로 0건을
    반환하고 다음 주차로 진행해야 합니다. 후자는 한 번 메뉴를 다시 실행해 복구를
    시도하고, 계속 실패하면 해당 주차만 건너뜁니다.
    """
    alert_message = _consume_browser_alert(driver, "주차 시작 전")
    if _is_session_token_rejected(alert_message):
        logger.warning("[화면 복구] 세션 토큰 Alert가 있어 이번 주차를 건너뜁니다.")
        return False

    if _wait_for_post_screen(driver, timeout=2):
        return True

    logger.warning("[화면 복구] 전자등기 우편발송 목록 화면이 없어 내부 메뉴를 다시 엽니다.")
    try:
        navigate_to_post_menu(driver)
        return _wait_for_post_screen(driver, timeout=3)
    except TargetScreenNotReady as exc:
        logger.warning("[화면 복구] 실패: %s", exc)
        return False


def begin_list_query_monitor(driver: webdriver.Chrome) -> str:
    """목록 조회 통신과 ``#mainarea`` 갱신을 감시하기 위한 고유 토큰을 설정합니다."""
    token = f"query-{time.time_ns()}"
    installed = driver.execute_script(
        """
        const token = arguments[0];
        if (!window.__unipassCrawlerXhrMonitorInstalled) {
          const originalOpen = XMLHttpRequest.prototype.open;
          const originalSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function(method, url) {
            this.__unipassCrawlerUrl = String(url || '');
            return originalOpen.apply(this, arguments);
          };
          XMLHttpRequest.prototype.send = function() {
            const xhr = this;
            xhr.addEventListener('loadend', function() {
              const state = window.__unipassCrawlerQueryState;
              if (state && state.token) {
                state.seen = true;
                state.completed = true;
                state.status = xhr.status;
                state.url = xhr.__unipassCrawlerUrl || '';
                state.completedAt = Date.now();
                state.requests += 1;
              }
            }, {once: true});
            return originalSend.apply(this, arguments);
          };
          if (typeof window.fetch === 'function') {
            const originalFetch = window.fetch;
            window.fetch = function() {
              return originalFetch.apply(this, arguments).then((response) => {
                const state = window.__unipassCrawlerQueryState;
                if (state && state.token) {
                  state.seen = true;
                  state.completed = true;
                  state.status = response.status;
                  state.url = String(arguments[0] || '');
                  state.completedAt = Date.now();
                  state.requests += 1;
                }
                return response;
              });
            };
          }
          window.__unipassCrawlerXhrMonitorInstalled = true;
        }
        if (window.__unipassCrawlerMainObserver) window.__unipassCrawlerMainObserver.disconnect();
        window.__unipassCrawlerQueryState = {
          token: token, seen: false, completed: false, status: null, url: '',
          completedAt: null, requests: 0, mutations: 0
        };
        const main = document.getElementById('mainarea');
        if (!main) return false;
        window.__unipassCrawlerMainObserver = new MutationObserver((records) => {
          const state = window.__unipassCrawlerQueryState;
          if (state && state.token) state.mutations += records.length;
        });
        window.__unipassCrawlerMainObserver.observe(main, {
          childList: true, subtree: true, characterData: true, attributes: true
        });
        return true;
        """,
        token,
    )
    if not installed:
        raise QueryNotConfirmed("목록 조회 완료 감시기를 초기화하지 못했습니다.")
    return token


def wait_for_list_query_completion(driver: webdriver.Chrome, token: str) -> int:
    """조회 통신과 대상 화면 갱신이 모두 끝난 HTTP 상태를 반환합니다."""
    try:
        status = WebDriverWait(driver, 20, poll_frequency=0.2).until(
            lambda d: d.execute_script(
                """
                const state = window.__unipassCrawlerQueryState;
                if (!state || state.token !== arguments[0] || !state.seen || !state.completed) return null;
                // 통신만 끝나고 화면이 아직 바뀌지 않은 상태는 결과로 인정하지 않습니다.
                if (!state.mutations) return null;
                return {status: Number(state.status), requests: state.requests, mutations: state.mutations};
                """,
                token,
            )
        )
    except UnexpectedAlertPresentException:
        alert_message = _consume_browser_alert(driver, "목록 조회 AJAX 대기")
        if _is_session_token_rejected(alert_message):
            raise SessionTokenRejected(
                "UNI-PASS가 목록 조회 AJAX 중 세션 요청 토큰을 거부했습니다. "
                "이 주차는 재시도 후에도 실패하면 건너뜁니다."
            )
        raise QueryNotConfirmed(f"목록 조회 AJAX 대기 중 브라우저 Alert: {alert_message or '내용 없음'}")
    except TimeoutException as exc:
        raise QueryNotConfirmed("목록 조회 AJAX 완료를 20초 안에 확인하지 못했습니다.") from exc

    http_status = int(status["status"])
    if http_status < 200 or http_status >= 300:
        raise QueryNotConfirmed(f"목록 조회 AJAX가 HTTP {http_status}로 완료되었습니다.")
    return http_status


def read_list_query_summary(driver: webdriver.Chrome) -> dict[str, int]:
    """전용 표의 '전체 N건'과 렌더링된 데이터 행 수를 읽습니다."""
    summary = driver.execute_script(
        """
        const main = document.getElementById('mainarea');
        const table = document.getElementById('MYC0302001Q_table1');
        if (!main || !table || !main.contains(table)) return {total: null, rows: 0};
        const text = main.innerText || main.textContent || '';
        const match = text.match(/전체\\s*([0-9,]+)\\s*건/);
        const visible = (el) => {
          const style = getComputedStyle(el), rect = el.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.height > 0;
        };
        const rows = Array.from(table.querySelectorAll('tbody tr')).filter((tr) => {
          const cells = Array.from(tr.querySelectorAll(':scope > td'));
          return visible(tr) && cells.some((td) => (td.innerText || td.textContent || '').trim());
        }).length;
        return {total: match ? Number(match[1].replace(/,/g, '')) : null, rows: rows};
        """
    )
    if not summary or summary.get("total") is None:
        raise QueryNotConfirmed("조회 AJAX는 완료됐지만 전용 화면의 '전체 N건' 표시를 확인하지 못했습니다.")
    return {"total": int(summary["total"]), "rows": int(summary["rows"])}


# -----------------------------------------------------------------------------
# Search and grid snapshot
# -----------------------------------------------------------------------------
def do_search(driver: webdriver.Chrome, start_date: str, end_date: str) -> dict[str, int]:
    """발송 기간, 페이지당 100건을 설정하고 조회합니다.

    비밀번호 변경 레이어가 막 종료된 직후에는 Selenium의 ``element.click()``이
    ``ElementNotInteractableException``을 낼 수 있습니다. 날짜와 조회 버튼은 페이지
    JavaScript로 설정하며, 결과는 대상 AJAX와 ``전체 N건`` 표시가 모두 확인될 때만
    유효한 것으로 간주합니다.
    """
    logger.info("[단계5] 조회 기간 설정: %s ~ %s", start_date, end_date)

    if not _wait_for_post_screen(driver, timeout=5):
        raise TargetScreenNotReady(
            "조회 조건을 입력할 실제 전자등기 우편발송 목록 화면이 없습니다. "
            "목록 저장을 수행하지 않습니다."
        )
    try:
        # 값 설정 단계와 조회 클릭 단계를 분리합니다. UNI-PASS는 페이지당 건수 적용이나
        # 조회 클릭 뒤 곧바로 동적 화면을 교체할 수 있어, 같은 execute_script 안에서
        # 클릭하면 Selenium이 반환값을 받지 못해 None(script-not-returned)이 될 수 있습니다.
        setup_result = driver.execute_script(
            """
        const setNativeValue = (element, value) => {
          if (!element) return false;
          // React/jQuery 등의 값 감지 로직도 동작하도록 native setter를 사용합니다.
          const prototype = element instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
          setter.call(element, value);
          element.dispatchEvent(new Event('input', {bubbles: true}));
          element.dispatchEvent(new Event('change', {bubbles: true}));
          element.dispatchEvent(new Event('blur', {bubbles: true}));
          return true;
        };

        const start = document.getElementById('MYC0302001Q_erpstSendStrtDt');
        const end = document.getElementById('MYC0302001Q_erpstSendEndDt');
        if (!setNativeValue(start, arguments[0]) || !setNativeValue(end, arguments[1])) {
          return {ok: false, reason: 'date-input-not-found'};
        }

        // 페이지당 건수는 사이트 기본값(현재 10건)을 그대로 사용합니다. 별도의
        // '선택' 버튼 클릭은 비동기 화면 교체를 일으켜 조회 요청과 충돌할 수 있습니다.
        return {ok: true};
        """,
            start_date,
            end_date,
        )
        if not setup_result or not setup_result.get("ok"):
            reason = setup_result.get("reason", "unknown") if setup_result else "script-not-returned"
            raise RuntimeError(f"조회 조건 설정 실패: {reason}")

        query_token = begin_list_query_monitor(driver)

        # setTimeout으로 WebDriver 응답을 먼저 반환한 뒤 클릭합니다. 버튼의 비동기 화면
        # 갱신이 execute_script의 반환값을 삼키지 않도록 하는 장치입니다.
        submit_result = driver.execute_script(
            """
            const searchButton = Array.from(document.querySelectorAll(
              '#mainarea button, #mainarea input[type="button"], #mainarea input[type="submit"]'
            )).find((element) => ((element.innerText || element.value || '').trim() === '조회'));
            if (!searchButton) return {ok: false, reason: 'search-button-not-found'};
            window.setTimeout(() => searchButton.click(), 0);
            return {ok: true};
            """
        )
    except UnexpectedAlertPresentException:
        alert_message = _consume_browser_alert(driver, "조회 조건 설정")
        if _is_session_token_rejected(alert_message):
            raise SessionTokenRejected(
                "UNI-PASS가 조회 조건 설정 중 세션 요청 토큰을 거부했습니다. "
                "이 주차는 건너뛰고 재로그인하지 않습니다."
            )
        raise RuntimeError(f"조회 조건 설정 중 브라우저 Alert 발생: {alert_message or '내용 없음'}")
    except WebDriverException as exc:
        raise RuntimeError(f"조회 조건 설정 또는 조회 실행 중 브라우저 오류: {exc}") from exc
    if not submit_result or not submit_result.get("ok"):
        reason = submit_result.get("reason", "unknown") if submit_result else "script-not-returned"
        raise RuntimeError(f"조회 실행 요청 실패: {reason}")

    http_status = wait_for_list_query_completion(driver, query_token)
    summary = read_list_query_summary(driver)
    logger.info(
        "[단계5] 조회 완료: 전체 %s건, 현재 페이지 %s건 (AJAX HTTP %s)",
        summary["total"],
        summary["rows"],
        http_status,
    )
    return {**summary, "http_status": http_status}


def _raw_grid_rows(driver: webdriver.Chrome) -> list[dict[str, Any]]:
    """Selenium WebElement를 오래 보관하지 않고 현재 표를 JavaScript로 한 번에 스냅샷합니다."""
    script = """
        const selectors = arguments[0];
        const visible = (el) => {
          const s = getComputedStyle(el), r = el.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && r.height > 0;
        };
        for (const selector of selectors) {
          const rows = Array.from(document.querySelectorAll(selector)).filter(visible);
          if (!rows.length) continue;
          return rows.map((tr, index) => {
            const cells = Array.from(tr.querySelectorAll(':scope > td'));
            const anchor = tr.querySelector('a');
            return {
              row_index: index,
              cells: cells.map((td) => (td.innerText || td.textContent || '').trim()),
              anchor_html: anchor ? anchor.outerHTML : '',
              has_anchor: Boolean(anchor)
            };
          });
        }
        return [];
    """
    try:
        return driver.execute_script(script, list(GRID_SELECTORS)) or []
    except WebDriverException:
        return []


def _format_date(value: str) -> str:
    value = (value or "").strip()
    if re.fullmatch(r"\d{8}", value):
        return f"{value[:4]}-{value[4:6]}-{value[6:]}"
    return value


def _consume_browser_alert(driver: webdriver.Chrome, context: str) -> str:
    """열려 있는 브라우저 Alert를 닫고 메시지를 반환합니다.

    UNI-PASS는 비동기 요청의 토큰이 무효일 때 JavaScript Alert를 표시합니다. Alert가
    열린 상태에서는 그 뒤의 ``find_elements`` 같은 Selenium 호출도 모두 예외가 되므로,
    먼저 한 번만 수거해야 합니다.
    """
    try:
        alert = driver.switch_to.alert
        message = (alert.text or "").strip()
        alert.accept()
        logger.warning("[%s] UNI-PASS Alert 닫음: %s", context, message)
        return message
    except NoAlertPresentException:
        return ""
    except WebDriverException as exc:
        logger.debug("[%s] Alert 확인 중 무시 가능한 오류: %s", context, exc)
        return ""


def _raise_if_session_token_rejected(message: str, context: str) -> None:
    """유효하지 않은 요청 토큰 Alert를 재로그인 없이 안전 종료 신호로 변환합니다."""
    if _is_session_token_rejected(message):
        raise SessionTokenRejected(
            f"UNI-PASS가 세션 요청 토큰을 거부했습니다 ({context}). "
            "이미 저장한 목록은 보존했으며, 재로그인은 시도하지 않습니다."
        )


def _is_session_token_rejected(message: str) -> bool:
    """UNI-PASS의 유효하지 않은 요청 토큰 Alert인지 판별합니다."""
    normalized = (message or "").replace(" ", "")
    return "유효한토큰이없습니다" in normalized or "정상적인요청이아닙니다" in normalized


def read_table_rows(driver: webdriver.Chrome) -> list[dict[str, Any]]:
    """스냅샷된 표 행을 DB 행 구조로 정규화합니다."""
    raw_rows = _raw_grid_rows(driver)
    parsed_rows: list[dict[str, Any]] = []
    date_pattern = re.compile(r"\d{4}-\d{2}-\d{2}|\d{8}")

    for raw in raw_rows:
        texts = [text.strip() for text in raw.get("cells", [])]
        if not any(texts):
            continue

        # 실제 화면의 열 순서: 번호 | 발송일자 | 업무구분 | 대상문서명 | 문서구분부호 | 수신확인일자
        if len(texts) >= 6:
            send_dt = _format_date(texts[1])
            biz_type = texts[2]
            doc_name = texts[3]
            doc_cd = texts[4]
            rcpn_dt = _format_date(texts[5])
        else:
            dates = [_format_date(t) for t in texts if date_pattern.fullmatch(t)]
            non_date = [t for t in texts if t and not date_pattern.fullmatch(t) and not t.isdigit()]
            send_dt = dates[0] if dates else ""
            rcpn_dt = dates[1] if len(dates) > 1 else ""
            biz_type = non_date[0] if non_date else ""
            doc_name = non_date[1] if len(non_date) > 1 else ""
            doc_cd = non_date[2] if len(non_date) > 2 else ""

        if not all((send_dt, biz_type, doc_name, doc_cd)):
            logger.debug("불완전한 표 행은 건너뜀: %s", texts)
            continue

        parsed_rows.append(
            {
                "발송일자": send_dt,
                "업무구분": biz_type,
                "대상문서명": doc_name,
                "문서구분부호": doc_cd,
                "수신확인일자": rcpn_dt,
                "_row_index": int(raw["row_index"]),
                "_anchor_html": raw.get("anchor_html", ""),
                "_has_anchor": bool(raw.get("has_anchor")),
            }
        )
    return parsed_rows


def page_signature(rows: list[dict[str, Any]]) -> tuple[tuple[str, ...], ...]:
    """페이지 변경 여부를 판단하기 위한 현재 표의 경량 서명입니다."""
    return tuple(
        (
            row["발송일자"],
            row["업무구분"],
            row["대상문서명"],
            row["문서구분부호"],
            row["수신확인일자"],
        )
        for row in rows
    )


def go_next_page(
    driver: webdriver.Chrome, previous_signature: tuple[tuple[str, ...], ...]
) -> bool:
    """실제 표가 바뀐 경우에만 다음 페이지 이동을 성공으로 판정합니다.

    UNI-PASS의 세션 토큰 Alert가 감지되면 예외 스택을 내보내지 않고,
    ``SessionTokenRejected``로 상위 수집 루프에 안전 종료를 알립니다.
    """
    _raise_if_session_token_rejected(
        _consume_browser_alert(driver, "다음 페이지 이동 전"),
        "다음 페이지 이동 전",
    )

    button = None
    try:
        for selector in NEXT_PAGE_SELECTORS:
            candidates = driver.find_elements(By.CSS_SELECTOR, selector)
            button = next(
                (
                    candidate
                    for candidate in candidates
                    if candidate.is_displayed()
                    and candidate.is_enabled()
                    and "disabled" not in (candidate.get_attribute("class") or "").lower()
                    and candidate.get_attribute("aria-disabled") != "true"
                ),
                None,
            )
            if button:
                break
    except UnexpectedAlertPresentException:
        _raise_if_session_token_rejected(
            _consume_browser_alert(driver, "다음 페이지 버튼 탐색"),
            "다음 페이지 버튼 탐색",
        )
        return False
    except (NoSuchElementException, StaleElementReferenceException, WebDriverException) as exc:
        logger.debug("다음 페이지 버튼 탐색 실패: %s", exc)
        return False

    # 현재 UNI-PASS 화면은 '다음' 아이콘 대신 ``1 2 3`` 숫자 링크만 노출할 수
    # 있습니다. 이 경우 활성 숫자 다음의 링크를 찾아 이동합니다.
    if not button:
        try:
            button = driver.execute_script(
                """
                const main = document.getElementById('mainarea');
                if (!main) return null;
                const anchors = Array.from(main.querySelectorAll('a')).filter((a) => {
                  const text = (a.innerText || a.textContent || '').trim();
                  const style = getComputedStyle(a), rect = a.getBoundingClientRect();
                  return /^\\d+$/.test(text) && style.display !== 'none' &&
                    style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                });
                if (!anchors.length) return null;
                const active = Array.from(main.querySelectorAll('.on, .active, [aria-current="page"]'))
                  .map((el) => Number((el.innerText || el.textContent || '').trim()))
                  .find((value) => Number.isFinite(value) && value > 0);
                const current = active || 1;
                return anchors.find((a) => Number((a.innerText || a.textContent || '').trim()) === current + 1) || null;
                """
            )
            if button:
                logger.debug("숫자 페이지 링크로 다음 페이지(%s)를 찾았습니다.", "?")
        except (UnexpectedAlertPresentException, WebDriverException) as exc:
            if isinstance(exc, UnexpectedAlertPresentException):
                _raise_if_session_token_rejected(
                    _consume_browser_alert(driver, "숫자 페이지 탐색"),
                    "숫자 페이지 탐색",
                )
            logger.debug("숫자 페이지 링크 탐색 실패: %s", exc)
            return False

    if not button:
        return False

    try:
        driver.execute_script("arguments[0].click();", button)
        WebDriverWait(driver, 10, poll_frequency=0.25).until(
            lambda d: page_signature(read_table_rows(d)) != previous_signature
        )
        return True
    except UnexpectedAlertPresentException:
        _raise_if_session_token_rejected(
            _consume_browser_alert(driver, "다음 페이지 요청"),
            "다음 페이지 요청",
        )
        return False
    except (TimeoutException, WebDriverException):
        logger.debug("다음 페이지 클릭 후 표 변경을 확인하지 못했습니다.")
        return False


# -----------------------------------------------------------------------------
# Direct PDF download and extraction
# -----------------------------------------------------------------------------
def _directory_state(directory: Path) -> dict[Path, tuple[int, int]]:
    return {
        path: (path.stat().st_size, path.stat().st_mtime_ns)
        for path in directory.glob("*")
        if path.is_file()
    }


def _extract_erpst_no(anchor_html: str, pdf_path: Optional[Path] = None) -> str:
    """링크 속성 또는 저장 파일명에서 전자등기우편번호 후보를 찾습니다."""
    candidates = re.findall(r"(?<!\d)(\d{10,})(?!\d)", anchor_html or "")
    if candidates:
        return candidates[0]
    if pdf_path:
        candidates = re.findall(r"(?<!\d)(\d{10,})(?!\d)", pdf_path.stem)
        if candidates:
            return candidates[0]
    return ""


def _click_document_link(driver: webdriver.Chrome, row_index: int) -> bool:
    """현재 표의 지정 행 링크만 즉시 클릭합니다. WebElement를 보관하지 않아 stale을 방지합니다."""
    script = """
        const selectors = arguments[0];
        const rowIndex = arguments[1];
        const visible = (el) => {
          const s = getComputedStyle(el), r = el.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && r.height > 0;
        };
        for (const selector of selectors) {
          const rows = Array.from(document.querySelectorAll(selector)).filter(visible);
          if (!rows.length || rowIndex >= rows.length) continue;
          const link = rows[rowIndex].querySelector('a');
          if (!link) return false;
          link.scrollIntoView({block: 'center', inline: 'nearest'});
          link.click();
          return true;
        }
        return false;
    """
    try:
        return bool(driver.execute_script(script, list(GRID_SELECTORS), row_index))
    except WebDriverException as exc:
        logger.debug("문서 링크 클릭 실패: %s", exc)
        return False


def _close_unexpected_windows(driver: webdriver.Chrome, keep_handle: str) -> None:
    """다운로드 후 남은 PDF 탭/팝업만 닫고 목록 화면으로 복귀합니다."""
    try:
        for handle in list(driver.window_handles):
            if handle == keep_handle:
                continue
            driver.switch_to.window(handle)
            driver.close()
        driver.switch_to.window(keep_handle)
    except WebDriverException as exc:
        logger.debug("다운로드 후 창 정리 중 무시 가능한 오류: %s", exc)


def wait_for_download(
    directory: Path,
    before: dict[Path, tuple[int, int]],
    timeout: int = 45,
) -> Optional[Path]:
    """새 PDF가 생성되고 .crdownload 없이 크기가 안정될 때까지 유한 시간만 기다립니다."""
    deadline = time.monotonic() + timeout
    stable_sizes: dict[Path, tuple[int, int]] = {}

    while time.monotonic() < deadline:
        current = _directory_state(directory)
        partial_exists = any(
            path.suffix.lower() in {".crdownload", ".tmp", ".part"}
            and path not in before
            for path in current
        )
        candidates = [
            path
            for path, state in current.items()
            if path.suffix.lower() == ".pdf" and before.get(path) != state
        ]
        if candidates and not partial_exists:
            newest = max(candidates, key=lambda item: current[item][1])
            size, _ = current[newest]
            prior = stable_sizes.get(newest)
            if prior and prior[0] == size:
                return newest
            stable_sizes[newest] = (size, time.monotonic())
        time.sleep(0.5)
    return None


def extract_pdf_text(pdf_path: Path) -> str:
    """다운로드가 끝난 실제 PDF에서 페이지별 텍스트를 추출합니다."""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            pages = [(page.extract_text() or "").strip() for page in pdf.pages]
        return "\n\n".join(page for page in pages if page)
    except Exception as exc:
        logger.warning("PDF 텍스트 추출 실패 (%s): %s", pdf_path.name, exc)
        return ""


def download_document_pdf(
    driver: webdriver.Chrome, row: dict[str, Any], timeout: int = 45
) -> tuple[str, str, str]:
    """문서 링크를 한 번 클릭해 PDF를 직접 내려받고 본문 텍스트를 반환합니다.

    Returns:
        (전자등기우편번호, PDF 절대경로, 추출본문). 실패하면 모두 빈 문자열입니다.
    """
    before = _directory_state(DOWNLOAD_DIR)
    main_handle = driver.current_window_handle

    if not _click_document_link(driver, int(row["_row_index"])):
        logger.warning("    [PDF] 문서 링크를 찾거나 클릭하지 못했습니다.")
        return "", "", ""

    downloaded = wait_for_download(DOWNLOAD_DIR, before, timeout=timeout)
    _close_unexpected_windows(driver, main_handle)

    if not downloaded:
        logger.warning("    [PDF] %s초 안에 다운로드가 완료되지 않았습니다. 다음 문서로 진행합니다.", timeout)
        return "", "", ""

    erpst_no = _extract_erpst_no(row.get("_anchor_html", ""), downloaded)
    content = extract_pdf_text(downloaded)
    logger.info(
        "    [PDF] 저장 완료: %s (%s bytes, 본문 %s자)",
        downloaded.name,
        downloaded.stat().st_size,
        len(content),
    )
    return erpst_no, str(downloaded.resolve()), content


# -----------------------------------------------------------------------------
# Crawl loop
# -----------------------------------------------------------------------------
def crawl_all_items(
    driver: webdriver.Chrome, conn: sqlite3.Connection, expected_total: Optional[int] = None
) -> int:
    """모든 목록을 저장하고 품목분류회신서의 PDF/본문을 저장합니다.

    ``expected_total``은 조회 AJAX 완료 뒤 화면에서 읽은 ``전체 N건``입니다. 이 값이
    0보다 큰데 표가 비어 있거나, 처리한 행 수가 부족하면 이를 0건으로 오인하지 않고
    ``QueryNotConfirmed``를 발생시켜 같은 주차를 다시 조회하게 합니다.
    """
    logger.info("[단계6] 전체 목록 수집 시작...")
    logger.info("  [필터] PDF 및 본문 수집 대상: '%s'", TARGET_DOC_NAME)

    if expected_total == 0:
        logger.info("  조회된 데이터가 없습니다. (조회 화면 전체 0건 확인)")
        logger.info("[단계6] 크롤링 완료")
        logger.info("  - 목록 저장: 0건")
        logger.info("  - PDF/본문 저장 (%s): 0건", TARGET_DOC_NAME)
        return 0

    total_saved = 0
    detail_saved = 0
    page_num = 1

    while True:
        rows = read_table_rows(driver)
        if not rows:
            if page_num == 1:
                if expected_total and expected_total > 0:
                    raise QueryNotConfirmed(
                        f"조회 화면에는 전체 {expected_total}건이 표시됐지만 표 행을 읽지 못했습니다."
                    )
                logger.info("  조회된 데이터가 없습니다.")
            else:
                logger.info("  마지막 페이지(%s페이지)까지 완료.", page_num)
            break

        signature = page_signature(rows)
        logger.info("  [%s 페이지] %s건 발견", page_num, len(rows))

        for row in rows:
            try:
                is_target = row["대상문서명"] == TARGET_DOC_NAME
                upsert_list(conn, row)
                total_saved += 1

                if is_target:
                    logger.info(
                        "  [문서수집] %s | %s | %s",
                        row["발송일자"],
                        row["업무구분"],
                        row["대상문서명"],
                    )
                    if not row["_has_anchor"]:
                        logger.warning("    [PDF] 링크 요소가 없습니다.")
                        continue

                    erpst_no, pdf_path, content = download_document_pdf(driver, row)
                    if pdf_path:
                        upsert_detail(conn, row, erpst_no, pdf_path, content)
                        detail_saved += 1
                    # 각 행 처리 결과를 즉시 보존하여 브라우저 중단 시 목록 이력을 잃지 않습니다.
                    conn.commit()
                else:
                    conn.commit()
            except Exception as exc:
                conn.rollback()
                logger.exception("  항목 처리 오류 (계속 진행): %s", exc)

        # 페이지당 최대 100건으로 설정했으므로, 100건 미만이면 다음 페이지 요청 자체가
        # 불필요합니다. 서버의 토큰 검증 요청을 줄여 Alert 발생 가능성도 줄입니다.
        if expected_total is not None and total_saved >= expected_total:
            logger.info("  화면 전체 %s건을 모두 처리했습니다.", expected_total)
            break

        if expected_total is None and len(rows) < 100:
            logger.info("  마지막 페이지(%s페이지)까지 완료.", page_num)
            break

        try:
            if go_next_page(driver, signature):
                page_num += 1
            else:
                if expected_total is not None and total_saved < expected_total:
                    raise QueryNotConfirmed(
                        f"전체 {expected_total}건 중 {total_saved}건만 처리한 상태에서 다음 페이지를 찾지 못했습니다."
                    )
                logger.info("  마지막 페이지(%s페이지)까지 완료.", page_num)
                break
        except SessionTokenRejected as exc:
            raise QueryNotConfirmed(
                f"전체 {expected_total if expected_total is not None else '?'}건 처리 중 세션 토큰이 거부되었습니다: {exc}"
            ) from exc

    if expected_total is not None and total_saved < expected_total:
        raise QueryNotConfirmed(
            f"조회 화면 전체 {expected_total}건 중 {total_saved}건만 처리했습니다."
        )
    logger.info("[단계6] 크롤링 완료")
    logger.info("  - 목록 저장: %s건", total_saved)
    logger.info("  - PDF/본문 저장 (%s): %s건", TARGET_DOC_NAME, detail_saved)
    return total_saved


def crawl_week_range(
    driver: webdriver.Chrome,
    conn: sqlite3.Connection,
    year: int,
    start_week: int,
    end_week: int,
) -> tuple[int, list[int]]:
    """한 로그인 세션으로 여러 주차를 처리하고, 빈/실패 주차는 다음 주차로 넘깁니다.

    반환값은 ``(저장 목록 합계, 조회 화면을 복구하지 못해 건너뛴 주차 목록)``입니다.
    0건 조회는 정상 처리이므로 건너뛴 주차 목록에 넣지 않습니다.
    """
    total = 0
    skipped_weeks: list[int] = []

    for week in range(start_week, end_week + 1):
        start_date, end_date = get_week_dates(year, week)
        logger.info("-" * 60)
        logger.info("[%s년 %s주차] 수집 시작 (%s ~ %s)", year, week, start_date, end_date)

        completed = False
        last_error: Optional[Exception] = None
        for attempt in (1, 2):
            if not ensure_post_screen(driver):
                last_error = TargetScreenNotReady("실제 조회 화면을 복구하지 못했습니다.")
            else:
                try:
                    summary = do_search(driver, start_date, end_date)
                    # 전체 N건이 확인된 결과만 처리합니다. 0건도 전체 0건 표시가 확인된
                    # 경우에만 정상 결과로 인정합니다.
                    week_total = crawl_all_items(driver, conn, summary["total"])
                    total += week_total
                    logger.info(
                        "[%s년 %s주차] 완료: 목록 %s건 저장 (조회 전체 %s건)",
                        year,
                        week,
                        week_total,
                        summary["total"],
                    )
                    completed = True
                    break
                except (
                    TargetScreenNotReady,
                    SessionTokenRejected,
                    QueryNotConfirmed,
                    RuntimeError,
                ) as exc:
                    last_error = exc

            if attempt == 1:
                logger.warning(
                    "[%s년 %s주차] 조회 검증 실패: %s 내부 메뉴를 다시 열고 같은 주차를 1회 재시도합니다.",
                    year,
                    week,
                    last_error,
                )
                try:
                    navigate_to_post_menu(driver)
                except TargetScreenNotReady as exc:
                    last_error = exc

        if not completed:
            logger.warning(
                "[%s년 %s주차] 건너뜀: 2회 조회 검증에 실패했습니다 (%s). 다음 주차로 진행합니다.",
                year,
                week,
                last_error,
            )
            skipped_weeks.append(week)

    return total, skipped_weeks


# -----------------------------------------------------------------------------
# Entry point
# -----------------------------------------------------------------------------
def main() -> None:
    global DOWNLOAD_DIR

    parser = argparse.ArgumentParser(
        description="유니패스 전자등기 우편발송 목록 크롤러"
    )
    parser.add_argument("--year", type=int, default=datetime.now().year, help="조회 연도")
    parser.add_argument("--week", type=int, default=None, help="ISO 주차 번호")
    parser.add_argument(
        "--week-end",
        type=int,
        default=None,
        help="마지막 ISO 주차 번호. 지정하면 한 번 로그인으로 시작~종료 주차를 연속 수집합니다.",
    )
    parser.add_argument("--headless", action="store_true", help="브라우저 창 숨김")
    parser.add_argument("--db", type=str, default=DB_PATH, help="SQLite DB 경로")
    parser.add_argument("--logdir", type=str, default=LOG_DIR, help="로그 폴더")
    parser.add_argument(
        "--download-dir",
        type=str,
        default=str(DOWNLOAD_DIR),
        help="PDF 저장 폴더 (기본: downloads/전자등기우편발송목록)",
    )
    args = parser.parse_args()

    DOWNLOAD_DIR = Path(args.download_dir).resolve()
    setup_logger(args.logdir)

    if args.week is None:
        args.week = datetime.now().isocalendar()[1]
    if not 1 <= args.week <= 53:
        parser.error("--week는 1~53 사이여야 합니다.")
    if args.week_end is None:
        args.week_end = args.week
    if not 1 <= args.week_end <= 53:
        parser.error("--week-end는 1~53 사이여야 합니다.")
    if args.week_end < args.week:
        parser.error("--week-end는 --week보다 작을 수 없습니다.")

    logger.info("=" * 60)
    logger.info("유니패스 전자등기 우편발송 목록 크롤러")
    logger.info("버전: %s", SCRIPT_VERSION)
    if args.week == args.week_end:
        start_date, end_date = get_week_dates(args.year, args.week)
        logger.info("조회 기간: %s년 %s주차 (%s ~ %s)", args.year, args.week, start_date, end_date)
    else:
        logger.info(
            "조회 주차: %s년 %s~%s주차 (한 번 로그인 후 연속 수집)",
            args.year,
            args.week,
            args.week_end,
        )
    logger.info("DB 경로: %s", args.db)
    logger.info("PDF 저장: %s", DOWNLOAD_DIR)
    logger.info("=" * 60)

    conn: Optional[sqlite3.Connection] = None
    driver: Optional[webdriver.Chrome] = None
    try:
        conn = init_db(args.db)
        driver = build_driver(headless=args.headless)
        do_login(driver)
        total, skipped_weeks = crawl_week_range(
            driver,
            conn,
            args.year,
            args.week,
            args.week_end,
        )
        logger.info("전체 완료: 목록 %s건 저장", total)
        if skipped_weeks:
            logger.warning(
                "조회 화면 복구 실패로 건너뛴 주차: %s",
                ", ".join(str(week) for week in skipped_weeks),
            )
    except Exception as exc:
        logger.critical("실행 중 예외 발생: %s", exc, exc_info=True)
        raise
    finally:
        if driver:
            driver.quit()
        if conn:
            conn.close()


if __name__ == "__main__":
    main()
