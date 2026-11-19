"""
main.py
유니패스 분석진행사항 크롤링 메인 실행 스크립트

사용법:
  python main.py                      # 기본 실행 (config.json의 모든 계정 처리)
  python main.py --account 본사       # 특정 account_id만 처리
  python main.py --page-size 50       # 페이지당 50건씩 조회
  python main.py --page-range 3-10    # 3~10페이지만 크롤링
  python main.py --pages 1,3,7        # 지정한 페이지만 크롤링
  python main.py --export-db          # DB 데이터를 엑셀로 내보내기만 수행
  python main.py --customs-id XXX     # 특정 통관고유부호만 처리
  python main.py --debug              # 디버그 모드 (HTML을 debug_output/ 폴더에 저장)

실행 흐름 (계정별 반복):
  1. config.json 로드
  2. accounts 배열에서 처리할 계정 목록 결정
  3. 계정별로:
     a. Chrome 브라우저 열기
     b. 공인인증서 자동 로그인 (pywinauto) 또는 수동 로그인 대기
     c. 해당 계정의 customs_ids 크롤링
     d. 결과를 엑셀 + SQLite에 저장
     e. 브라우저 종료
  4. 다음 계정으로 반복
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

from session_manager import get_authenticated_driver
from crawler import (
    crawl_customs_id,
    DEFAULT_PAGE_SIZE,
    TARGET_STATUS,
    PageSelectionError,
    describe_page_selection,
    validate_page_selection_syntax,
)
from saver import (
    load_customs_ids_from_excel,
    init_db,
    save_to_db,
    save_to_excel,
    export_db_to_excel,
)


# ── 로깅 설정 ───────────────────────────────────────────────────────────────
def setup_logging(log_dir: str = "logs", debug: bool = False):
    Path(log_dir).mkdir(exist_ok=True)
    log_file = Path(log_dir) / f"crawl_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

    level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s,%(msecs)03d [%(levelname)s] %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )
    return log_file


def load_config(config_path: str = "config.json") -> dict:
    if not Path(config_path).exists():
        print(f"[오류] 설정 파일 없음: {config_path}")
        sys.exit(1)
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


def resolve_db_path(settings: dict, output_dir: str) -> str:
    db_path = settings.get("db_path", "")
    if db_path:
        db_dir = os.path.dirname(db_path)
        if db_dir:
            Path(db_dir).mkdir(parents=True, exist_ok=True)
        return db_path
    return os.path.join(output_dir, "unipass_results.db")


def get_customs_list_for_account(input_excel: str) -> list:
    """
    customs_ids.xlsx 파일에서 통관고유부호 목록을 읽어 반환합니다.
    """
    if Path(input_excel).exists():
        return load_customs_ids_from_excel(input_excel)
    return []


# ── 메인 ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="유니패스 분석진행사항 크롤링 프로그램",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
예시:
  python main.py                        기본 실행 (모든 계정 처리)
  python main.py --account 본사         본사 계정만 처리
  python main.py --page-size 50         페이지당 50건씩 조회
  python main.py --page-range 3-10      3~10페이지만 크롤링
  python main.py --pages 1,3,7          1·3·7페이지만 크롤링
  python main.py --customs-id 한국쓰리엠1771019   특정 통관고유부호만 처리
  python main.py --export-db            DB 전체 데이터를 엑셀로 내보내기
  python main.py --debug                HTML을 debug_output/ 폴더에 저장
        """
    )
    parser.add_argument("--page-size",   type=int, default=DEFAULT_PAGE_SIZE)
    page_selection_group = parser.add_mutually_exclusive_group()
    page_selection_group.add_argument(
        "--page-range",
        type=str,
        default="",
        metavar="FROM-TO",
        help="연속 페이지 범위만 수집 (예: 3-10)",
    )
    page_selection_group.add_argument(
        "--pages",
        type=str,
        default="",
        metavar="PAGE[,PAGE...]",
        help="지정 페이지들만 수집 (예: 1,3,7)",
    )
    parser.add_argument("--export-db",   action="store_true")
    parser.add_argument("--customs-id",  type=str, default="")
    parser.add_argument("--account",     type=str, default="",
                        help="처리할 account_id (미지정 시 모든 계정 처리)")
    parser.add_argument("--config",      type=str, default="config.json")
    parser.add_argument("--input-excel", type=str, default="customs_ids.xlsx")
    parser.add_argument("--debug",       action="store_true")
    args = parser.parse_args()

    try:
        validate_page_selection_syntax(args.page_range, args.pages)
    except PageSelectionError as e:
        parser.error(str(e))

    log_file = setup_logging(debug=args.debug)
    logger   = logging.getLogger("main")

    print("\n" + "=" * 62)
    print("  유니패스 분석진행사항 크롤링 프로그램 v14")
    print("=" * 62)

    config       = load_config(args.config)
    settings     = config.get("settings", {})
    output_dir   = settings.get("output_dir", "output")
    output_excel = settings.get("output_excel", "분석결과_크롤링.xlsx")
    delay        = float(settings.get("request_delay_seconds", 1.0))
    page_size    = args.page_size
    debug_mode   = args.debug or settings.get("debug_mode", False)

    db_path    = resolve_db_path(settings, output_dir)
    excel_path = os.path.join(output_dir, output_excel)

    Path(output_dir).mkdir(exist_ok=True)

    print(f"  DB 경로: {db_path}")
    print(f"  엑셀 경로: {excel_path}")
    print(f"  수집 페이지: {describe_page_selection(args.page_range, args.pages)}")
    if debug_mode:
        print("  [디버그 모드] HTML이 debug_output/ 폴더에 저장됩니다.")

    conn = init_db(db_path)

    # DB 내보내기 모드
    if args.export_db:
        export_path = os.path.join(
            output_dir, f"전체결과_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
        )
        export_db_to_excel(db_path, export_path)
        print(f"\n  [완료] DB 내보내기: {export_path}")
        conn.close()
        return

    # 처리할 계정 목록 결정
    all_accounts = config.get("accounts", [])
    if not all_accounts:
        print("\n  [오류] config.json에 accounts가 없습니다.")
        conn.close()
        return

    # --account 옵션으로 특정 계정만 처리
    if args.account:
        target_accounts = [a for a in all_accounts if a.get("account_id") == args.account]
        if not target_accounts:
            print(f"\n  [오류] account_id '{args.account}'를 찾을 수 없습니다.")
            available = [a.get("account_id", "?") for a in all_accounts]
            print(f"  사용 가능한 account_id: {available}")
            conn.close()
            return
    else:
        target_accounts = all_accounts

    print(f"\n  처리할 계정: {len(target_accounts)}개")
    for acc in target_accounts:
        print(f"    - {acc.get('account_id', '?')}  ({acc.get('company_name', '')})")

    # --customs-id 옵션: 단일 통관고유부호 처리 (첫 번째 계정 사용)
    if args.customs_id:
        target_accounts = [target_accounts[0]]
        override_customs = [{"통관고유부호": args.customs_id, "회사명": ""}]
    else:
        override_customs = None

    # ── 계정별 크롤링 ────────────────────────────────────────────────────────
    all_results = []
    start_time  = datetime.now()

    for acc_idx, account in enumerate(target_accounts, start=1):
        account_id   = account.get("account_id", f"계정{acc_idx}")
        company_name = account.get("company_name", "")

        print(f"\n{'=' * 62}")
        print(f"  [{acc_idx}/{len(target_accounts)}] 계정: {account_id}"
              + (f"  ({company_name})" if company_name else ""))
        print(f"{'=' * 62}")

        # 이 계정의 설정으로 config 임시 구성 (session_manager가 accounts[0] 참조)
        account_config = {
            "accounts": [account],
            "settings": settings,
        }

        # 브라우저 열기 → 공인인증서 자동/수동 로그인 (통관고유부호 읽기보다 먼저)
        print(f"\n  브라우저를 열겠습니다...")
        driver = get_authenticated_driver(account_config)

        if not driver:
            print(f"\n  [오류] '{account_id}' 로그인 실패. 다음 계정으로 넘어갑니다.")
            continue

        print(f"  세션 획득 완료.")

        # 로그인 완료 후 통관고유부호 목록 읽기
        if override_customs:
            customs_list = override_customs
        else:
            customs_list = get_customs_list_for_account(args.input_excel)

        if not customs_list:
            print(f"  [경고] '{account_id}' 계정에 처리할 통관고유부호가 없습니다. (customs_ids.xlsx 확인 필요)")
            try:
                driver.quit()
            except Exception:
                pass
            continue

        print(f"  처리할 통관고유부호: {len(customs_list)}개")
        for item in customs_list:
            cid     = item["통관고유부호"]
            company = item.get("회사명", "")
        print(f"    - {cid}" + (f"  ({company})" if company else ""))
        print(f"  페이지당 조회 건수: {page_size}건")
        print(f"  수집 페이지: {describe_page_selection(args.page_range, args.pages)}")
        print(f"  크롤링을 시작합니다.\n")

        # 크롤링 실행
        account_results = []
        total_customs   = len(customs_list)

        try:
            for idx, item in enumerate(customs_list, start=1):
                customs_id = item["통관고유부호"]
                company    = item.get("회사명", "")

                print(f"\n  [{idx}/{total_customs}] {customs_id}"
                      + (f"  ({company})" if company else ""))
                print(f"  {'─' * 50}")

                try:
                    results = crawl_customs_id(
                        driver,
                        customs_id,
                        page_size=page_size,
                        delay=delay,
                        debug_mode=debug_mode,
                        page_range=args.page_range,
                        pages=args.pages,
                    )
                    account_results.extend(results)

                    if results:
                        inserted, skipped = save_to_db(conn, results)
                        success_cnt = sum(1 for r in results if r.get("크롤링상태") == "성공")
                        fail_cnt    = len(results) - success_cnt
                        print(f"\n  결과: 총 {len(results)}건 수집 "
                              f"(성공: {success_cnt}, 실패: {fail_cnt})")
                        print(f"  DB: 신규 {inserted}건 저장, 중복 {skipped}건 스킵")
                    else:
                        print(f"\n  결과: '{TARGET_STATUS}' 건 없음")

                except Exception as e:
                    logger.error(f"[{customs_id}] 크롤링 중 예외: {e}", exc_info=True)
                    print(f"\n  [오류] {e}")

        finally:
            try:
                driver.quit()
                logger.info(f"[{account_id}] 브라우저 종료")
            except Exception:
                pass

        all_results.extend(account_results)
        print(f"\n  [{account_id}] 수집 완료: {len(account_results)}건")

    # 최종 결과 저장
    elapsed = (datetime.now() - start_time).total_seconds()
    print(f"\n{'=' * 62}")
    print(f"  전체 크롤링 완료!")
    print(f"  총 수집 건수: {len(all_results)}건")
    print(f"  소요 시간: {elapsed:.1f}초")

    if all_results:
        save_to_excel(all_results, excel_path)
        print(f"  SQLite DB: {db_path}")
        print(f"  엑셀 파일: {excel_path}")
    else:
        print("  수집된 데이터가 없습니다.")
        if debug_mode:
            print("  [디버그] debug_output/ 폴더의 list_p1_*.txt 파일을 확인하세요.")

    print(f"  로그 파일: {log_file}")
    print(f"{'=' * 62}\n")

    conn.close()


if __name__ == "__main__":
    main()
