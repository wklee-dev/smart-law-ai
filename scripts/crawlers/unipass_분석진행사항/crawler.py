"""
crawler.py  v10
유니패스 분석진행사항 크롤링 핵심 모듈

【실제 확인된 사이트 동작 방식】
  1. 목록 페이지
     - URL: /csp/index.do?tgMenuId=MYC_MNU_00000411
     - 통관고유부호 입력 필드 id: MYC0404012Q_ecm
     - 조회 버튼: id="MYC0404012Q_btnSearch"
     - 페이지네이션: 1~10 숫자 버튼 + ▶(다음그룹) + ▶▶(마지막)
       → 페이지 이동은 JS 함수(fn_search, goPage 등) 직접 호출
     - 진행상태 컬럼: '접수', '심사', '분석실 완료' 등

  2. 상세 페이지 (신고번호 클릭)
     - POST: openMYC0404013Q.do
     - hidden input 'MYC0404013Q_anayRslt' 값 = anayNo (예: B1905532)

  3. 분석결과안내문
     - 상세 페이지에서 '분석결과안내문' 버튼 클릭
     - 클립 뷰어 팝업 열림 (esupport.customs.go.kr/relay/...)
     - POST: /csp/myc/rpdcotpt/imp/imprpdcotpt/retrieveAnayRsltGddc.do
       body: anayNo=B1905532
"""

import re
import time
import logging
import math
import os
from typing import Optional

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException, NoSuchElementException, StaleElementReferenceException,
    ElementClickInterceptedException
)

logger = logging.getLogger(__name__)

UNIPASS_BASE      = "https://unipass.customs.go.kr"
ANALYSIS_MENU_ID  = "MYC_MNU_00000411"
TARGET_STATUS     = "분석실 완료"
DEFAULT_PAGE_SIZE = 10
WAIT_TIMEOUT      = 20


class PageSelectionError(ValueError):
    """페이지 선택 옵션의 형식 또는 범위가 올바르지 않을 때 발생합니다."""


def _parse_page_range(page_range: Optional[str]) -> Optional[tuple[int, int]]:
    """`FROM-TO` 형식의 페이지 범위를 검증하고 반환합니다."""
    if not page_range:
        return None

    match = re.fullmatch(r"\s*(\d+)\s*-\s*(\d+)\s*", page_range)
    if not match:
        raise PageSelectionError(
            "--page-range 형식이 올바르지 않습니다. 예: --page-range 3-10"
        )

    start_page, end_page = map(int, match.groups())
    if start_page < 1 or end_page < 1:
        raise PageSelectionError("페이지 번호는 1 이상이어야 합니다.")
    if start_page > end_page:
        raise PageSelectionError("--page-range의 시작 페이지는 종료 페이지보다 클 수 없습니다.")
    return start_page, end_page


def _parse_page_list(pages: Optional[str]) -> Optional[list[int]]:
    """쉼표로 구분한 지정 페이지 목록을 검증하고 반환합니다."""
    if not pages:
        return None

    page_tokens = [token.strip() for token in pages.split(",")]
    if not page_tokens or any(not token or not re.fullmatch(r"\d+", token) for token in page_tokens):
        raise PageSelectionError(
            "--pages 형식이 올바르지 않습니다. 예: --pages 1,3,7"
        )

    page_numbers = [int(token) for token in page_tokens]
    if any(page < 1 for page in page_numbers):
        raise PageSelectionError("페이지 번호는 1 이상이어야 합니다.")
    return page_numbers


def validate_page_selection_syntax(
    page_range: Optional[str] = None,
    pages: Optional[str] = None,
) -> None:
    """페이지 선택 옵션의 형식만 검증합니다.

    전체 페이지 수를 알 수 없는 명령행 파싱 단계에서 호출합니다.
    실제 페이지 범위 검증은 :func:`resolve_target_pages`가 수행합니다.
    """
    if page_range and pages:
        raise PageSelectionError("--page-range와 --pages는 함께 사용할 수 없습니다.")
    _parse_page_range(page_range)
    _parse_page_list(pages)


def resolve_target_pages(
    total_pages: int,
    page_range: Optional[str] = None,
    pages: Optional[str] = None,
) -> list[int]:
    """전체 페이지 수 안에서 실제로 수집할 페이지 번호 목록을 결정합니다.

    Args:
        total_pages: 조회 결과에서 계산한 전체 페이지 수입니다.
        page_range: ``"FROM-TO"`` 형식의 연속 페이지 범위입니다.
        pages: ``"PAGE,PAGE,..."`` 형식의 지정 페이지 목록입니다.

    Returns:
        오름차순, 중복 제거된 페이지 번호 목록입니다. 옵션을 생략하면 전체
        페이지 목록을 반환합니다.

    Raises:
        PageSelectionError: 옵션 형식이 잘못되었거나 조회 결과의 페이지 범위를
            벗어난 경우 발생합니다.
    """
    validate_page_selection_syntax(page_range, pages)
    if total_pages < 1:
        return []

    parsed_range = _parse_page_range(page_range)
    parsed_pages = _parse_page_list(pages)

    if parsed_range:
        start_page, end_page = parsed_range
        target_pages = list(range(start_page, end_page + 1))
    elif parsed_pages:
        target_pages = sorted(set(parsed_pages))
    else:
        target_pages = list(range(1, total_pages + 1))

    invalid_pages = [page for page in target_pages if page > total_pages]
    if invalid_pages:
        requested = ", ".join(map(str, invalid_pages))
        raise PageSelectionError(
            f"요청한 페이지({requested})가 전체 페이지 수({total_pages})를 초과합니다."
        )
    return target_pages


def describe_page_selection(
    page_range: Optional[str] = None,
    pages: Optional[str] = None,
) -> str:
    """실행 화면과 로그에 표시할 페이지 선택 설명을 반환합니다."""
    validate_page_selection_syntax(page_range, pages)
    if page_range:
        return f"범위 {page_range.strip()}"
    if pages:
        return f"지정 페이지 {pages.strip()}"
    return "전체 페이지"


# ── 디버그 저장 헬퍼 ────────────────────────────────────────────────────────

def _save_debug(content: str, filename: str, debug_mode: bool = False):
    if not debug_mode:
        return
    debug_dir = "debug_output"
    os.makedirs(debug_dir, exist_ok=True)
    path = os.path.join(debug_dir, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    logger.debug(f"디버그 저장: {path}")


# ── 분석진행사항 목록 수집 ──────────────────────────────────────────────────

def fetch_analysis_list(
    driver: webdriver.Chrome,
    customs_id: str,
    page_size: int = DEFAULT_PAGE_SIZE,
    debug_mode: bool = False,
    page_range: Optional[str] = None,
    pages: Optional[str] = None,
) -> list:
    """
    분석진행사항 페이지에서 선택한 페이지의 목록을 수집합니다.
    진행상태가 '분석실 완료'인 건만 반환합니다.

    ``page_range``는 ``"FROM-TO"`` 형식의 연속 범위이고, ``pages``는
    ``"PAGE,PAGE,..."`` 형식의 지정 목록입니다. 둘 다 생략하면 전체
    페이지를 수집합니다.
    """
    logger.info(f"[{customs_id}] ===== 크롤링 시작 =====")

    # 1. 분석진행사항 페이지 이동
    if not _navigate_to_analysis_menu(driver, customs_id, debug_mode):
        return []

    # 2. 통관고유부호 입력 및 조회
    if not _input_customs_id_and_search(driver, customs_id):
        return []

    # 3. 전체 건수 파악
    total_count = _get_total_count(driver, customs_id)
    if total_count == 0:
        logger.info(f"[{customs_id}] 조회 결과 없음")
        return []

    total_pages = math.ceil(total_count / page_size)
    logger.info(f"[{customs_id}] 전체 {total_count}건, 총 {total_pages}페이지")

    try:
        target_pages = resolve_target_pages(total_pages, page_range, pages)
    except PageSelectionError as e:
        logger.error(f"[{customs_id}] 페이지 선택 오류: {e}")
        raise
    logger.info(
        f"[{customs_id}] 수집 대상 페이지: "
        f"{', '.join(map(str, target_pages))} ({len(target_pages)}페이지)"
    )

    # 4. 페이지 이동 JS 함수 탐지 (1회만 수행)
    page_js_func = _detect_page_js_function(driver, customs_id)
    logger.info(f"[{customs_id}] 페이지 이동 JS 함수: {page_js_func or '미탐지(링크클릭방식사용)'}")

    # 5. 페이지별 목록 수집
    all_items = []
    prev_page_first_row = None  # 페이지 전환 확인용
    current_page = 1

    for sequence, page_num in enumerate(target_pages, start=1):
        # 지정 범위 또는 지정 페이지 목록의 첫 페이지가 1이 아닐 수 있습니다.
        if page_num != current_page:
            logger.info(f"[{customs_id}] 페이지 {page_num}로 이동 중...")
            if not _go_to_page(driver, page_num, customs_id, page_js_func):
                logger.warning(f"[{customs_id}] 페이지 {page_num} 이동 실패 → 종료")
                break
            current_page = page_num
            time.sleep(1.5)

        logger.info(
            f"[{customs_id}] 페이지 {page_num}/{total_pages} 수집 중... "
            f"(선택 {sequence}/{len(target_pages)})"
        )

        _save_debug(driver.page_source, f"list_p{page_num}_{customs_id}.html", debug_mode)

        items = _parse_table(driver, customs_id)
        if not items:
            logger.warning(f"[{customs_id}] 페이지 {page_num}: 테이블 데이터 없음")
            break

        # 중복 페이지 감지 (이전 페이지와 첫 행이 동일하면 페이지 이동 실패)
        current_first_row = items[0].get("신고번호", "") if items else ""
        if page_num > 1 and current_first_row == prev_page_first_row:
            logger.warning(f"[{customs_id}] 페이지 {page_num}: 이전 페이지와 동일 → 페이지 이동 실패로 중단")
            break
        prev_page_first_row = current_first_row

        # 각 항목에 페이지 번호 저장 (2단계 상세 수집 시 페이지 이동에 사용)
        for it in items:
            it["_page"] = page_num

        all_items.extend(items)
        logger.info(f"[{customs_id}] 페이지 {page_num}: {len(items)}건 수집 (누적 {len(all_items)}건)")

        if sequence >= len(target_pages):
            break

        # 다음 수집 대상 페이지로 이동합니다. 연속 범위뿐 아니라 1,3,7 같은
        # 비연속 지정도 지원하기 위해 실제 대상 목록을 사용합니다.
        next_page = target_pages[sequence]
        if not _go_to_page(driver, next_page, customs_id, page_js_func):
            logger.warning(f"[{customs_id}] 페이지 {next_page} 이동 실패 → 종료")
            break

        current_page = next_page
        time.sleep(1.5)

    # 6. '분석실 완료' 필터링
    completed_items = [
        item for item in all_items
        if TARGET_STATUS in item.get("진행상태", "")
    ]

    logger.info(
        f"[{customs_id}] 전체 {len(all_items)}건 중 '{TARGET_STATUS}' {len(completed_items)}건"
    )
    return completed_items


def _navigate_to_analysis_menu(driver, customs_id, debug_mode=False) -> bool:
    """분석진행사항 메뉴로 이동"""
    target_url = f"{UNIPASS_BASE}/csp/index.do?tgMenuId={ANALYSIS_MENU_ID}"
    logger.info(f"[{customs_id}] 분석진행사항 페이지 이동: {target_url}")
    driver.get(target_url)
    time.sleep(3)

    # 통관고유부호 입력 필드 확인
    if _find_ecm_input(driver):
        logger.info(f"[{customs_id}] 방법1 성공: 분석진행사항 페이지 로딩 완료")
        return True

    # JS 방식 시도
    try:
        driver.execute_script(f"myc_f_moveMenu('{ANALYSIS_MENU_ID}', '02', 'N');")
        time.sleep(3)
        if _find_ecm_input(driver):
            logger.info(f"[{customs_id}] 방법2 성공: JS 메뉴 이동")
            return True
    except Exception:
        pass

    # 좌측 메뉴 링크 클릭 시도
    try:
        links = driver.find_elements(By.TAG_NAME, "a")
        for link in links:
            try:
                if "분석진행사항" in (link.text or ""):
                    driver.execute_script("arguments[0].click();", link)
                    time.sleep(3)
                    if _find_ecm_input(driver):
                        logger.info(f"[{customs_id}] 방법3 성공: 메뉴 링크 클릭")
                        return True
            except StaleElementReferenceException:
                continue
    except Exception:
        pass

    _save_debug(driver.page_source, f"page_load_fail_{customs_id}.html", debug_mode)
    logger.error(f"[{customs_id}] 분석진행사항 페이지 이동 실패 (현재 URL: {driver.current_url})")
    return False


def _find_ecm_input(driver):
    """통관고유부호 입력 필드 탐색"""
    selectors = [
        "input#MYC0404012Q_ecm",
        "input[id*='_ecm']",
        "input[name='ecm']",
    ]
    for sel in selectors:
        try:
            el = WebDriverWait(driver, 3).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, sel))
            )
            if el:
                return el
        except TimeoutException:
            pass
    return None


def _input_customs_id_and_search(driver, customs_id) -> bool:
    """통관고유부호 입력 및 조회 버튼 클릭"""
    # 입력 필드 찾기
    ecm_input = _find_ecm_input(driver)
    if not ecm_input:
        logger.error(f"[{customs_id}] 통관고유부호 입력 필드를 찾을 수 없음")
        return False

    try:
        ecm_input.clear()
        ecm_input.send_keys(customs_id)
        logger.info(f"[{customs_id}] 통관고유부호 입력 완료: {customs_id}")
    except Exception as e:
        logger.error(f"[{customs_id}] 통관고유부호 입력 오류: {e}")
        return False

    # 조회 버튼 클릭
    search_selectors = [
        "button#MYC0404012Q_btnSearch",
        "button[id*='btnSearch']",
        "a[id*='btnSearch']",
    ]
    for sel in search_selectors:
        try:
            btn = driver.find_element(By.CSS_SELECTOR, sel)
            if btn.is_displayed():
                driver.execute_script("arguments[0].click();", btn)
                logger.info(f"[{customs_id}] 조회 버튼 클릭 ({sel})")
                time.sleep(3)
                return True
        except NoSuchElementException:
            pass

    # 텍스트로 탐색
    try:
        for tag in ["button", "a", "input"]:
            for el in driver.find_elements(By.TAG_NAME, tag):
                try:
                    text = el.text.strip() or el.get_attribute("value") or ""
                    if text.strip() == "조회" and el.is_displayed():
                        driver.execute_script("arguments[0].click();", el)
                        logger.info(f"[{customs_id}] 조회 버튼 클릭 (텍스트)")
                        time.sleep(3)
                        return True
                except StaleElementReferenceException:
                    continue
    except Exception:
        pass

    logger.error(f"[{customs_id}] 조회 버튼을 찾을 수 없음")
    return False


def _get_total_count(driver, customs_id) -> int:
    """전체 건수 추출"""
    try:
        WebDriverWait(driver, WAIT_TIMEOUT).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "table tbody tr"))
        )
    except TimeoutException:
        pass

    page_text = driver.find_element(By.TAG_NAME, "body").text
    match = re.search(r"전체\s*([\d,]+)\s*건", page_text)
    if match:
        count = int(match.group(1).replace(",", ""))
        logger.info(f"[{customs_id}] 전체 건수: {count}")
        return count

    # tbody 행 수로 추정
    try:
        rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
        if rows:
            logger.warning(f"[{customs_id}] 전체 건수 미탐지, tbody 행 수 사용: {len(rows)}")
            return len(rows)
    except Exception:
        pass

    return 0


def _detect_page_js_function(driver, customs_id) -> Optional[str]:
    """
    페이지네이션 링크의 onclick에서 JS 함수명 탐지.
    예: onclick="fn_search(2)" → "fn_search"
        onclick="goPage(2)"    → "goPage"
    """
    try:
        # 페이지 HTML에서 숫자 링크의 onclick 추출
        soup = BeautifulSoup(driver.page_source, "html.parser")

        # 페이지네이션 영역 탐색
        paging_area = None
        for selector in ["div.pagination", "div.paging", "div[class*='pag']",
                         "ul.pagination", "p.paging", "div.paginate"]:
            paging_area = soup.select_one(selector)
            if paging_area:
                break

        search_area = paging_area if paging_area else soup

        for a_tag in search_area.find_all("a"):
            onclick = a_tag.get("onclick", "")
            href = a_tag.get("href", "")
            text = a_tag.get_text(strip=True)

            # 숫자 링크의 onclick 패턴 추출
            if re.match(r"^\d+$", text) and text != "1":
                for pattern in [r"(\w+)\s*\(\s*(\d+)", r"javascript:(\w+)\s*\(\s*(\d+)"]:
                    m = re.search(pattern, onclick)
                    if m:
                        func_name = m.group(1)
                        if func_name not in ("void", "return"):
                            logger.debug(f"[{customs_id}] JS 함수 탐지: {func_name} (onclick='{onclick}')")
                            return func_name

            # href에서 javascript: 패턴
            if "javascript:" in href:
                m = re.search(r"javascript:(\w+)\s*\(\s*(\d+)", href)
                if m:
                    func_name = m.group(1)
                    if func_name not in ("void", "return"):
                        return func_name

        # onclick이 없으면 페이지 JS 소스에서 탐색
        scripts = soup.find_all("script")
        for script in scripts:
            src = script.string or ""
            # 페이지 이동 함수 패턴 탐색
            for pattern in [
                r"function\s+(fn_search|goPage|fnSearch|pageMove|fn_page|movePage|goPaging)\s*\(",
                r"(fn_search|goPage|fnSearch|pageMove|fn_page|movePage|goPaging)\s*=\s*function",
            ]:
                m = re.search(pattern, src)
                if m:
                    return m.group(1)

    except Exception as e:
        logger.debug(f"[{customs_id}] JS 함수 탐지 오류: {e}")

    return None


def _parse_table(driver, customs_id) -> list:
    """현재 페이지 테이블에서 행 데이터 추출"""
    items = []
    try:
        soup = BeautifulSoup(driver.page_source, "html.parser")
        all_tables = soup.find_all("table")
        if not all_tables:
            return []

        # 데이터 테이블 선택: 핵심 키워드 포함 테이블 우선
        DATA_KEYWORDS = {"신고번호", "진행상태", "분석기관", "접수일자", "회보일자"}
        table = None
        for t in all_tables:
            header_text = t.get_text()
            if any(kw in header_text for kw in DATA_KEYWORDS):
                tbody = t.find("tbody")
                td_rows = tbody.find_all("tr") if tbody else t.find_all("tr")[1:]
                td_rows = [r for r in td_rows if r.find("td")]
                if td_rows:
                    table = t
                    break

        if table is None:
            best_count = 0
            for t in all_tables:
                tbody = t.find("tbody")
                td_rows = tbody.find_all("tr") if tbody else t.find_all("tr")[1:]
                td_rows = [r for r in td_rows if r.find("td")]
                if len(td_rows) > best_count:
                    best_count = len(td_rows)
                    table = t

        if table is None:
            return []

        # 헤더 추출
        headers = []
        thead = table.find("thead")
        if thead:
            ths = thead.find_all("th")
            headers = [th.get_text(strip=True) for th in ths]
        if not headers:
            first_row = table.find("tr")
            if first_row:
                ths = first_row.find_all("th")
                headers = [th.get_text(strip=True) for th in ths]
        if not headers:
            headers = ["No", "신고번호", "신고품명", "란번호", "접수일자",
                       "분석기관", "진행상태", "보완지연사항", "회보일자"]

        logger.debug(f"[{customs_id}] 테이블 헤더: {headers}")

        # 데이터 행 추출
        tbody = table.find("tbody")
        rows = tbody.find_all("tr") if tbody else table.find_all("tr")[1:]

        row_index = 0
        for row in rows:
            tds = row.find_all("td")
            if not tds:
                continue

            row_data = {}
            for i, td in enumerate(tds):
                col_name = headers[i] if i < len(headers) else f"col_{i}"
                a_tag = td.find("a")
                row_data[col_name] = a_tag.get_text(strip=True) if a_tag else td.get_text(strip=True)

            row_data["_row_index"] = row_index
            row_index += 1

            if row_data:
                items.append(row_data)

        logger.debug(f"[{customs_id}] 파싱된 행 수: {len(items)}")

    except Exception as e:
        logger.error(f"[{customs_id}] 테이블 파싱 오류: {e}")

    return items


def _go_to_page(driver, target_page: int, customs_id: str,
                page_js_func: Optional[str] = None) -> bool:
    """
    목표 페이지로 이동합니다.

    실제 유니패스 페이지네이션 HTML 구조:
      <div class="paging">
        <ul class="pages">
          <li><a href="#1">1</a></li> ... <li class="selected"><strong>10</strong></li>
        </ul>
        <ul>
          <li class="next"><a href="#11"><span>다음10페이지</span></a></li>
          <li class="moreNext"><a href="#77"><span>마지막페이지</span></a></li>
        </ul>
      </div>

    전략 (순서대로 시도):
      1. href="#target_page" 링크 직접 클릭 (가장 정확)
      2. li.next > a 클릭으로 다음 그룹 이동 후 재시도
      3. 탐지된 JS 함수 직접 호출
      4. 알려진 JS 함수명 폴백
    """
    max_group_moves = 15  # 최대 그룹 이동 횟수 (77페이지 / 10 = 8그룹)

    for attempt in range(max_group_moves):
        # 전략 1: href="#target_page" 링크 직접 클릭
        try:
            link = driver.find_element(By.CSS_SELECTOR, f'a[href="#{target_page}"]')
            first_row_before = _get_first_row_text(driver)
            driver.execute_script("arguments[0].click();", link)
            logger.debug(f"[{customs_id}] href=#{target_page} 링크 클릭")
            if _wait_for_page_change(driver, target_page, customs_id, first_row_before):
                return True
            time.sleep(1)
        except NoSuchElementException:
            pass
        except (StaleElementReferenceException, ElementClickInterceptedException):
            time.sleep(1)

        # target_page 버튼이 현재 화면에 없음 → li.next 클릭으로 다음 그룹 이동
        next_group_clicked = False

        # 방법 A: li.next > a (유니패스 실제 구조)
        try:
            next_btn = driver.find_element(By.CSS_SELECTOR, "li.next > a, li.next a")
            driver.execute_script("arguments[0].click();", next_btn)
            logger.debug(f"[{customs_id}] li.next 클릭 (attempt {attempt+1})")
            time.sleep(2)
            next_group_clicked = True
        except NoSuchElementException:
            pass
        except Exception as e:
            logger.debug(f"[{customs_id}] li.next 클릭 실패: {e}")

        # 방법 B: .paging ul:last-child li:first-child a (두 번째 ul의 첫 번째 li)
        if not next_group_clicked:
            try:
                next_btn = driver.find_element(
                    By.CSS_SELECTOR,
                    ".paging ul:last-of-type li:first-child a, "
                    "div.paging > ul:nth-child(2) li:first-child a"
                )
                driver.execute_script("arguments[0].click();", next_btn)
                logger.debug(f"[{customs_id}] paging ul:last 첫 번째 링크 클릭 (attempt {attempt+1})")
                time.sleep(2)
                next_group_clicked = True
            except NoSuchElementException:
                pass
            except Exception:
                pass

        # 방법 C: 텍스트에 '다음' 포함 링크
        if not next_group_clicked:
            try:
                all_links = driver.find_elements(By.CSS_SELECTOR, ".paging a, div[class*='pag'] a")
                for lnk in all_links:
                    try:
                        txt = lnk.text.strip()
                        inner = lnk.get_attribute("innerHTML") or ""
                        if "다음" in txt or "다음" in inner or txt in ("▶", ">", "next"):
                            driver.execute_script("arguments[0].click();", lnk)
                            logger.debug(f"[{customs_id}] 다음 그룹 링크 클릭: {repr(txt)} (attempt {attempt+1})")
                            time.sleep(2)
                            next_group_clicked = True
                            break
                    except StaleElementReferenceException:
                        continue
            except Exception:
                pass

        # 방법 D: img alt 탐색
        if not next_group_clicked:
            try:
                imgs = driver.find_elements(
                    By.CSS_SELECTOR,
                    "a img[alt='다음'], a img[alt='next'], a img[alt='>'], a img[alt='▶']"
                )
                if imgs:
                    parent_a = imgs[0].find_element(By.XPATH, "..")
                    driver.execute_script("arguments[0].click();", parent_a)
                    logger.debug(f"[{customs_id}] img alt 다음 그룹 클릭 (attempt {attempt+1})")
                    time.sleep(2)
                    next_group_clicked = True
            except Exception:
                pass

        if not next_group_clicked:
            logger.warning(f"[{customs_id}] 페이지 {target_page} 버튼 없음, 다음 그룹 버튼도 없음")
            break

    # 전략 3: 탐지된 JS 함수 직접 호출
    if page_js_func:
        try:
            driver.execute_script(f"{page_js_func}({target_page});")
            logger.debug(f"[{customs_id}] JS 직접 호출: {page_js_func}({target_page})")
            if _wait_for_page_change(driver, target_page, customs_id):
                return True
        except Exception as e:
            logger.debug(f"[{customs_id}] JS 직접 호출 실패: {e}")

    # 전략 4: 알려진 JS 함수명 폴백
    for func in ["fn_search", "goPage", "fnSearch", "pageMove", "fn_page", "movePage", "goPaging"]:
        if func == page_js_func:
            continue
        try:
            driver.execute_script(f"{func}({target_page});")
            logger.debug(f"[{customs_id}] 폴백 JS 호출: {func}({target_page})")
            if _wait_for_page_change(driver, target_page, customs_id):
                return True
        except Exception:
            pass

    logger.warning(f"[{customs_id}] 페이지 {target_page} 이동 실패")
    return False


def _collect_paging_links(driver) -> list:
    """
    페이지네이션 링크 수집.
    Returns: [(text, element), ...]
    StaleElement 방지를 위해 element 참조를 즉시 수집.
    """
    results = []

    # 페이지네이션 컨테이너 선택자 (좁은 범위 우선)
    paging_selectors = [
        ".pagination a",
        ".paging a",
        ".paginate a",
        ".pageArea a",
        ".page-area a",
        "div[class*='pag'] a",
        "ul[class*='pag'] a",
        "p[class*='pag'] a",
        "td[class*='pag'] a",
    ]

    for sel in paging_selectors:
        try:
            links = driver.find_elements(By.CSS_SELECTOR, sel)
            if not links:
                continue
            temp = []
            for link in links:
                try:
                    text = link.text.strip()
                    if text:
                        temp.append((text, link))
                except StaleElementReferenceException:
                    continue
            if temp:
                # 숫자 링크가 하나 이상 있어야 페이지네이션으로 인정
                has_number = any(re.match(r"^\d+$", t) for t, _ in temp)
                if has_number:
                    return temp
        except Exception:
            pass

    # 폴백: 페이지 전체에서 숫자/네비 링크 탐색
    # 단, 좌측 메뉴 등 불필요한 링크 제외를 위해 테이블 아래 영역만 탐색
    try:
        # 테이블 다음 형제 요소들에서 탐색
        tables = driver.find_elements(By.CSS_SELECTOR, "table")
        if tables:
            last_table = tables[-1]
            # 테이블 이후 DOM에서 숫자 링크 탐색
            page_links_js = driver.execute_script("""
                var tables = document.querySelectorAll('table');
                var lastTable = tables[tables.length - 1];
                var results = [];
                var el = lastTable.nextElementSibling;
                var checked = 0;
                while (el && checked < 10) {
                    var links = el.querySelectorAll('a');
                    links.forEach(function(a) {
                        var t = a.textContent.trim();
                        if (/^\\d+$/.test(t) || ['▶','▶▶','◀','◀◀','>','<','>>','<<'].includes(t)) {
                            results.push(t);
                        }
                    });
                    if (results.length > 0) return results;
                    el = el.nextElementSibling;
                    checked++;
                }
                return results;
            """)
            if page_links_js:
                # 실제 element 다시 수집
                all_links = driver.find_elements(By.TAG_NAME, "a")
                page_texts = set(page_links_js)
                for link in all_links:
                    try:
                        text = link.text.strip()
                        if text in page_texts:
                            results.append((text, link))
                    except StaleElementReferenceException:
                        continue
                if results:
                    return results
    except Exception:
        pass

    # 최후 폴백: 전체 a 태그에서 숫자/네비 링크 (중복 주의)
    try:
        all_links = driver.find_elements(By.TAG_NAME, "a")
        for link in all_links:
            try:
                text = link.text.strip()
                if re.match(r"^\d+$", text) or text in ("▶", "▶▶", "◀", "◀◀"):
                    results.append((text, link))
            except StaleElementReferenceException:
                continue
    except Exception:
        pass

    return results


def _get_first_row_text(driver) -> str:
    """테이블 첫 번째 행의 텍스트 반환 (페이지 전환 확인용)"""
    try:
        rows = driver.find_elements(By.CSS_SELECTOR, "table tbody tr")
        if rows:
            return rows[0].text.strip()[:50]
    except Exception:
        pass
    return ""


def _wait_for_page_change(driver, target_page: int, customs_id: str,
                           prev_first_row: str = "", timeout: int = 10) -> bool:
    """
    페이지 전환 완료 대기.
    - 테이블 첫 행이 변경되었는지 확인
    - 또는 현재 페이지 번호 확인
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(0.5)
        try:
            # 방법 1: 현재 활성 페이지 번호 확인
            active_page = _get_current_active_page(driver)
            if active_page == target_page:
                logger.debug(f"[{customs_id}] 페이지 {target_page} 전환 확인 (active)")
                return True

            # 방법 2: 첫 행 변경 확인
            if prev_first_row:
                current_first = _get_first_row_text(driver)
                if current_first and current_first != prev_first_row:
                    logger.debug(f"[{customs_id}] 페이지 {target_page} 전환 확인 (행변경)")
                    return True
        except Exception:
            pass

    # 타임아웃 후 마지막 확인
    try:
        active_page = _get_current_active_page(driver)
        if active_page == target_page:
            return True
        if prev_first_row:
            current_first = _get_first_row_text(driver)
            if current_first and current_first != prev_first_row:
                return True
    except Exception:
        pass

    logger.debug(f"[{customs_id}] 페이지 {target_page} 전환 타임아웃")
    return False


def _get_current_active_page(driver) -> int:
    """현재 활성 페이지 번호 반환"""
    try:
        # 강조된 페이지 버튼 탐색
        active_selectors = [
            ".pagination .active a",
            ".pagination strong",
            ".paging .on a",
            ".paging .current",
            ".paging strong",
            "span.current",
            "strong.on",
            "a.on",
            "[class*='pag'] strong",
            "[class*='pag'] .on",
        ]
        for sel in active_selectors:
            try:
                el = driver.find_element(By.CSS_SELECTOR, sel)
                text = el.text.strip()
                if re.match(r"^\d+$", text):
                    return int(text)
            except NoSuchElementException:
                pass

        # JS로 확인
        result = driver.execute_script("""
            var paging = document.querySelector('.pagination, .paging, [class*="pag"]');
            if (!paging) return 0;
            var strong = paging.querySelector('strong, .on, .active, .current');
            if (strong) {
                var t = strong.textContent.trim();
                if (/^\\d+$/.test(t)) return parseInt(t);
            }
            return 0;
        """)
        if result and int(result) > 0:
            return int(result)
    except Exception:
        pass
    return 0


# ── 신고번호 클릭 → 상세 페이지 → 분석결과안내문 수집 ──────────────────────

def fetch_result_by_clicking(
    driver: webdriver.Chrome,
    item: dict,
    customs_id: str,
    debug_mode: bool = False,
) -> Optional[dict]:
    """
    목록 페이지에서 신고번호 링크를 클릭하여 상세 페이지로 이동한 후
    분석결과안내문 데이터를 수집합니다.
    """
    row_index = item.get("_row_index", 0)
    신고번호 = item.get("신고번호", "")

    try:
        # 신고번호 링크 클릭
        clicked = False

        # CSS nth-child로 행 내 첫 번째 a 태그 클릭
        try:
            sel = f"table tbody tr:nth-child({row_index + 1}) a"
            links = driver.find_elements(By.CSS_SELECTOR, sel)
            if links:
                driver.execute_script("arguments[0].click();", links[0])
                clicked = True
        except Exception:
            pass

        if not clicked:
            # 텍스트로 신고번호 링크 탐색
            try:
                all_links = driver.find_elements(By.TAG_NAME, "a")
                for link in all_links:
                    try:
                        if 신고번호 and 신고번호 in link.text:
                            driver.execute_script("arguments[0].click();", link)
                            clicked = True
                            break
                    except StaleElementReferenceException:
                        continue
            except Exception:
                pass

        if not clicked:
            logger.warning(f"[{customs_id}] 신고번호 '{신고번호}' 링크 클릭 실패")
            return None

        # 상세 페이지 로딩 대기
        time.sleep(2)
        try:
            WebDriverWait(driver, WAIT_TIMEOUT).until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, "input[id*='anayRslt'], button[id*='anayRsltGddc']")
                )
            )
        except TimeoutException:
            time.sleep(2)

        detail_html = driver.page_source
        _save_debug(detail_html, f"detail_{신고번호}_{customs_id}.html", debug_mode)

        # anayNo 추출
        anay_no = None
        try:
            anay_input = driver.find_element(By.CSS_SELECTOR, "input[id*='anayRslt']")
            anay_no = anay_input.get_attribute("value")
        except NoSuchElementException:
            soup = BeautifulSoup(detail_html, "html.parser")
            for inp in soup.find_all("input", {"type": "hidden"}):
                if "anayRslt" in (inp.get("id", "") + inp.get("name", "")):
                    anay_no = inp.get("value", "")
                    break

        if not anay_no:
            logger.warning(f"[{customs_id}] '{신고번호}' anayNo 추출 실패")
            _go_back_to_list(driver, customs_id)
            return None

        # 분석결과안내문 수집
        result_data = _get_result_doc(driver, anay_no, 신고번호, customs_id, debug_mode)

        # 목록으로 복귀
        _go_back_to_list(driver, customs_id)

        if result_data:
            result_data["anay_no"] = anay_no
            return result_data

        return {"anay_no": anay_no}

    except Exception as e:
        logger.error(f"[{customs_id}] 상세 조회 오류 ({신고번호}): {e}")
        _go_back_to_list(driver, customs_id)
        return None


def _get_result_doc(driver, anay_no, 신고번호, customs_id, debug_mode) -> Optional[dict]:
    """분석결과안내문 데이터 수집 (3가지 방법 시도)"""

    # 방법 1: 분석결과안내문 버튼 클릭 → 팝업 파싱
    try:
        btn_selectors = [
            "button#MYC0404013Q_anayRsltGddc",
            "button[id*='anayRsltGddc']",
            "a[id*='anayRsltGddc']",
        ]
        for sel in btn_selectors:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, sel)
                if btn.is_displayed():
                    original_handles = set(driver.window_handles)
                    driver.execute_script("arguments[0].click();", btn)
                    time.sleep(3)

                    new_handles = set(driver.window_handles) - original_handles
                    if new_handles:
                        popup_handle = new_handles.pop()
                        driver.switch_to.window(popup_handle)
                        time.sleep(2)
                        popup_html = driver.page_source
                        _save_debug(popup_html, f"popup_{anay_no}.html", debug_mode)
                        result = _parse_result_html(popup_html, anay_no)
                        driver.close()
                        driver.switch_to.window(list(original_handles)[0])
                        time.sleep(0.5)
                        if result:
                            return result
                    break
            except NoSuchElementException:
                pass
    except Exception as e:
        logger.debug(f"[{customs_id}] 버튼 클릭 실패: {e}")

    # 방법 2: JavaScript fetch API 직접 호출
    try:
        js_fetch = f"""
        return new Promise((resolve) => {{
            fetch('/csp/myc/rpdcotpt/imp/imprpdcotpt/retrieveAnayRsltGddc.do', {{
                method: 'POST',
                headers: {{'Content-Type': 'application/x-www-form-urlencoded'}},
                body: 'anayNo={anay_no}&anayRslt={anay_no}'
            }})
            .then(r => r.text())
            .then(html => resolve(html))
            .catch(e => resolve('ERROR:' + e.message));
        }});
        """
        html_result = driver.execute_script(js_fetch)
        if html_result and not str(html_result).startswith("ERROR:"):
            _save_debug(html_result, f"api_{anay_no}.html", debug_mode)
            result = _parse_result_html(html_result, anay_no)
            if result:
                return result
    except Exception as e:
        logger.debug(f"[{customs_id}] JS fetch 실패: {e}")

    # 방법 3: 새 탭으로 GET URL 시도
    try:
        for url in [
            f"{UNIPASS_BASE}/csp/myc/rpdcotpt/imp/imprpdcotpt/retrieveAnayRsltGddc.do?anayNo={anay_no}",
            f"{UNIPASS_BASE}/csp/myc/rpdcotpt/imp/imprpdcotpt/retrieveAnayRsltGddc.do?anayRslt={anay_no}",
        ]:
            original_handles = set(driver.window_handles)
            driver.execute_script(f"window.open('{url}', '_blank');")
            time.sleep(2)
            new_handles = set(driver.window_handles) - original_handles
            for h in new_handles:
                driver.switch_to.window(h)
                time.sleep(1)
                html = driver.page_source
                _save_debug(html, f"get_{anay_no}.html", debug_mode)
                result = _parse_result_html(html, anay_no)
                driver.close()
                driver.switch_to.window(list(original_handles)[0])
                if result:
                    return result
                break
    except Exception as e:
        logger.debug(f"[{customs_id}] GET URL 실패: {e}")

    logger.warning(f"[{customs_id}] 분석결과안내문 수집 실패: {anay_no}")
    return None


def _go_back_to_list(driver, customs_id):
    """목록으로 복귀"""
    try:
        for sel in ["button#MYC0404013Q_btnList", "button[id*='btnList']", "a[id*='btnList']"]:
            try:
                btn = driver.find_element(By.CSS_SELECTOR, sel)
                if btn.is_displayed():
                    driver.execute_script("arguments[0].click();", btn)
                    time.sleep(2)
                    return
            except NoSuchElementException:
                pass

        for tag in ["button", "a"]:
            for el in driver.find_elements(By.TAG_NAME, tag):
                try:
                    if el.text.strip() == "목록" and el.is_displayed():
                        driver.execute_script("arguments[0].click();", el)
                        time.sleep(2)
                        return
                except StaleElementReferenceException:
                    continue

        driver.back()
        time.sleep(2)
    except Exception as e:
        logger.debug(f"[{customs_id}] 목록 복귀 오류: {e}")


def _parse_result_html(html: str, anay_no: str) -> Optional[dict]:
    """
    분석결과안내문 HTML 파싱 (OZ 리포트 csvDataLst 방식)

    csvDataLst 구조 (^C^ 컬럼 구분, |R| 행 구분):
      행0: 문서번호^C^안내일자^C^화주^C^신고인^C^세관코드^C^발신세관^C^신고번호^C^신고일자^C^발신자
      행1: //EOR//
      행2: 란규격번호^C^분석란번호^C^신고품명^C^회보품명^C^상표^C^모델규격^C^신고세번^C^결정세번^C^물품설명
      행3: //EOR//
      행4: 란규격번호^C^분석란번호^C^분류의견^C^시료처리방법^C^기타^C^손실보상안내
      행5: //EOR//
      행6: (base64 이미지)
      행7: //EOR//
      (2페이지 이상인 경우 행8~: 참고사항 등 추가 데이터)
    """
    if not html or len(html) < 100:
        return None

    result = {}

    # OZ 리포트: csvDataLst 변수 추출 (^C^ 구분자 사용)
    patterns = [
        r'csvDataLst\.push\(\["(.*?)"\]\)',
        r'var\s+csvDataLst\s*=\s*\["(.*?)"\]',
        r'csvDataLst\s*=\s*\["(.*?)"\]',
    ]
    raw_data = None
    for pat in patterns:
        m = re.search(pat, html, re.DOTALL)
        if m:
            raw_data = m.group(1)
            break

    if raw_data:
        # |R| 로 행 분리 후 //EOR// 제거
        all_rows = [r.strip() for r in raw_data.split("|R|")]
        data_rows = [r for r in all_rows if r and r != "//EOR//"]

        # 행0: 헤더 정보
        if len(data_rows) > 0 and not data_rows[0].startswith("data:"):
            fields = data_rows[0].split("^C^")
            keys = ["문서번호", "안내일자", "화주", "신고인", "세관코드", "발신세관",
                    "신고번호", "신고일자", "발신자"]
            for i, key in enumerate(keys):
                result[key] = fields[i].strip() if i < len(fields) else ""

        # 행1: 품목 정보
        if len(data_rows) > 1 and not data_rows[1].startswith("data:"):
            fields = data_rows[1].split("^C^")
            if len(fields) >= 3:  # 최소 3필드 이상이어야 품목 정보
                keys = ["란규격번호", "분석란번호", "신고품명", "회보품명", "상표",
                        "모델규격", "신고세번", "결정세번", "물품설명"]
                for i, key in enumerate(keys):
                    result[key] = fields[i].strip() if i < len(fields) else ""

        # 행2: 분류의견 + 시료처리방법 + 손실보상안내
        if len(data_rows) > 2 and not data_rows[2].startswith("data:"):
            fields = data_rows[2].split("^C^")
            if len(fields) >= 3:
                # 필드: [란규격번호, 분석란번호, 분류의견, 시료처리방법, 기타, 손실보상안내]
                result["분류의견"] = fields[2].strip() if len(fields) > 2 else ""
                시료처리방법 = fields[3].strip() if len(fields) > 3 else ""
                손실보상안내 = fields[5].strip() if len(fields) > 5 else ""

                # 화면에 표시되는 참고사항만 저장
                # (손실보상안내는 화면에 없으므로 저장하지 않음)
                ref_parts = []
                if 시료처리방법:
                    ref_parts.append(f"1. 시료반환여부 : {시료처리방법}")
                    ref_parts.append("2. 기타")
                result["참고사항"] = "\n".join(ref_parts)

        # 행3 이후: 2페이지 추가 참고사항 데이터
        extra_parts = []
        for row in data_rows[3:]:
            if row.startswith("data:"):  # base64 이미지 스킵
                continue
            fields = row.split("^C^")
            for f in fields:
                f = f.strip()
                if f and not f.startswith("data:") and len(f) > 1:
                    extra_parts.append(f)

        if extra_parts:
            existing = result.get("참고사항", "")
            extra_text = "\n".join(extra_parts)
            result["참고사항"] = (existing + "\n" + extra_text).strip() if existing else extra_text

        if result:
            return result

    # HTML 텍스트 폴백: 참고사항 직접 탐색
    try:
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(separator="\n")

        # 참고사항 추출
        ref_match = re.search(r'참\s*고\s*사\s*항[\s:：]*(.*?)(?=\n\n|\Z)', text, re.DOTALL)
        if ref_match:
            result["참고사항"] = ref_match.group(1).strip()

        # 테이블 파싱
        for table in soup.find_all("table"):
            for row in table.find_all("tr"):
                ths = row.find_all("th")
                tds = row.find_all("td")
                if ths and tds:
                    for th, td in zip(ths, tds):
                        key = th.get_text(strip=True)
                        value = td.get_text(strip=True)
                        if key:
                            result[key] = value
        if len(result) > 1:
            return result
    except Exception:
        pass

    return None


# ── main.py 호환 래퍼 함수 ──────────────────────────────────────────────────

def crawl_customs_id(
    driver: webdriver.Chrome,
    customs_id: str,
    page_size: int = DEFAULT_PAGE_SIZE,
    delay: float = 1.0,
    debug_mode: bool = False,
    page_range: Optional[str] = None,
    pages: Optional[str] = None,
) -> list:
    """
    main.py에서 호출하는 통합 크롤링 함수.

    1. fetch_analysis_list()로 선택한 페이지의 '분석실 완료' 목록 수집
    2. 각 항목의 신고번호 링크 클릭 → 상세 페이지 → 분석결과안내문 수집
    """
    logger.info(f"[{customs_id}] crawl_customs_id 시작")

    # 1단계: '분석실 완료' 목록 수집
    items = fetch_analysis_list(
        driver=driver,
        customs_id=customs_id,
        page_size=page_size,
        debug_mode=debug_mode,
        page_range=page_range,
        pages=pages,
    )

    if not items:
        logger.info(f"[{customs_id}] '분석실 완료' 항목 없음")
        return []

    logger.info(f"[{customs_id}] '분석실 완료' {len(items)}건 → 상세 데이터 수집 시작")

    # 2단계: 목록 페이지로 돌아가서 각 신고번호 클릭
    # 1페이지부터 다시 시작
    if not _navigate_to_analysis_menu(driver, customs_id, debug_mode):
        logger.error(f"[{customs_id}] 상세 수집을 위한 목록 페이지 재이동 실패")
        # 목록 데이터만 반환
        for item in items:
            item["통관고유부호"] = customs_id
            item["크롤링상태"] = "목록만수집"
        return items

    if not _input_customs_id_and_search(driver, customs_id):
        for item in items:
            item["통관고유부호"] = customs_id
            item["크롤링상태"] = "목록만수집"
        return items

    # 페이지 이동 JS 함수 재탐지
    page_js_func = _detect_page_js_function(driver, customs_id)

    results = []
    current_page = 1

    for i, item in enumerate(items, start=1):
        신고번호 = item.get("신고번호", "")
        item_page = item.get("_page", 1)  # 해당 항목이 속한 페이지 번호
        row_idx = item.get("_row_index", 0)

        logger.info(f"[{customs_id}] [{i}/{len(items)}] 상세 수집: {신고번호} (페이지 {item_page}, 행 {row_idx})")

        # 해당 항목의 페이지로 이동 (필요한 경우)
        if item_page != current_page:
            if not _go_to_page(driver, item_page, customs_id, page_js_func):
                logger.warning(f"[{customs_id}] 페이지 {item_page} 이동 실패, 목록 데이터만 저장")
                item["통관고유부호"] = customs_id
                item["크롤링상태"] = "페이지이동실패"
                results.append(item)
                continue
            current_page = item_page
            time.sleep(1.5)

        try:
            doc = fetch_result_by_clicking(
                driver=driver,
                item=item,
                customs_id=customs_id,
                debug_mode=debug_mode,
            )

            if doc:
                merged = {**item, **doc}
                merged["통관고유부호"] = customs_id
                merged["크롤링상태"] = "성공" if len(doc) > 1 else "anayNo만추출"
                results.append(merged)
                logger.info(f"[{customs_id}] [{i}] 성공: {신고번호} (anayNo={doc.get('anay_no', '')})")
            else:
                item["통관고유부호"] = customs_id
                item["크롤링상태"] = "상세수집실패"
                results.append(item)
                logger.warning(f"[{customs_id}] [{i}] 상세 수집 실패: {신고번호}")

        except Exception as e:
            logger.error(f"[{customs_id}] [{i}] 오류: {e}")
            item["통관고유부호"] = customs_id
            item["크롤링상태"] = f"오류: {str(e)[:50]}"
            results.append(item)

        if delay > 0 and i < len(items):
            time.sleep(delay)

    success_count = sum(1 for r in results if r.get("크롤링상태") == "성공")
    logger.info(
        f"[{customs_id}] crawl_customs_id 완료: "
        f"총 {len(results)}건 (성공: {success_count}건)"
    )
    return results
