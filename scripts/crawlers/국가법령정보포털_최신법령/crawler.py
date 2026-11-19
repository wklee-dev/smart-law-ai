#!/usr/bin/env python3
"""Excel-driven, target-by-target National Law Information Center crawler V1.0."""

import argparse
import json
import logging
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOG = logging.getLogger("lawcrawler")
DEFAULT_END_PAGE = 70
ALL_PAGE_CATEGORIES = frozenset({"temporary", "temporary_articles", "unconstitutional"})


def parse_pages(value):
    numbers = set()
    for part in value.split(","):
        part = part.strip()
        try:
            if "-" in part:
                first, last = map(int, part.split("-", 1))
                if first < 1 or last < first or last - first > 10000:
                    raise ValueError()
                numbers.update(range(first, last + 1))
            else:
                number = int(part)
                if number < 1:
                    raise ValueError()
                numbers.add(number)
        except ValueError as exc:
            raise argparse.ArgumentTypeError("번호는 1 또는 1-3,5 형식입니다.") from exc
    return sorted(numbers)


def positive_page(value):
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise argparse.ArgumentTypeError(
            "종료페이지는 1 이상의 정수여야 합니다."
        ) from exc
    if number < 1:
        raise argparse.ArgumentTypeError("종료페이지는 1 이상의 정수여야 합니다.")
    return number


def cli_parser():
    parser = argparse.ArgumentParser(
        description="엑셀 K열 OR 검색·대상별 수집 V1.0 — CSV·가상환경·DB 백업 없음"
    )
    parser.add_argument(
        "stage",
        nargs="?",
        choices=["list", "collect", "all", "menu"],
        default="menu",
        help="list=목록만 / all=검색+전체상세 / collect=저장목록상세 / menu=메뉴",
    )
    parser.add_argument("--config", default=str(ROOT / "config.json"))
    parser.add_argument("--db")
    parser.add_argument("--downloads")
    parser.add_argument("--keywords", help="검색 키워드 엑셀 파일 경로")
    parser.add_argument(
        "--gubun",
        type=parse_pages,
        help="엑셀 수집대상 gubun 번호, 예: 1-3,84; 생략=K열 대상 전부",
    )
    parser.add_argument(
        "--law-policy",
        choices=["include", "exclude"],
        help="기본은 법령 수집·저장 포함",
    )
    parser.add_argument(
        "--categories",
        default="all",
        help="all 또는 promulgated,effective,scheduled,repealed,temporary,temporary_articles,unconstitutional",
    )
    parser.add_argument(
        "--end-page",
        type=positive_page,
        help="종료페이지만 지정(1부터 조회), 기본70. 한시법령·한시조문·위헌조문은 지정값을 무시하고 모든 페이지",
    )
    parser.add_argument("--from", dest="date_from", help="선택 날짜 필터 YYYY-MM-DD")
    parser.add_argument("--to", dest="date_to", help="선택 날짜 필터 YYYY-MM-DD")
    parser.add_argument(
        "--exclude-unknown", action="store_true", help="날짜 필터 사용 시 미정 제외"
    )
    parser.add_argument(
        "--ids", help="DB 목록의 key를 쉼표로 지정(고급). 메뉴는 화면번호로 선택"
    )
    parser.add_argument("--seq", help="저장한 법령 식별자 lsiSeq를 쉼표로 지정")
    parser.add_argument(
        "--all-selected",
        action="store_true",
        help="저장한 해당 대상 목록의 상세를 전부 수집",
    )
    parser.add_argument(
        "--limit", type=int, help="상세 수집 건수 제한(시험용). 기본은 제한 없음"
    )
    parser.add_argument(
        "--show-db",
        action="store_true",
        help="저장된 목록을 화면에 표시, 검색·다운로드 없음",
    )
    return parser


def setup_logging():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    logs = ROOT / "logs"
    logs.mkdir(exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                logs / f"crawler_{date.today().isoformat()}.log", encoding="utf-8"
            ),
        ],
    )


def load_settings(args):
    with open(args.config, encoding="utf-8-sig") as source:
        settings = json.load(source)
    if settings.get("law_url_policy") in (None, "unconfirmed"):
        settings["law_url_policy"] = "include"
    for key in ("db", "downloads", "keywords"):
        if getattr(args, key):
            settings[key] = getattr(args, key)
    if not Path(settings["keywords"]).is_absolute():
        settings["keywords"] = str(ROOT / settings["keywords"])
    # Older config max_pages values do not control the new requested range.
    settings.setdefault("end_page", DEFAULT_END_PAGE)
    if args.end_page is not None:
        settings["end_page"] = args.end_page
    if (
        isinstance(settings["end_page"], bool)
        or not isinstance(settings["end_page"], int)
        or settings["end_page"] < 1
    ):
        raise ValueError("end_page는 1 이상의 정수여야 합니다.")
    if args.limit is not None and args.limit < 1:
        raise ValueError("limit는 1 이상이어야 합니다.")
    return settings


def interactive(args, settings):
    from lawcrawler.rules import CATEGORIES

    print("\n국가법령정보센터 — 엑셀 K열 OR 검색·수집")
    print("1. 키워드로 검색 → 목록만 DB 저장 (다운로드 안 함)")
    print("2. 키워드로 검색 → 목록·본문·부칙·별표·첨부파일을 한 번에 수집")
    print("3. 저장한 목록에서 골라서 상세·첨부파일 수집")
    print("4. 저장한 목록 보기")
    choice = input("작업 번호 [2]: ").strip() or "2"
    if choice not in ("1", "2", "3", "4"):
        raise ValueError("작업 번호는 1~4입니다.")
    if choice in ("3", "4"):
        args.stage = "collect"
        args.show_db = choice == "4"
        args.pick_saved = choice == "3"
        return
    args.stage = "list" if choice == "1" else "all"
    print("\n수집대상: 0 전체")
    for number, (_, values) in enumerate(CATEGORIES.items(), 1):
        print(f"  {number}. {values[0]}")
    target = input("수집대상 번호 [0], 여러 개는 1,2: ").strip() or "0"
    if target in ("0", "all", "ALL"):
        args.categories = "all"
    else:
        numbers = parse_pages(target)
        names = list(CATEGORIES)
        if any(number > len(names) for number in numbers):
            raise ValueError("수집대상 번호는 0~7입니다.")
        args.categories = ",".join(names[number - 1] for number in numbers)
    value = input("엑셀 gubun 번호 [Enter=전체], 일부만 하려면 예: 1-3: ").strip()
    if value and value.upper() != "ALL":
        args.gubun = parse_pages(value)
    targets = (
        list(CATEGORIES) if args.categories == "all" else args.categories.split(",")
    )
    if any(target not in ALL_PAGE_CATEGORIES for target in targets):
        if args.end_page is None:
            value = input(
                f"종료페이지 [{settings['end_page']}], 시작은 항상 1페이지: "
            ).strip()
            if value:
                args.end_page = positive_page(value)
        ending = args.end_page if args.end_page is not None else settings["end_page"]
        print(
            f"공포·시행·시행예정·폐지법령은 각 검색 결과 1~{ending}페이지까지만 조회합니다."
        )
    if any(target in ALL_PAGE_CATEGORIES for target in targets):
        print(
            "한시법령·한시조문·위헌조문은 종료페이지와 관계없이 모든 페이지를 조회합니다."
        )
    print("선택 범위의 K열 OR 검색을 처리합니다. CSV는 만들지 않습니다.\n")


def validate(args, settings):
    from lawcrawler.rules import CATEGORIES

    names = list(CATEGORIES) if args.categories == "all" else args.categories.split(",")
    if not names or any(name not in CATEGORIES for name in names):
        raise ValueError("지원하지 않는 수집대상입니다: " + args.categories)
    names = list(dict.fromkeys(names))
    if args.date_from or args.date_to:
        if not args.date_from or not args.date_to:
            raise ValueError("날짜 필터는 --from과 --to를 모두 지정하세요.")
        if not all(
            re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)
            for value in (args.date_from, args.date_to)
        ):
            raise ValueError("날짜는 YYYY-MM-DD 형식이어야 합니다.")
        if date.fromisoformat(args.date_from) > date.fromisoformat(args.date_to):
            raise ValueError("시작일이 종료일보다 늦습니다.")
    if args.stage == "collect" and not (
        args.show_db
        or args.ids
        or args.seq
        or args.all_selected
        or getattr(args, "pick_saved", False)
    ):
        raise ValueError(
            "저장목록 수집은 --all-selected, --ids, --seq 또는 3번 메뉴를 사용하세요."
        )
    if sys.platform != "win32" and str(settings["db"]).startswith("D:"):
        raise ValueError(
            "현재 OS에서는 --db와 --downloads로 경로를 지정하세요. 기본은 Windows D드라이브입니다."
        )
    return names


def show_items(items):
    print(f"\n저장한 법령 목록: {len(items)}건")
    for number, item in enumerate(items, 1):
        print(
            f"{number}. [{item['category']}] {item['title']} | 시행 {item.get('effective_date', '')} | gubun {item.get('gubun', '[]')} | {item.get('article_label', '')}"
        )
        print(f"   법령ID {item['source_id']} / key {item['key']}")


def list_stage(site, db, rules, args, settings, categories, stats):
    from lawcrawler.rules import CATEGORIES, in_date_range, match_item, search_plans

    selected = {}
    complete = True
    plans = search_plans(rules)
    for category in categories:
        ending = None if category in ALL_PAGE_CATEGORIES else settings["end_page"]
        LOG.info(
            "[%s] 검색페이지 범위: %s",
            CATEGORIES[category][0],
            (
                "모든 페이지(종료페이지 옵션 미적용)"
                if ending is None
                else f"1~{ending}페이지(검색 결과가 먼저 끝나면 종료)"
            ),
        )
        for index, query in enumerate(plans, 1):
            stats["queries"] += 1
            LOG.info(
                "[%s] K열 단일 검색 %d/%d (결과 OR 합집합): %s",
                CATEGORIES[category][0],
                index,
                len(plans),
                query,
            )
            signatures = set()
            page = 1
            try:
                while True:
                    items, total_pages = site.list_page(category, page, query)
                    stats["pages"] += 1
                    stats["listed"] += len(items)
                    signature = tuple(item["key"] for item in items)
                    if signature and signature in signatures:
                        raise RuntimeError(
                            "검색페이지가 반복됩니다. 해당 검색의 미완료를 기록합니다."
                        )
                    signatures.add(signature)
                    accepted = []
                    for item in items:
                        if args.date_from and not in_date_range(
                            item, args.date_from, args.date_to, not args.exclude_unknown
                        ):
                            continue
                        matched = match_item(item, rules)
                        if matched is None:
                            continue
                        previous = selected.get(matched["key"])
                        queries = (
                            set(json.loads(previous.get("search_queries", "[]")))
                            if previous
                            else set()
                        )
                        queries.add(query)
                        matched["search_queries"] = json.dumps(
                            sorted(queries), ensure_ascii=False
                        )
                        selected[matched["key"]] = matched
                        accepted.append(matched)
                    db.save_list(accepted)
                    LOG.info(
                        "[%s / %s] %d/%s페이지: 검색 %d건, 일치 %d건",
                        CATEGORIES[category][0],
                        query,
                        page,
                        total_pages or "?",
                        len(items),
                        len(accepted),
                    )
                    if not items or (total_pages and page >= total_pages):
                        break
                    if ending is not None and page >= ending:
                        stats["end_page_stops"] += 1
                        LOG.info(
                            "검색 [%s] 지정 범위 1~%d페이지 완료. 이후 페이지는 요청한 수집범위 밖입니다.",
                            query,
                            ending,
                        )
                        break
                    page += 1
            except Exception as exc:
                complete = False
                stats["failed_queries"] += 1
                LOG.exception(
                    "[%s] 키워드 검색 실패 [%s]: %s. 다음 키워드를 계속 처리합니다.",
                    CATEGORIES[category][0],
                    query,
                    exc,
                )
    stats["selected"] += len(selected)
    return list(selected.values()), complete


def collect_stage(site, db, items, args, settings, stats):
    from lawcrawler.rules import normalized

    for index, item in enumerate(items, 1):
        if args.limit and stats["detail_attempts"] >= args.limit:
            LOG.warning(
                "시험용 상세 제한 %d 적용. 기본 실행에는 제한이 없습니다.", args.limit
            )
            break
        stats["detail_attempts"] += 1
        LOG.info(
            "[상세 %d/%d / %s] %s", index, len(items), item["category"], item["title"]
        )
        try:
            detail = site.detail(item)
            if normalized(detail["source_title"]) != normalized(item["title"]):
                raise RuntimeError(
                    "목록 제명과 상세 제명이 다릅니다. 저장하지 않습니다."
                )
            downloads = []
            for number, attachment in enumerate(detail["attachments"], 1):
                LOG.info(
                    "[첨부 %d/%d] %s",
                    number,
                    len(detail["attachments"]),
                    attachment["display_name"],
                )
                result = site.download(attachment, item, Path(settings["downloads"]))
                downloads.append(result)
                if result["status"] == "failed":
                    stats["failed_files"] += 1
                    LOG.error("첨부 실패: %s | %s", result["url"], result["error"])
                else:
                    stats["files"] += 1
                    LOG.info(
                        "%s %d bytes: %s",
                        result["status"],
                        result["size"],
                        result["local_path"],
                    )
                    if result["status"] == "format_mismatch":
                        stats["format_mismatches"] += 1
                        LOG.warning("첨부 형식 불일치: %s", result["error"])
            detail["attachments"] = downloads
            if detail["annexes_without_files"]:
                stats["missing_file_annexes"] += len(detail["annexes_without_files"])
                LOG.warning(
                    "다운로드 링크 없는 별표: %s",
                    ",".join(detail["annexes_without_files"]),
                )
            db.save_detail(item, detail)
            stats["details"] += 1
            LOG.info(
                "저장 완료: 본문 %d / 부칙 %d / 별표·서식 %d / 파일 %d",
                len(detail["articles"]),
                len(detail["addenda"]),
                len(detail["annexes"]),
                len(downloads),
            )
        except Exception as exc:
            stats["failed_items"] += 1
            LOG.exception("상세 실패 [%s] %s: %s", item["category"], item["title"], exc)


def saved_selection(db, args, categories):
    from lawcrawler.rules import CATEGORIES

    ids = [value.strip() for value in args.ids.split(",")] if args.ids else None
    items = db.get_items(ids=ids) if ids else db.get_items()
    if ids and set(ids) - {item["key"] for item in items}:
        raise ValueError("저장목록에 없는 key가 지정되었습니다.")
    if args.seq:
        seqs = {value.strip() for value in args.seq.split(",")}
        items = [item for item in items if item["source_id"] in seqs]
        if seqs - {item["source_id"] for item in items}:
            raise ValueError("지정한 법령ID가 저장목록에 없습니다.")
    labels = {CATEGORIES[name][0] for name in categories}
    items = [item for item in items if item["category"] in labels]
    if args.gubun:
        gubuns = set(args.gubun)
        items = [
            item
            for item in items
            if gubuns.intersection(json.loads(item.get("gubun", "[]")))
        ]
    if getattr(args, "pick_saved", False):
        show_items(items)
        if not items:
            return []
        value = input("수집할 화면번호(예: 1-3,5), 전체는 ALL: ").strip()
        if value.upper() != "ALL":
            numbers = parse_pages(value)
            if any(number > len(items) for number in numbers):
                raise ValueError("목록 화면번호 범위를 벗어났습니다.")
            items = [items[number - 1] for number in numbers]
    return items


def main(argv=None):
    args = cli_parser().parse_args(argv)
    setup_logging()
    run_id = None
    db = None
    site = None
    stats = dict(
        queries=0,
        failed_queries=0,
        pages=0,
        listed=0,
        selected=0,
        detail_attempts=0,
        details=0,
        files=0,
        failed_files=0,
        failed_items=0,
        missing_file_annexes=0,
        format_mismatches=0,
        end_page_stops=0,
    )
    try:
        settings = load_settings(args)
        if args.law_policy:
            settings["law_url_policy"] = args.law_policy
        if settings["law_url_policy"] == "exclude":
            LOG.warning("법령 제외 정책: DB·다운로드 변경 없이 종료합니다.")
            return 0
        if settings["law_url_policy"] != "include":
            raise ValueError("law_url_policy의 기본값은 include입니다.")
        if args.stage == "menu":
            interactive(args, settings)
            if args.end_page is not None:
                settings["end_page"] = args.end_page
        categories = validate(args, settings)
        from lawcrawler.rules import CATEGORIES, selected_rules, load_rules
        from lawcrawler.site import LawSite
        from lawcrawler.storage import Storage

        if (args.show_db or args.stage == "collect") and not Path(
            settings["db"]
        ).is_file():
            raise FileNotFoundError(
                "저장한 DB 목록이 없습니다. 먼저 1번 또는 2번을 실행하세요."
            )
        rules = (
            selected_rules(load_rules(settings["keywords"]), args.gubun)
            if args.stage in ("list", "all")
            else []
        )
        db = Storage(Path(settings["db"]))
        if args.show_db:
            show_items(saved_selection(db, args, categories))
            return 0
        LOG.info(
            "DB %s | 수집대상 %s | 엑셀 K열 %d행 OR 조건 | CSV 없음",
            settings["db"],
            ",".join(CATEGORIES[name][0] for name in categories),
            len(rules),
        )
        run_id = db.begin_run(args.stage, vars(args))
        site = LawSite(
            settings["request_delay"], settings["timeout"], settings["retries"]
        )
        complete = True
        if args.stage in ("list", "all"):
            for category in categories:
                LOG.info("===== 수집대상 시작: %s =====", CATEGORIES[category][0])
                items, target_complete = list_stage(
                    site, db, rules, args, settings, [category], stats
                )
                complete = complete and target_complete
                if args.stage == "all":
                    collect_stage(site, db, items, args, settings, stats)
                else:
                    LOG.info(
                        "목록 %d건 DB 저장. 본문·부칙·별표·첨부파일은 수집하지 않았습니다.",
                        len(items),
                    )
                LOG.info("===== 수집대상 완료: %s =====", CATEGORIES[category][0])
        else:
            collect_stage(
                site, db, saved_selection(db, args, categories), args, settings, stats
            )
        status = (
            "completed"
            if complete
            and not any(
                stats[key]
                for key in (
                    "failed_queries",
                    "failed_items",
                    "failed_files",
                    "missing_file_annexes",
                    "format_mismatches",
                )
            )
            else "partial"
        )
        if status == "completed" and (
            (args.stage in ("list", "all") and stats["selected"] == 0)
            or (args.stage == "collect" and stats["detail_attempts"] == 0)
        ):
            status = "no_results"
            LOG.warning(
                "수집 결과 0건: 목록·본문·첨부파일을 새로 저장하지 않았습니다. DB %s. 검색어·조회대상·날짜 조건과 사이트 응답을 확인하세요. 정상 수집 완료로 처리하지 않습니다.",
                settings["db"],
            )
        db.end_run(run_id, status, stats)
        run_id = None
        LOG.info("실행 결과 %s | %s", status, json.dumps(stats, ensure_ascii=False))
        return 0 if status == "completed" else 2
    except KeyboardInterrupt:
        LOG.warning("사용자 중단: 이미 저장한 항목은 유지됩니다.")
        if db and run_id:
            db.end_run(run_id, "interrupted", stats, "KeyboardInterrupt")
        return 130
    except Exception as exc:
        LOG.exception("실행 실패: %s", exc)
        if db and run_id:
            try:
                db.end_run(run_id, "failed", stats, str(exc))
            except Exception:
                LOG.exception("실행 이력 기록 실패")
        return 1
    finally:
        if site:
            site.close()
        if db:
            db.close()


if __name__ == "__main__":
    sys.exit(main())
