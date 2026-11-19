"""
session_manager.py
유니패스 세션 관리 모듈 (Selenium 기반 공인인증서 자동화)

자동화 흐름:
  1. 유니패스 로그인 페이지 열기
  2. 아이디 / PW 입력
  3. 공동·금융인증서 체크박스 체크
  4. LOG-IN 버튼 클릭
  5. MagicLine4Web 인증서 선택창 팝업 (새 창) 자동 처리:
       - 하드디스크/이동식 탭 클릭
       - 인증서 행 선택 (alias 매칭)
       - 비밀번호 입력
       - 확인 버튼 클릭
  6. 로그인 완료 확인 (JSESSIONID 쿠키)

config.json 설정:
  "accounts": [
    {
      "login_id":    "유니패스 아이디",
      "login_pw":    "유니패스 비밀번호",
      "certificate": {
        "alias":    "인증서 소유자명 일부 (예: 관세법인한주)",
        "password": "인증서 비밀번호"
      }
    }
  ]
"""

import time
import logging
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchWindowException

try:
    import pyautogui
    pyautogui.FAILSAFE = False
    _PYAUTOGUI_OK = True
except ImportError:
    _PYAUTOGUI_OK = False

logger = logging.getLogger(__name__)

UNIPASS_BASE_URL = "https://unipass.customs.go.kr"
LOGIN_URL        = f"{UNIPASS_BASE_URL}/csp/openLogin.do"
SESSION_COOKIE   = "JSESSIONID"


# ── Chrome 옵션 ──────────────────────────────────────────────────────────────

def _build_chrome_options(profile_path: str = "") -> Options:
    opts = Options()
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    opts.add_argument("--start-maximized")
    opts.add_argument("--disable-popup-blocking")
    prefs = {
        # 알림 권한 요청 팝업 자동 허용 (1=허용, 2=차단)
        "profile.default_content_setting_values.notifications": 1,
        # 프로토콜 핸들러 확인 팝업 자동 허용
        "protocol_handler.allowed_origin_protocol_handlers": {
            "unipass.customs.go.kr": {"magicline4nx": True}
        },
        # 외부 앱 열기 확인 다이얼로그 자동 허용
        "profile.default_content_setting_values.protocol_handlers": 1,
    }
    opts.add_experimental_option("prefs", prefs)
    if profile_path and Path(profile_path).exists():
        opts.add_argument(f"--user-data-dir={profile_path}")
        logger.info(f"Chrome 프로필 사용: {profile_path}")
    return opts


# ── 로그인 입력 및 버튼 클릭 ─────────────────────────────────────────────────

def _dismiss_permission_popup(driver: webdriver.Chrome):
    """
    LOG-IN 클릭 후 나타나는 Chrome 네이티브 권한 요청 팝업
    ("이 기기의 다른 앱 및 서비스에 액세스")의 허용 버튼을
    pyautogui로 화면에서 직접 찾아 클릭합니다.
    """
    if not _PYAUTOGUI_OK:
        logger.warning("pyautogui 미설치 - 권한 팝업 자동 처리 불가 (pip install pyautogui)")
        return

    logger.info("권한 요청 팝업 대기 중 (pyautogui)...")
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            # 화면에서 '허용' 버튼 텍스트 이미지를 찾아 클릭
            # locateOnScreen은 스크린샷 기반이므로 텍스트 대신 좌표 추정 방식 사용
            # Chrome 권한 팝업은 항상 브라우저 좌상단 근처에 고정 위치로 뜸
            # '허용' 버튼은 팝업 내 왼쪽 버튼

            # 방법 1: pyautogui.locateOnScreen으로 '허용' 버튼 이미지 탐색
            # (이미지 파일 없이 텍스트 기반으로 처리하기 위해 OCR 대신 좌표 추정)

            # 방법 2: 브라우저 창 위치 기준으로 팝업 '허용' 버튼 좌표 계산
            # Chrome 권한 팝업 '허용' 버튼 위치:
            # 최대화 창 기준으로 팝업은 좌상단 (120, 90) 근처에 뜨며
            # '허용' 버튼은 팝업 내 (302, 217) 절대 좌표에 위치
            try:
                btn_x = 479
                btn_y = 329
                logger.info(f"권한 팝업 허용 버튼 좌표 클릭: ({btn_x}, {btn_y})")
                pyautogui.click(btn_x, btn_y)
                time.sleep(0.5)
                logger.info("권한 요청 팝업 허용 클릭 완료")
                return
            except Exception as e:
                logger.debug(f"좌표 계산 실패: {e}")

        except Exception as e:
            logger.debug(f"권한 팝업 처리 시도 중 오류: {e}")
        time.sleep(0.5)


def _do_login(driver: webdriver.Chrome, login_id: str, login_pw: str) -> bool:
    """
    아이디/PW 입력 → 공동·금융인증서 체크 → LOG-IN 클릭
    """
    try:
        wait = WebDriverWait(driver, 10)

        # 아이디 입력
        id_field = wait.until(EC.presence_of_element_located((By.ID, "loginId")))
        id_field.clear()
        id_field.send_keys(login_id)

        # 비밀번호 입력
        pw_field = driver.find_element(By.ID, "loginPwd")
        pw_field.clear()
        pw_field.send_keys(login_pw)

        # 공동·금융인증서 체크박스 체크 (미체크 상태일 때만)
        cert_chk = driver.find_element(By.ID, "BrwsAtdcLgnYn")
        if not cert_chk.is_selected():
            driver.execute_script("arguments[0].click();", cert_chk)
            time.sleep(0.5)

        # LOG-IN 버튼 클릭
        login_btn = driver.find_element(By.ID, "btnIdLgn")
        driver.execute_script("arguments[0].click();", login_btn)
        logger.info("LOG-IN 버튼 클릭 완료")

        # LOG-IN 클릭 직후 권한 요청 팝업 자동 허용
        time.sleep(1)
        _dismiss_permission_popup(driver)
        return True

    except Exception as e:
        logger.error(f"로그인 입력 중 오류: {e}")
        return False


# ── MagicLine4Web 인증서 선택창 자동 처리 ────────────────────────────────────

def _handle_cert_popup(driver: webdriver.Chrome, cert_alias: str, cert_password: str, timeout: int = 60) -> bool:
    """
    LOG-IN 클릭 후 나타나는 MagicLine4Web 인증서 선택창을 Selenium으로 처리합니다.

    인증서 선택창은 새 탭/창이 아닌 현재 페이지 내 iframe 또는 레이어로 뜨는 방식입니다.

    처리 순서:
      1. 페이지 내 iframe 전환 또는 현재 문서에서 인증서 선택창 요소 탐색
      2. 하드디스크/이동식 탭 클릭
      3. 인증서 행 선택 (alias 매칭, 없으면 첫 번째 선택)
      4. 비밀번호 입력
      5. 확인 버튼 클릭
    """
    logger.info(f"인증서 선택창 대기 중... (최대 {timeout}초)")
    main_handle = driver.current_window_handle

    # ── iframe 또는 현재 문서에서 인증서 선택창 요소 탐색 ──────────────────────────────────
    # 인증서 선택창이 나타날 때까지 대기
    deadline = time.time() + timeout
    cert_popup_found = False

    while time.time() < deadline:
        try:
            # 먼저 새 탭/창 여부 확인
            new_handles = [h for h in driver.window_handles if h != main_handle]
            if new_handles:
                driver.switch_to.window(new_handles[0])
                logger.info(f"새 팝업 창 감지: {driver.current_url}")
                cert_popup_found = True
                break

            # 현재 창에서 iframe 탐색
            iframes = driver.find_elements(By.TAG_NAME, "iframe")
            for iframe in iframes:
                try:
                    driver.switch_to.frame(iframe)
                    # iframe 내에 인증서 선택창 특징 요소가 있는지 확인
                    elems = driver.find_elements(By.XPATH,
                        "//*[contains(text(),'인증서 선택') or contains(text(),'Magic Line') or contains(text(),'MagicLine')]")
                    if elems:
                        logger.info("인증서 선택창 iframe 감지")
                        cert_popup_found = True
                        break
                    driver.switch_to.default_content()
                except Exception:
                    driver.switch_to.default_content()

            if cert_popup_found:
                break

            # 현재 문서에서 직접 인증서 선택창 특징 요소 확인
            elems = driver.find_elements(By.XPATH,
                "//*[contains(text(),'인증서 선택') or contains(text(),'Magic Line') or contains(text(),'MagicLine')]")
            if elems:
                logger.info("인증서 선택창 요소 감지 (현재 문서)")
                cert_popup_found = True
                break

        except Exception as e:
            logger.debug(f"인증서 선택창 탐색 중 오류: {e}")
            try:
                driver.switch_to.default_content()
            except Exception:
                pass

        time.sleep(0.5)

    if not cert_popup_found:
        logger.warning("인증서 선택창을 찾지 못했습니다.")
        return False

    try:
        wait = WebDriverWait(driver, 20)

        # ── 하드디스크/이동식 탭 클릭 ────────────────────────────────
        try:
            hdd_tab_selectors = [
                (By.XPATH, "//*[contains(text(),'하드디스크') or contains(text(),'이동식')]"),
                (By.XPATH, "//*[contains(@class,'hdd') or contains(@id,'hdd') or contains(@id,'HDD')]"),
                (By.XPATH, "//*[contains(@title,'하드디스크') or contains(@alt,'하드디스크')]"),
            ]
            hdd_clicked = False
            for by, sel in hdd_tab_selectors:
                try:
                    elem = driver.find_element(by, sel)
                    driver.execute_script("arguments[0].click();", elem)
                    logger.info(f"하드디스크/이동식 탭 클릭: {sel}")
                    hdd_clicked = True
                    time.sleep(1)
                    break
                except Exception:
                    pass
            if not hdd_clicked:
                logger.debug("하드디스크 탭 클릭 생략 (이미 선택됐거나 탭 없음)")
        except Exception as e:
            logger.debug(f"하드디스크 탭 처리 중 오류 (계속 진행): {e}")

        # ── 인증서 행 선택 ────────────────────────────────────────────
        cert_selected = False
        try:
            rows = driver.find_elements(By.XPATH, "//table//tr[td]")
            if not rows:
                rows = driver.find_elements(By.XPATH, "//tbody/tr")

            logger.info(f"인증서 목록 행 수: {len(rows)}")

            for row in rows:
                row_text = row.text
                if cert_alias and cert_alias.lower() in row_text.lower():
                    driver.execute_script("arguments[0].click();", row)
                    logger.info(f"인증서 선택 (alias 매칭): '{row_text.strip()}'")
                    cert_selected = True
                    break

            if not cert_selected and rows:
                driver.execute_script("arguments[0].click();", rows[0])
                logger.info(f"인증서 선택 (첫 번째): '{rows[0].text.strip()}'")
                cert_selected = True

        except Exception as e:
            logger.warning(f"인증서 행 선택 중 오류: {e}")

        time.sleep(0.5)

        # ── 비밀번호 입력 ─────────────────────────────────────────────
        pw_entered = False
        try:
            pw_selectors = [
                (By.XPATH, "//input[@type='password']"),
                (By.XPATH, "//input[contains(@placeholder,'비밀번호') or contains(@placeholder,'password')]"),
                (By.CSS_SELECTOR, "input[type='password']"),
            ]
            for by, sel in pw_selectors:
                try:
                    pw_field = driver.find_element(by, sel)
                    pw_field.clear()
                    pw_field.send_keys(cert_password)
                    logger.info("인증서 비밀번호 입력 완료")
                    pw_entered = True
                    break
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"비밀번호 입력 중 오류: {e}")

        if not pw_entered:
            logger.warning("비밀번호 입력 필드를 찾지 못했습니다.")

        time.sleep(0.3)

        # ── 확인 버튼 클릭 ────────────────────────────────────────────
        confirm_clicked = False
        try:
            confirm_selectors = [
                (By.XPATH, "//button[contains(text(),'확인')]"),
                (By.XPATH, "//input[@type='button' and contains(@value,'확인')]"),
                (By.XPATH, "//a[contains(text(),'확인')]"),
                (By.CSS_SELECTOR, "button.btn_confirm"),
                (By.CSS_SELECTOR, "button[id*='confirm'], button[id*='ok'], button[id*='OK']"),
            ]
            for by, sel in confirm_selectors:
                try:
                    btn = driver.find_element(by, sel)
                    driver.execute_script("arguments[0].click();", btn)
                    logger.info(f"확인 버튼 클릭: {sel}")
                    confirm_clicked = True
                    break
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"확인 버튼 클릭 중 오류: {e}")

        if not confirm_clicked:
            logger.warning("확인 버튼을 찾지 못했습니다.")

        logger.info("인증서 선택창 처리 완료")
        return True

    except Exception as e:
        logger.error(f"인증서 선택창 처리 중 오류: {e}", exc_info=True)
        return False

    finally:
        try:
            driver.switch_to.default_content()
            driver.switch_to.window(main_handle)
        except Exception:
            pass


# ── 메인 로그인 함수 ─────────────────────────────────────────────────────────

def open_browser_and_wait_for_login(config: dict) -> "webdriver.Chrome | None":
    """
    Chrome 브라우저를 열고 유니패스 공인인증서 로그인을 처리합니다.

    자동화 모드 (config에 인증서 정보 설정 시):
      1. 유니패스 로그인 페이지 열기
      2. 아이디/PW 입력 + 공동·금융인증서 체크 + LOG-IN 클릭
      3. MagicLine4Web 인증서 선택창 Selenium 자동 처리
      4. JSESSIONID 쿠키 확인으로 로그인 완료 판단

    수동 모드 (인증서 정보 미설정 시):
      - 사용자가 수동으로 로그인할 때까지 대기

    Returns:
        로그인된 webdriver.Chrome 객체 또는 None (실패 시)
    """
    settings     = config.get("settings", {})
    profile_path = settings.get("chrome_profile_path", "")
    timeout      = int(settings.get("browser_wait_seconds", 180))

    accounts    = config.get("accounts", [])
    account     = accounts[0] if accounts else {}
    login_id    = account.get("login_id", "").strip()
    login_pw    = account.get("login_pw", "").strip()
    cert_config = account.get("certificate", {})
    cert_alias  = cert_config.get("alias", "").strip()
    cert_pw     = cert_config.get("password", "").strip()

    auto_mode = bool(login_id and login_pw and cert_pw)

    opts   = _build_chrome_options(profile_path)
    driver = webdriver.Chrome(options=opts)

    driver.get(LOGIN_URL)
    logger.info("유니패스 로그인 페이지 열림")
    time.sleep(2)

    if auto_mode:
        # ── 자동화 모드 ──────────────────────────────────────────────────────
        print(f"\n{'='*62}")
        print("  [자동화] 공인인증서 로그인 자동화를 시작합니다.")
        if cert_alias:
            print(f"  인증서 별칭: {cert_alias}")
        print(f"{'='*62}\n")

        # 아이디/PW 입력 + LOG-IN 클릭
        if not _do_login(driver, login_id, login_pw):
            print("  [안내] 로그인 입력 실패. 브라우저에서 직접 로그인해 주세요.\n")
        else:
            # MagicLine4Web 인증서 선택창 자동 처리
            time.sleep(1)
            _handle_cert_popup(driver, cert_alias, cert_pw, timeout=60)

    else:
        # ── 수동 모드 ────────────────────────────────────────────────────────
        print(f"\n{'='*62}")
        print("  [안내] 브라우저에서 공인인증서 로그인을 완료해 주세요.")
        print(f"  최대 대기 시간: {timeout}초")
        print(f"{'='*62}\n")

    # ── 로그인 완료 대기 (자동/수동 공통) ────────────────────────────────────
    start = time.time()
    while time.time() - start < timeout:
        try:
            # 팝업 창이 열려 있으면 메인 창으로 복귀
            if len(driver.window_handles) > 1:
                driver.switch_to.window(driver.window_handles[0])

            current_url = driver.current_url
            cookies     = {c["name"]: c["value"] for c in driver.get_cookies()}
            has_session = SESSION_COOKIE in cookies
            on_index    = "index.do" in current_url and "openLogin" not in current_url

            if on_index and has_session:
                logger.info(f"로그인 완료 확인 (쿠키: {list(cookies.keys())})")
                print("\n  [완료] 로그인이 확인되었습니다. 크롤링을 시작합니다.\n")
                return driver

        except NoSuchWindowException:
            logger.debug("창 전환 중 오류 (계속 대기)")
        except Exception as e:
            logger.debug(f"세션 확인 중 오류 (계속 대기): {e}")

        time.sleep(2)

    logger.warning(f"로그인 대기 타임아웃 ({timeout}초 초과)")
    print("\n  [오류] 로그인 대기 시간을 초과했습니다.\n")
    try:
        driver.quit()
    except Exception:
        pass
    return None


def verify_driver_session(driver: webdriver.Chrome) -> bool:
    """브라우저 세션이 유효한 로그인 상태인지 확인합니다."""
    try:
        cookies     = {c["name"]: c["value"] for c in driver.get_cookies()}
        has_session = SESSION_COOKIE in cookies
        on_index    = "openLogin" not in driver.current_url
        if on_index and has_session:
            return True
    except Exception as e:
        logger.error(f"세션 확인 오류: {e}")
    return False


def get_authenticated_driver(config: dict) -> "webdriver.Chrome | None":
    """
    인증된 webdriver.Chrome을 반환하는 메인 함수.
    config에 login_id/login_pw/certificate.password가 있으면 자동화,
    없으면 수동 대기.
    """
    return open_browser_and_wait_for_login(config)
