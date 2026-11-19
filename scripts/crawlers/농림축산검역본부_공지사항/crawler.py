#!/usr/bin/env python3
r"""농림축산검역본부(동물검역본부) 알림마당 · 공지사항 크롤러.

주요 기능
  1) 페이지 범위 지정 수집 (--from-page / --to-page, --all, --latest N)
  2) 수집 이력(SQLite) 기반 중복 차단 — 재실행 시 이미 받은 글은 건너뜀
  3) 첨부파일 다운로드 (게시판명 하위 폴더에 저장)
  4) 본문 마크다운/HTML 저장, 실행별 신규 수집 CSV 리포트

사용 예
  python3 crawler.py                       # 1페이지(최신 10건)만 확인
  python3 crawler.py -f 1 -t 5             # 1~5페이지
  python3 crawler.py --all                 # 전체 페이지
  python3 crawler.py --latest 3            # 최신 3페이지
  python3 crawler.py --list-history 20     # 최근 수집 이력 보기
  python3 crawler.py --export xlsx         # 누적 이력 엑셀 내보내기

저장 위치(기본)
  · 이력 DB  : D:\SQLiteDB\smart_law_ai.db
  · 다운로드 : C:\SQLiteDB\downloads
"""

from __future__ import annotations

import argparse
import logging
import sqlite3
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from qia_crawler import __version__
from qia_crawler.config import (
    BOARD_NAME,
    BOARD_TYPE,
    Settings,
    default_db_path,
    default_download_dir,
)
from qia_crawler.downloader import download_attachment
from qia_crawler.history import History
from qia_crawler.http_client import HttpClient
from qia_crawler.parser import ListItem, parse_detail, parse_list
from qia_crawler.utils import now_kst, short_title, stamp
from qia_crawler.writer import (
    export_history_csv,
    export_history_xlsx,
    save_body_files,
    write_run_report,
)

log = logging.getLogger("qia")


# ---------------------------------------------------------------------------
# 로깅
# ---------------------------------------------------------------------------
def setup_logging(settings: Settings, verbose: bool = False) -> Path:
    settings.log_dir.mkdir(parents=True, exist_ok=True)
    log_path = settings.log_dir / f"crawl_{stamp('%Y%m%d')}.log"

    root = logging.getLogger()
    root.setLevel(logging.DEBUG)
    root.handlers.clear()

    console = logging.StreamHandler(sys.stdout)
    console.setLevel(logging.DEBUG if verbose else logging.INFO)
    console.setFormatter(logging.Formatter("%(message)s"))
    root.addHandler(console)

    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    root.addHandler(file_handler)
    return log_path


# ---------------------------------------------------------------------------
# 크롤러
# ---------------------------------------------------------------------------
class QiaNoticeCrawler:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = HttpClient(
            timeout=settings.timeout,
            retries=settings.retries,
            delay=settings.delay,
        )
        self.history = History(settings.history_db, settings.board_type)
        self.stats = {
            "pages": 0,
            "listed": 0,
            "new_posts": 0,
            "skipped_known": 0,
            "skipped_dup": 0,
            "downloaded": 0,
            "failed": 0,
        }
        self.new_rows: list[dict] = []

    # ------------------------------------------------------------------
    def close(self) -> None:
        self.client.close()
        self.history.close()

    def run(self) -> dict:
        s = self.settings
        s.ensure_dirs()
        started = now_kst()
        run_id = self.history.start_run(s.from_page, s.to_page)

        log.info("")
        log.info("=" * 74)
        log.info(" 농림축산검역본부 %s 크롤링 시작 · %s", s.board_name, started.strftime("%Y-%m-%d %H:%M:%S"))
        log.info(" 요청 범위: %d ~ %d 페이지 (페이지당 10건)", s.from_page, s.to_page)
        log.info(" 다운로드 : %s", s.download_dir.resolve())
        log.info(" 저장 위치: %s", s.board_dir.resolve())
        log.info(" 이력 DB  : %s (기수집 %d건)", s.history_db.resolve(), self.history.count())
        log.info("=" * 74)

        current_page = s.from_page
        total_pages: int | None = None

        while current_page <= s.to_page and self.stats["pages"] < s.max_pages:
            try:
                html = self.client.get_text(s.list_url(current_page), referer=s.list_url(1))
            except Exception as exc:  # noqa: BLE001
                self.stats["failed"] += 1
                log.error(" [오류] %d페이지 목록 요청 실패: %s", current_page, exc)
                current_page += 1
                continue

            items, page_total = parse_list(html, current_page)
            if page_total:
                total_pages = page_total

            if not items:
                log.info(" %d페이지: 게시글 없음 → 수집 종료", current_page)
                break

            if page_total and s.to_page > total_pages:  # type: ignore[operator]
                log.info(" 요청한 마지막 페이지가 전체(%d쪽)를 넘어 자동 조정합니다.", total_pages)
                self.settings.to_page = total_pages
                self.history.conn.execute(
                    "UPDATE runs SET to_page = ? WHERE run_id = ?", (total_pages, run_id)
                )
                self.history.conn.commit()

            self.stats["pages"] += 1
            page_new = self._process_page(current_page, items)
            log.info(
                " %d페이지 처리 완료 · 게시글 %d건 (신규 %d / 기수집 %d)",
                current_page,
                len(items),
                page_new,
                len(items) - page_new,
            )

            if s.stop_on_known and page_new == 0:
                log.info(" 이미 수집한 글만 있는 페이지 → 조기 종료(--stop-on-known)")
                break

            current_page += 1

        # 결과 리포트
        report_path = None
        if self.stats["new_posts"] and not s.dry_run:
            report_path = s.report_dir / f"{stamp()}_신규수집_{s.from_page}-{s.to_page}p.csv"
            write_run_report(self.new_rows, report_path)

        self.history.finish_run(run_id, report_path=str(report_path) if report_path else None, **self.stats)
        elapsed = (now_kst() - started).total_seconds()
        self._print_summary(report_path, elapsed)

        result = dict(self.stats)
        result["report_path"] = str(report_path) if report_path else None
        result["elapsed"] = elapsed
        return result

    # ------------------------------------------------------------------
    def _process_page(self, page: int, items: list[ListItem]) -> int:
        s = self.settings
        candidates: list[ListItem] = []
        preview_count = 0

        for item in items:
            self.stats["listed"] += 1

            # 1차: 게시글 ID 이력 확인
            if not s.force and self.history.is_known(item.post_id):
                self.stats["skipped_known"] += 1
                log.debug("   - 기수집: [%s] %s", item.post_id, item.title)
                continue

            # 2차: 제목+등록일 기준 내용 중복 확인
            if s.content_dedupe and self.history.is_duplicate_content(item.title, item.posted_date):
                self.stats["skipped_dup"] += 1
                log.info("   = 내용 중복 건너뜀: [%s] %s (%s)", item.post_id, item.title, item.posted_date)
                continue

            if s.dry_run:
                log.info("   + [신규] %s · %s (%s, 첨부 %s)",
                         item.post_id, item.title, item.posted_date,
                         "있음" if item.has_attachment else "없음")
                self.stats["new_posts"] += 1
                preview_count += 1
                continue

            candidates.append(item)

        if s.dry_run or not candidates:
            return preview_count

        # 상세 수집(요청이 느린 사이트이므로 --workers 로 병렬 처리)
        if s.workers > 1 and len(candidates) > 1:
            with ThreadPoolExecutor(max_workers=s.workers) as pool:
                records = list(pool.map(lambda it: self._fetch_one(it, page), candidates))
        else:
            records = [self._fetch_one(item, page) for item in candidates]

        new_count = 0
        for item, record in zip(candidates, records):
            if record and self._store(record, item):
                new_count += 1
        return new_count

    # ------------------------------------------------------------------
    def _fetch_one(self, item: ListItem, page: int) -> dict | None:
        """상세 페이지 수집: 본문 파싱 → 첨부 다운로드 → 본문 파일 저장."""
        s = self.settings
        log.info("   + 수집: [%s] %s (%s)", item.post_id, item.title, item.posted_date)

        try:
            html = self.client.get_text(item.url, referer=s.list_url(page))
        except Exception as exc:  # noqa: BLE001
            log.error("     ! 상세 요청 실패: %s (%s)", item.url, exc)
            return {"item": item, "error": str(exc), "failed": 0, "downloaded": 0}

        detail = parse_detail(html, item.post_id, item.url)
        detail.title = detail.title or item.title
        detail.writer = detail.writer or item.writer
        detail.posted_date = detail.posted_date or item.posted_date
        detail.views = detail.views or item.views

        # 첨부파일 다운로드 (게시판명 > 첨부파일 > 날짜_ID_제목 폴더)
        folder = None
        downloaded = 0
        failed = 0
        if s.download_attachments and detail.attachments:
            folder = s.attach_dir / (
                f"{detail.posted_date or '날짜없음'}_{detail.post_id}_{short_title(detail.title, 40)}"
            )
            for attachment in detail.attachments:
                download_attachment(
                    self.client,
                    attachment,
                    folder,
                    referer=item.url,
                    force=s.force,
                )
                if attachment.status == "failed":
                    failed += 1
                elif attachment.status in ("downloaded", "exists"):
                    downloaded += 1

        # 본문 저장(첨부 경로가 마크다운에 기록되므로 다운로드 이후에 저장)
        body_path = None
        raw_path = None
        if s.save_body:
            md_path, html_path = save_body_files(detail, s.body_dir)
            body_path, raw_path = str(md_path), str(html_path)

        return {
            "item": item,
            "detail": detail,
            "body_path": body_path,
            "raw_path": raw_path,
            "folder": folder,
            "downloaded": downloaded,
            "failed": failed,
        }

    # ------------------------------------------------------------------
    def _store(self, record: dict, item: ListItem) -> bool:
        """수집 결과를 이력 DB/리포트에 반영한다(메인 스레드 전용)."""
        s = self.settings
        self.stats["downloaded"] += record.get("downloaded", 0)
        self.stats["failed"] += record.get("failed", 0)

        detail = record.get("detail")
        if detail is None or record.get("error"):
            self.stats["failed"] += 1
            return False

        # 이력 저장 (내용 해시 유니크 제약으로 2차 중복 방지)
        try:
            self.history.save(
                detail,
                board_type=s.board_type,
                board_no=item.no,
                body_path=record.get("body_path"),
                raw_path=record.get("raw_path"),
            )
        except sqlite3.IntegrityError:
            self.stats["skipped_dup"] += 1
            log.info("   = 내용 중복(DB 제약) 건너뜀: [%s] %s", item.post_id, detail.title)
            return False

        self.stats["new_posts"] += 1
        folder = record.get("folder")
        self.new_rows.append(
            {
                "번호": item.no,
                "제목": detail.title,
                "담당부서": detail.dept,
                "작성자": detail.writer,
                "등록일": detail.posted_date,
                "조회수": detail.views,
                "첨부수": len(detail.attachments),
                "첨부파일": ", ".join(a.name for a in detail.attachments),
                "원문URL": detail.url,
                "본문파일": record.get("body_path") or "",
                "첨부폴더": str(folder) if folder else "",
                "수집시각": now_kst().strftime("%Y-%m-%d %H:%M:%S"),
            }
        )
        log.info(
            "     · 본문 %d자 · 첨부 %d개 저장",
            len(detail.body_text or ""),
            len(detail.attachments),
        )
        return True

    # ------------------------------------------------------------------
    def _print_summary(self, report_path: Path | None, elapsed: float) -> None:
        s = self.settings
        st = self.stats
        log.info("")
        log.info("-" * 74)
        if s.dry_run:
            log.info(" [미리보기] 실제 저장/다운로드는 수행하지 않았습니다.")
        log.info(" 수집 결과 요약")
        log.info("   · 처리 페이지      : %d", st["pages"])
        log.info("   · 확인한 게시글    : %d", st["listed"])
        log.info("   · %s        : %d", "신규 예정" if s.dry_run else "신규 수집", st["new_posts"])
        log.info("   · 기수집 건너뜀    : %d", st["skipped_known"])
        log.info("   · 내용 중복 건너뜀 : %d", st["skipped_dup"])
        if s.download_attachments:
            log.info("   · 첨부파일 처리    : %d", st["downloaded"])
        log.info("   · 실패             : %d", st["failed"])
        log.info("   · 소요 시간        : %.1f초", elapsed)
        if report_path:
            log.info("   · 리포트           : %s", report_path)
        log.info("   · 누적 수집 건수   : %d", self.history.count())
        log.info("-" * 74)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="crawler.py",
        description="농림축산검역본부(동물검역본부) 공지사항 크롤러 (페이지 범위 지정 · 이력 관리 · 첨부 다운로드)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "예시:\n"
            "  python3 crawler.py                        # 1페이지만\n"
            "  python3 crawler.py -f 1 -t 10             # 1~10페이지\n"
            "  python3 crawler.py --all                  # 전체 페이지\n"
            "  python3 crawler.py --latest 3             # 최신 3페이지\n"
            "  python3 crawler.py --list-history         # 수집 이력 확인\n"
            "  python3 crawler.py --export xlsx          # 누적 이력 엑셀 저장\n"
        ),
    )
    parser.add_argument("-f", "--from-page", type=int, default=1, help="시작 페이지 (기본 1)")
    parser.add_argument("-t", "--to-page", type=int, default=None, help="마지막 페이지 (기본: 시작 페이지와 동일)")
    parser.add_argument("-a", "--all", action="store_true", help="전체 페이지 수집")
    parser.add_argument("-n", "--latest", type=int, default=None, help="최신 N페이지만 수집")
    parser.add_argument("--type", dest="board_type", default=BOARD_TYPE, help=f"게시판 구분값 (기본 {BOARD_TYPE})")
    parser.add_argument("--board-name", default=BOARD_NAME, help="저장 하위 폴더명 (기본: 공지사항)")

    parser.add_argument(
        "-d", "--downloads", default=str(default_download_dir()),
        help=r"본문·첨부 다운로드 폴더 (기본 C:\SQLiteDB\downloads)"
    )
    parser.add_argument(
        "--db", default=str(default_db_path()),
        help=r"이력 DB 파일 경로 (기본 D:\SQLiteDB\smart_law_ai.db)"
    )

    parser.add_argument("--delay", type=float, default=1.0, help="요청 간 대기 초 (기본 1.0)")
    parser.add_argument("--timeout", type=float, default=20.0, help="요청 타임아웃 초 (기본 20)")
    parser.add_argument("--retries", type=int, default=3, help="재시도 횟수 (기본 3)")
    parser.add_argument("--workers", type=int, default=3, help="상세 페이지 동시 수집 수 (기본 3, 1이면 순차)")

    parser.add_argument("--no-attachments", action="store_true", help="첨부파일 다운로드하지 않음")
    parser.add_argument("--no-body", action="store_true", help="본문 파일 저장하지 않음")
    parser.add_argument("--force", action="store_true", help="이력 무시하고 다시 수집(첨부도 재다운로드)")
    parser.add_argument("--no-content-dedupe", action="store_true", help="제목+등록일 내용 중복 검사 해제")
    parser.add_argument("--stop-on-known", action="store_true", help="이미 아는 글만 있는 페이지에서 중단")
    parser.add_argument("--dry-run", action="store_true", help="저장 없이 신규 글 목록만 확인")
    parser.add_argument("--reset-history", action="store_true", help="수집 이력 초기화")
    parser.add_argument("--yes", action="store_true", help="확인 프롬프트 생략")
    parser.add_argument("--list-history", nargs="?", const=20, type=int, metavar="N", help="최근 N건 이력 출력(기본 20)")
    parser.add_argument("--export", choices=["csv", "xlsx", "all"], help="누적 이력을 파일로 내보내기")
    parser.add_argument("--max-pages", type=int, default=2000, help="안전장치: 최대 처리 페이지")
    parser.add_argument("-v", "--verbose", action="store_true", help="상세 로그")
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    settings = Settings(
        board_type=args.board_type,
        board_name=args.board_name,
        download_dir=Path(args.downloads),
        db_path=Path(args.db),
        delay=args.delay,
        timeout=args.timeout,
        retries=args.retries,
        workers=max(1, args.workers),
        download_attachments=not args.no_attachments,
        save_body=not args.no_body,
        force=args.force,
        content_dedupe=not args.no_content_dedupe,
        stop_on_known=args.stop_on_known,
        dry_run=args.dry_run,
        max_pages=args.max_pages,
    )
    settings.ensure_dirs()
    setup_logging(settings, args.verbose)

    # ---------------- 이력 초기화 ----------------
    if args.reset_history:
        if not args.yes:
            answer = input("수집 이력을 모두 삭제합니다. 계속할까요? [y/N] ").strip().lower()
            if answer not in ("y", "yes"):
                print("취소했습니다.")
                return 1
        with History(settings.history_db, settings.board_type) as history:
            history.reset()
        log.info("이력을 초기화했습니다: %s", settings.history_db)
        # 이력 초기화만 요청한 경우에는 크롤링을 이어서 수행하지 않는다.
        crawl_intent = bool(args.all or args.latest or args.to_page is not None or args.from_page != 1)
        if not (args.list_history or args.export or crawl_intent):
            return 0

    # ---------------- 이력 조회 ----------------
    if args.list_history:
        with History(settings.history_db, settings.board_type) as history:
            rows = history.recent(args.list_history)
            print(f"\n최근 수집 이력 {len(rows)}건 (전체 {history.count()}건) · DB: {settings.history_db}\n")
            if not rows:
                print("  수집 이력이 없습니다.")
            for row in rows:
                print(
                    f"  [{row['post_id']:>6}] {row['posted_date']} · {row['title'][:60]}"
                    f"  (첨부 {row['attachment_count']}개)"
                )
            print()
        return 0

    # ---------------- 내보내기 ----------------
    if args.export:
        with History(settings.history_db, settings.board_type) as history:
            posts = history.all_posts()
        if not posts:
            print("내보낼 이력이 없습니다.")
            return 1
        targets: list[Path] = []
        base = settings.report_dir / f"{stamp()}_수집이력전체"
        if args.export in ("csv", "all"):
            targets.append(export_history_csv(posts, base.with_suffix(".csv")))
        if args.export in ("xlsx", "all"):
            targets.append(export_history_xlsx(posts, base.with_suffix(".xlsx")))
        print(f"\n{len(posts)}건을 내보냈습니다.")
        for path in targets:
            print(f"  · {path}")
        return 0

    # ---------------- 페이지 범위 결정 ----------------
    if args.all:
        settings.from_page, settings.to_page = 1, args.max_pages
    elif args.latest:
        settings.from_page, settings.to_page = 1, args.latest
    else:
        settings.from_page = max(1, args.from_page)
        settings.to_page = args.to_page if args.to_page is not None else settings.from_page

    if settings.to_page < settings.from_page:
        print("오류: 마지막 페이지(--to-page)가 시작 페이지(--from-page)보다 작습니다.")
        return 2

    crawler = QiaNoticeCrawler(settings)
    try:
        crawler.run()
    except KeyboardInterrupt:
        log.warning("\n사용자 중단(Ctrl+C). 지금까지 수집한 내용은 이력에 저장되어 있습니다.")
        return 130
    finally:
        crawler.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
