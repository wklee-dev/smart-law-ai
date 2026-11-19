# -*- coding: utf-8 -*-
"""Tax Tribunal decision-case collector - entry point (V1.2)

Usage
-----
  python run_crawl.py init-db
  python run_crawl.py check-db
  python run_crawl.py list   --semok 90 --start-page 1 --max-pages 3
  python run_crawl.py detail --semok 90 --limit 100
  python run_crawl.py full   --semok 90
  python run_crawl.py stats
  python run_crawl.py export --out .\\export
"""
from __future__ import annotations

import argparse
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from tt_crawler import pipeline  # noqa: E402
from tt_crawler.config import Config  # noqa: E402
from tt_crawler.net_check import run_net_check  # noqa: E402
from tt_crawler.util import setup_console, setup_logger  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="run_crawl.py",
        description="Tax Tribunal (tt.go.kr) decision-case collector V1.2  [DB: D:\\SQLiteDB\\smart_law_ai.db]",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples
  python run_crawl.py net-check               diagnose DNS / connectivity
  python run_crawl.py init-db                 create new tables
  python run_crawl.py check-db                show existing/new tables
  python run_crawl.py list  --max-pages 5     collect list pages (test)
  python run_crawl.py detail --limit 100      collect details (test)
  python run_crawl.py full                    collect everything (Customs)
  python run_crawl.py resume                  continue pending details
  python run_crawl.py stats                   show collection status
  python run_crawl.py export                  export to CSV
""",
    )
    p.add_argument("mode", choices=[
        "net-check", "init-db", "check-db", "list", "detail", "full", "resume", "stats", "export"
    ], help="execution mode")
    p.add_argument("-c", "--config", default=None, help="path to config.ini")
    p.add_argument("--base-url", default=None,
                   help="override the target host, e.g. https://www.tt.go.kr")
    p.add_argument("--semok", nargs="*", default=None,
                   help="target category code(s), e.g. 90 (default: config.ini)")
    p.add_argument("--start-page", type=int, default=0, help="start page for list mode")
    p.add_argument("--max-pages", type=int, default=0, help="max pages for list mode (0=all)")
    p.add_argument("--limit", type=int, default=0, help="max rows for detail mode (0=all)")
    p.add_argument("--force", action="store_true", help="re-collect rows already collected")
    p.add_argument("--no-backup", action="store_true", help="skip backup on init-db")
    p.add_argument("--out", default=None, help="output folder for export")
    return p


def main(argv=None):
    setup_console()
    args = build_parser().parse_args(argv)
    args.argv = argv if argv is not None else sys.argv[1:]

    cfg = Config(args.config)
    if args.base_url:
        cfg.override_base_url(args.base_url)
    logger = setup_logger(cfg.log_dir, cfg.log_level)

    logger.info("=" * 70)
    logger.info("Tax Tribunal case collector V1.2  |  mode=%s", args.mode)
    logger.info("DB file : %s", cfg.db_path)
    logger.info("Prefix  : %s  |  categories : %s", cfg.table_prefix, args.semok or cfg.semok_list)
    logger.info("=" * 70)

    try:
        if args.mode == "net-check":
            return run_net_check(cfg, logger)
        elif args.mode == "init-db":
            pipeline.do_init_db(cfg, logger, do_backup=not args.no_backup)
            pipeline.cmd_check_db(cfg, logger, args)
        elif args.mode == "check-db":
            pipeline.cmd_check_db(cfg, logger, args)
        elif args.mode == "list":
            pipeline.cmd_list(cfg, logger, args)
        elif args.mode == "detail":
            pipeline.cmd_detail(cfg, logger, args)
        elif args.mode == "full":
            pipeline.cmd_full(cfg, logger, args)
        elif args.mode == "resume":
            args.limit = args.limit or 0
            pipeline.cmd_detail(cfg, logger, args)
            pipeline.cmd_stats(cfg, logger, args)
        elif args.mode == "stats":
            pipeline.cmd_stats(cfg, logger, args)
        elif args.mode == "export":
            pipeline.cmd_export(cfg, logger, args)
    except KeyboardInterrupt:
        logger.warning("Interrupted by user (Ctrl+C). Run 'resume' to continue later.")
        return 130
    except Exception as e:  # noqa: BLE001
        logger.error("execution failed: %s", e, exc_info=True)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
