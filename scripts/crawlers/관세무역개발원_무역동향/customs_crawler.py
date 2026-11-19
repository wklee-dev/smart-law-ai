#!/usr/bin/env python3
"""설계서의 페이지별 실행 예시를 run.py에 연결하는 호환 실행기."""
import argparse
import configparser
import sys
from pathlib import Path

import run


def main(argv=None):
    parser = argparse.ArgumentParser(description="페이지별 국내 관세무역동향 수집")
    parser.add_argument("pages", nargs="*", help="1 / 1 10 / all")
    parser.add_argument("--from", dest="first", type=int)
    parser.add_argument("--to", dest="last", type=int)
    raw = list(sys.argv[1:] if argv is None else argv)
    page_tokens, extra = [], []
    takes_value = {"--stage", "--year", "--week", "--start-date", "--end-date", "--page", "--from-page", "--to-page", "--db-path", "--download-dir", "--delay"}
    i = 0
    while i < len(raw):
        token = raw[i]
        if token in ("-h", "--help"):
            page_tokens.append(token)
        elif token in ("--from", "--to"):
            page_tokens.append(token)
            i += 1
            if i >= len(raw):
                parser.error(f"{token} 다음에 숫자를 지정하세요.")
            page_tokens.append(raw[i])
        elif token.startswith("--from=") or token.startswith("--to="):
            page_tokens.append(token)
        elif token.startswith("-"):
            extra.append(token)
            if token in takes_value:
                i += 1
                if i >= len(raw):
                    parser.error(f"{token} 다음에 값을 지정하세요.")
                extra.append(raw[i])
        else:
            page_tokens.append(token)
        i += 1
    args = parser.parse_args(page_tokens)
    if args.first is not None or args.last is not None:
        if args.first is None or args.last is None or args.pages:
            parser.error("--from과 --to는 함께 사용하고 숫자 인수와 섞지 마세요.")
        page_args = ["--from-page", str(args.first), "--to-page", str(args.last)]
    elif args.pages == ["all"]:
        page_args = ["--all-pages"]
    elif len(args.pages) in (1, 2) and all(p.isdecimal() for p in args.pages):
        page_args = ["--page", args.pages[0]] if len(args.pages) == 1 else ["--from-page", args.pages[0], "--to-page", args.pages[1]]
    elif not args.pages:
        config = configparser.ConfigParser()
        config.read(Path(__file__).resolve().parent / "config.ini", encoding="utf-8")
        try:
            first = config.getint("crawl", "start_page", fallback=1)
            last = config.getint("crawl", "end_page", fallback=1)
        except ValueError as exc:
            parser.error(f"config.ini 페이지 설정 오류: {exc}")
        page_args = ["--from-page", str(first), "--to-page", str(last)]
    else:
        parser.error("페이지는 1개, 시작/종료 2개 또는 all로 지정하세요.")
    return run.main(["crawl"] + page_args + extra)


if __name__ == "__main__":
    sys.exit(main())
