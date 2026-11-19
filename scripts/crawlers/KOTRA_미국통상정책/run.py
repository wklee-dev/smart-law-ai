from __future__ import annotations

import argparse
import configparser
import logging
import sys
import urllib.robotparser
from datetime import date, datetime
from pathlib import Path
from typing import Iterable, Optional, Tuple

import requests
from storage import Storage

DEFAULT_DB = r"D:\SQLiteDB\smart_law_ai.db"
DEFAULT_DOWNLOADS = r"C:\SQLiteDB\downloads\KOTRA\미국통상정책"
DEFAULT_LOGS = "logs"
ROBOTS_URL = "https://dream.kotra.or.kr/robots.txt"
SITE_URL = "https://dream.kotra.or.kr/"
USER_AGENT = "KOTRA-client/1.0"
_robots_parser = None


def robots_allowed(robots_url: str = ROBOTS_URL, site_url: str = SITE_URL, timeout: float = 10.0) -> Tuple[bool, str]:
    global _robots_parser
    _robots_parser = None
    parser = urllib.robotparser.RobotFileParser()
    try:
        response = requests.get(robots_url, timeout=timeout)
        response.raise_for_status()
        parser.parse(response.text.splitlines())
    except Exception as exc:
        return False, "robots.txt를 확인하지 못했습니다(안전상 수집 차단): " + str(exc)
    for path in ("/kotranews/cms/com/index.do", "/ajaxf/frNewsHotClip/getKotraBoardHotClipList.do", "/kotranews/cms/news/actionKotraBoardDetail.do"):
        if not parser.can_fetch(USER_AGENT, site_url.rstrip("/") + path):
            return False, "robots.txt가 필요한 수집 경로를 금지합니다: " + path
    _robots_parser = parser
    return True, "robots.txt가 해당 경로 수집을 허용합니다"


def parse_date(value: str) -> date:
    for fmt in ("%Y-%m-%d", "%Y%m%d"):
        try: return datetime.strptime(str(value).strip(), fmt).date()
        except ValueError: pass
    raise argparse.ArgumentTypeError("날짜는 YYYY-MM-DD 또는 YYYYMMDD 형식이어야 합니다")


def week_dates(year: int, week: int) -> Tuple[date, date]:
    try: start = date.fromisocalendar(year, week, 1)
    except ValueError as exc: raise argparse.ArgumentTypeError("올바르지 않은 ISO 연주차입니다") from exc
    return start, date.fromisocalendar(year, week, 7)


def load_config(path: str) -> configparser.ConfigParser:
    cfg = configparser.ConfigParser(); p = Path(path)
    if p.exists(): cfg.read(p, encoding="utf-8")
    return cfg


def setting(cfg: configparser.ConfigParser, section: str, key: str, default: str) -> str:
    return cfg.get(section, key, fallback=cfg.get("DEFAULT", key, fallback=default))


def make_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="KOTRA 미국통상정책 게시물을 수집해 SQLite에 저장합니다.")
    sub = p.add_subparsers(dest="command", required=True)
    c = sub.add_parser("crawl", help="게시물과 첨부파일 수집", description="페이지 또는 게시일 기간으로 KOTRA 미국통상정책을 수집합니다.")
    c.add_argument("pages", nargs="*", help="페이지 범위: 1 10, 1, 또는 all")
    c.add_argument("--year", type=int, help="ISO 주차의 연도"); c.add_argument("--week", type=int, help="ISO 주차(월요일부터 일요일)")
    c.add_argument("--start-date", type=parse_date, help="시작일(YYYYMMDD 또는 YYYY-MM-DD)"); c.add_argument("--end-date", type=parse_date, help="종료일(포함)")
    c.add_argument("--from", dest="from_page", type=int, help="시작 페이지"); c.add_argument("--to", dest="to_page", type=int, help="마지막 페이지(포함)")
    c.add_argument("--page", dest="page", type=int, help="단일 페이지"); c.add_argument("--db", help="SQLite DB 경로"); c.add_argument("--download-dir", help="첨부파일 폴더"); c.add_argument("--log-dir", help="로그 폴더")
    c.add_argument("--config", default="config.ini", help="설정 파일"); c.add_argument("--timeout", type=float, help="요청 시간제한(초)"); c.add_argument("--delay", type=float, help="요청 간격(초)"); c.add_argument("--retries", type=int, help="재시도 횟수")
    c.add_argument("--ignore-robots", action="store_true", help="사이트 운영자의 사전 허가가 있는 경우에만 정책 검사 생략")
    return p


def _valid_page(value: int) -> None:
    if value < 1: raise ValueError("페이지는 1 이상이어야 합니다")


def resolve_options(args: argparse.Namespace, cfg: configparser.ConfigParser) -> Tuple[Optional[date], Optional[date], Optional[Iterable[int]]]:
    if len(args.pages) > 2: raise ValueError("위치 페이지 인수는 최대 2개입니다")
    if args.pages and (args.from_page is not None or args.to_page is not None): raise ValueError("위치인자와 --from/--to를 혼용할 수 없습니다")
    if args.page is not None: _valid_page(args.page)
    if (args.year is None) != (args.week is None): raise ValueError("--year와 --week는 함께 지정해야 합니다")
    start, end = args.start_date, args.end_date
    if args.year is not None:
        if start or end: raise ValueError("연주차와 날짜 기간을 혼합할 수 없습니다")
        start, end = week_dates(args.year, args.week)
    if (start is None) != (end is None) or (start and end and start > end): raise ValueError("시작일과 종료일을 함께 지정하고 순서를 확인하십시오")
    if start is not None:
        if args.page is not None or (args.pages and not (len(args.pages) == 1 and args.pages[0].lower() == "all")) or args.from_page is not None or args.to_page is not None:
            raise ValueError("날짜 필터와 페이지 선택을 혼용할 수 없습니다")
        return start, end, None
    if args.page is not None:
        if args.pages or args.from_page is not None or args.to_page is not None: raise ValueError("--page는 다른 페이지 지정과 혼합할 수 없습니다")
        return None, None, [args.page]
    if args.from_page is not None or args.to_page is not None:
        lo = args.from_page if args.from_page is not None else args.to_page; hi = args.to_page if args.to_page is not None else args.from_page
        assert lo is not None and hi is not None; _valid_page(lo)
        if hi < lo: raise ValueError("페이지 범위가 올바르지 않습니다")
        return None, None, range(lo, hi + 1)
    if args.pages:
        if len(args.pages) == 1 and args.pages[0].lower() == "all": return None, None, None
        try: nums = [int(x) for x in args.pages]
        except ValueError as exc: raise ValueError("페이지는 숫자 또는 all이어야 합니다") from exc
        for n in nums: _valid_page(n)
        if len(nums) == 1: return None, None, [nums[0]]
        if nums[1] < nums[0]: raise ValueError("페이지 범위가 올바르지 않습니다")
        return None, None, range(nums[0], nums[1] + 1)
    lo = int(setting(cfg, "crawl", "start", "1")); end_text = setting(cfg, "crawl", "end", "1")
    _valid_page(lo)
    if end_text.lower() == "all": return None, None, None
    hi = int(end_text)
    if hi < lo: raise ValueError("config.ini의 start/end가 올바르지 않습니다")
    return None, None, range(lo, hi + 1)


def setup_logging(log_dir: str) -> logging.Logger:
    Path(log_dir).mkdir(parents=True, exist_ok=True); logger = logging.getLogger("kotra_crawler"); logger.setLevel(logging.INFO)
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
        handler.close()
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s"); sh = logging.StreamHandler(sys.stdout); sh.setFormatter(fmt); logger.addHandler(sh)
    fh = logging.FileHandler(Path(log_dir) / (date.today().isoformat() + ".log"), encoding="utf-8"); fh.setFormatter(fmt); logger.addHandler(fh); return logger


def _client_can_fetch(client: object, url: Optional[str], kind: str) -> None:
    if not url: return
    checker = getattr(client, "can_fetch", None)
    if checker is not None and not checker(url): raise PermissionError(f"robots.txt가 {kind} 경로를 차단했습니다: {url}")


def _validate_runtime(timeout: float, delay: float, retries: int) -> None:
    if timeout <= 0: raise ValueError("timeout은 0보다 커야 합니다")
    if delay < 0: raise ValueError("delay는 0 이상이어야 합니다")
    if retries < 0: raise ValueError("retries는 0 이상이어야 합니다")


def crawl(args: argparse.Namespace) -> int:
    cfg = load_config(args.config); start, end, pages = resolve_options(args, cfg)
    db_path = args.db or setting(cfg, "paths", "db", DEFAULT_DB); dl_dir = args.download_dir or setting(cfg, "paths", "download_dir", DEFAULT_DOWNLOADS); log_dir = args.log_dir or setting(cfg, "paths", "log_dir", DEFAULT_LOGS)
    timeout = args.timeout if args.timeout is not None else float(setting(cfg, "site", "timeout", "30")); delay = args.delay if args.delay is not None else float(setting(cfg, "site", "delay", "0.5")); retries = args.retries if args.retries is not None else int(setting(cfg, "site", "retries", "3")); _validate_runtime(timeout, delay, retries)
    logger = setup_logging(log_dir); logger.info("수집 시작: pages=%s date=%s..%s", "all" if pages is None else pages, start, end)
    if args.ignore_robots: logger.warning("경고: --ignore-robots는 사이트 운영자의 사전 허가가 있을 때만 사용하십시오.")
    else:
        allowed, reason = robots_allowed(timeout=timeout)
        if not allowed: logger.error("수집을 시작하지 않습니다: %s", reason); return 1
    try:
        from site_client import SiteClient
        client = SiteClient(timeout=timeout, delay=delay, retries=retries)
        if not args.ignore_robots and _robots_parser is not None:
            client.can_fetch = lambda url: _robots_parser.can_fetch(USER_AGENT, url)
    except Exception as exc:
        logger.error("사이트 모듈을 불러오지 못했습니다: %s", exc); return 1
    page_no = 1 if pages is None else (pages.start if isinstance(pages, range) else min(pages))
    last_page = None if pages is None else (pages.stop - 1 if isinstance(pages, range) else max(pages))
    pages_done = articles = article_failures = attachment_failures = 0
    with Storage(db_path, dl_dir) as store:
        run_id = store.start_run()
        try:
            while True:
                _client_can_fetch(client, SITE_URL + "ajaxf/frNewsHotClip/getKotraBoardHotClipList.do", "목록")
                try: result = client.get_list(page_no, start_date=start, end_date=end)
                except Exception:
                    logger.exception("목록 오류: page=%s", page_no); raise
                pages_done += 1; logger.info("페이지 처리: page=%s", page_no)
                for item in result.get("items", []) or []:
                    published = item.get("published_date")
                    if start and not published:
                        article_failures += 1; logger.error("날짜 필터 중 날짜 없는 목록 항목: article=%s", item.get("article_id")); continue
                    if start and not (start.isoformat() <= str(published) <= end.isoformat()): continue
                    try:
                        _client_can_fetch(client, item.get("url"), "상세")
                        detail = client.get_article(item); store.upsert_article(detail); articles += 1
                        aid = str(detail.get("article_id") or item.get("article_id"))
                        for att in detail.get("attachments", []) or []:
                            fid = str(att.get("file_id") or ""); url = att.get("url"); dest = store.attachment_path(aid, str(att.get("filename") or fid or "attachment"), file_id=fid or None, url=url)
                            try:
                                _client_can_fetch(client, url, "첨부"); client.download_attachment(att, dest); store.upsert_attachment(aid, att, str(dest), "downloaded")
                            except Exception as exc:
                                attachment_failures += 1; store.upsert_attachment(aid, att, str(dest), "failed", str(exc)); logger.exception("첨부파일 오류: article=%s file=%s", aid, fid or url)
                    except Exception:
                        article_failures += 1; logger.exception("기사 오류: article=%s", item.get("article_id")); continue
                if last_page is not None and page_no >= last_page: break
                if not result.get("has_next", False): break
                page_no += 1
            status = "failed" if article_failures or attachment_failures else "success"; logger.info("수집 완료 요약: pages=%s articles=%s article_errors=%s attachment_errors=%s", pages_done, articles, article_failures, attachment_failures)
            store.finish_run(run_id, status, pages_done, articles, attachment_failures, article_failures=article_failures)
            return 1 if article_failures or attachment_failures else 0
        except Exception as exc:
            logger.exception("목록 오류로 수집 중단"); store.finish_run(run_id, "failed", pages_done, articles, attachment_failures, str(exc), article_failures); return 1


def main(argv: Optional[list] = None) -> int:
    parser = make_parser(); args = parser.parse_args(argv)
    if args.command == "crawl":
        try:
            return crawl(args)
        except (ValueError, argparse.ArgumentTypeError) as exc:
            parser.error(str(exc))
        except KeyboardInterrupt:
            print("사용자가 수집을 중단했습니다.", file=sys.stderr)
            return 130
        except Exception as exc:
            logger = logging.getLogger("kotra_crawler")
            if logger.handlers:
                logger.exception("실행 오류: DB 또는 파일 경로, 권한을 확인하십시오")
            else:
                print(f"실행 오류: {exc}", file=sys.stderr)
            return 1
        finally:
            logger = logging.getLogger("kotra_crawler")
            for handler in logger.handlers[:]:
                logger.removeHandler(handler)
                handler.close()
    return 2

if __name__ == "__main__": sys.exit(main())
