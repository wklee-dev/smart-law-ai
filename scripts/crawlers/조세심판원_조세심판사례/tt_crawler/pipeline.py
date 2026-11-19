# -*- coding: utf-8 -*-
"""Collection pipeline (per-mode execution).

Modes
-----
init-db : create new tables (existing tables untouched) + seed category master
check-db: print existing/new table classification and collection status
list    : collect list pages -> tb_tt_case_list                     (stage 1)
detail  : collect detail pages + body -> tb_tt_case / _case_body / _attach (stage 2)
full    : list + detail
stats   : print collection status
export  : export new tables to CSV
"""
from __future__ import annotations

import csv
import os
import traceback

from .config import SEMOK_MASTER
from .db import Db
from .detail_parser import parse_attachments, parse_body, parse_detail_meta, parse_viewer_params
from .http_client import FetchError, Fetcher
from .list_parser import parse_list_page
from .util import clean_text, ensure_dir, now_str, safe_filename, sha1, stamp_str

SCHEMA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sql", "schema.sql")


def _new_run_id() -> str:
    return "RUN-" + stamp_str()


# Shown when the failure looks like a DNS / connection problem rather than a
# site-side error, so the operator knows where to look first.
NETWORK_HINT = (
    "This looks like a network/DNS problem on this PC, not a site problem. "
    "Run the 'net-check' mode (00_net_check.bat) for a diagnosis."
)
_NET_SIGNS = (
    "getaddrinfo",
    "Failed to resolve",
    "NameResolutionError",
    "Max retries exceeded",
    "ConnectionError",
    "timed out",
    "SSLError",
)


def _is_network_error(msg: str) -> bool:
    m = str(msg)
    return any(s in m for s in _NET_SIGNS)


# ==========================================================================
# common
# ==========================================================================
def open_db(cfg, logger) -> Db:
    db = Db(cfg, logger)
    db.connect()
    return db


def do_init_db(cfg, logger, do_backup: bool = True) -> Db:
    db = open_db(cfg, logger)
    if do_backup:
        db.backup()
    db.init_schema(SCHEMA_FILE, SEMOK_MASTER)
    logger.info("New tables created (prefix=%s)", cfg.table_prefix)
    return db


# ==========================================================================
# check-db
# ==========================================================================
def cmd_check_db(cfg, logger, args=None):
    db = open_db(cfg, logger)
    print("")
    print("=" * 78)
    print(" DB file : %s" % cfg.db_path)
    print(" Prefix  : %s" % cfg.table_prefix)
    print("=" * 78)

    info = db.classify_tables()
    print("\n[Existing tables] %d total  <- read-only, never modified" % len(info["existing"]))
    for t in info["existing"]:
        try:
            c = db.conn.execute('SELECT COUNT(*) FROM "%s"' % t).fetchone()[0]
        except Exception:
            c = "-"
        print("   - %-40s %s rows" % (t, c))
    if not info["existing"]:
        print("   (none)")

    print("\n[New tables] %d total  <- created and managed by this crawler" % len(info["new"]))
    for t in info["new"]:
        try:
            c = db.conn.execute('SELECT COUNT(*) FROM "%s"' % t).fetchone()[0]
        except Exception:
            c = "-"
        print("   - %-40s %s rows" % (t, c))
    if not info["new"]:
        print("   (none) -> run 'run_crawl.py init-db' first.")

    if info["new"]:
        s = db.stats()
        print("\n[Collection status]")
        print("   List staging  : %s rows (detail done %s)" % (s["case_list"], s["case_list_done"]))
        print("   Case master   : %s rows" % s["case"])
        print("   Body text     : %s rows" % s["case_body"])
        print("   Attachments   : %s rows" % s["attach"])
        print("   Errors        : %s rows" % s["error"])
        print("")
        print("   [By category]  code      collected   detail done")
        for r in db.semok_stats():
            print("                  %-9s %10s %12s" % (r["semok_code"], r["cnt"], r["done"]))
    print("=" * 78)
    db.close()


# ==========================================================================
# list (stage 1)
# ==========================================================================
def cmd_list(cfg, logger, args):
    semok_targets = args.semok if args.semok else cfg.semok_list
    if "all" in semok_targets:
        semok_targets = cfg.semok_list

    db = open_db(cfg, logger)
    if not db.classify_tables()["new"]:
        logger.info("No new tables found; creating them automatically.")
        db.init_schema(SCHEMA_FILE, SEMOK_MASTER)

    fetcher = Fetcher(cfg, logger)
    run_id = _new_run_id()
    total_ok = total_fail = 0

    for semok in semok_targets:
        log_id = db.log_start("list", semok, " ".join(str(a) for a in getattr(args, "argv", [])), run_id)

        ok = fail = 0
        page = args.start_page if args.start_page else cfg.start_page
        max_pages = args.max_pages if args.max_pages else cfg.max_pages
        searched_pages = 0

        while True:
            try:
                html = fetcher.get_text(
                    "/mUser/dem/demList.do",
                    fetcher.list_params(semok, page),
                    referer=fetcher.base + "/mUser/dem/demList.do",
                )
            except FetchError as e:
                logger.error("[list] category %s page %s failed: %s", semok, page, e)
                if _is_network_error(str(e)):
                    logger.error("%s", NETWORK_HINT)
                db.log_error(run_id, "list", "", fetcher.base + "/mUser/dem/demList.do", "FetchError", str(e))
                fail += 1
                break

            res = parse_list_page(html, page)
            if page == (args.start_page or cfg.start_page):
                db.update_list_total(semok, res["total_cnt"], res["total_pages"])
                logger.info(
                    "[list] category %s : %s items / %s pages", semok, res["total_cnt"], res["total_pages"]
                )
            if not res["items"]:
                logger.warning("[list] category %s page %s returned no rows -> stop", semok, page)
                break

            ins, upd = db.upsert_list_items(res["items"], semok)
            ok += len(res["items"])
            searched_pages += 1

            if res["total_pages"] and page >= res["total_pages"]:
                break
            if max_pages and searched_pages >= max_pages:
                logger.info("[list] category %s : reached max pages (%s) -> stop", semok, max_pages)
                break
            page += 1

        db.log_end(log_id, ok, 0, fail, "list collection for category %s" % semok)
        total_ok += ok
        total_fail += fail

    logger.info("[list] done -> %s collected / %s failed (%s requests)", total_ok, total_fail, fetcher.request_cnt)
    db.close()


# ==========================================================================
# detail (stage 2)
# ==========================================================================
def _download_attachments(cfg, logger, fetcher, dem_no, atts) -> dict:
    saved = {}
    if not cfg.download_attach or not atts:
        return saved
    base_dir = cfg.attach_dir
    if not os.path.isabs(base_dir):
        base_dir = os.path.join(os.path.dirname(SCHEMA_FILE), base_dir.lstrip(".\\/"))
    for a in atts:
        try:
            ensure_dir(base_dir)
            fname = "%s_%s" % (dem_no, safe_filename(a.get("file_name") or "attach"))
            dest = os.path.join(base_dir, fname)
            if not os.path.isfile(dest):
                data = fetcher.get_bytes(
                    a["download_url"], referer=fetcher.base + "/mUser/dem/demView.do"
                )
                with open(dest, "wb") as f:
                    f.write(data)
                logger.info("[attach] saved %s (%s bytes)", dest, len(data))
            saved[a["file_path"]] = dest
        except Exception as e:  # noqa: BLE001
            logger.warning("[attach] download failed dem_no=%s : %s", dem_no, e)
    return saved


def cmd_detail(cfg, logger, args):
    db = open_db(cfg, logger)
    if not db.classify_tables()["new"]:
        logger.error("No new tables found. Run 'init-db' first.")
        db.close()
        return

    fetcher = Fetcher(cfg, logger)
    run_id = _new_run_id()
    semok_filter = args.semok if args.semok and "all" not in args.semok else None
    pending = db.pending_details(limit=args.limit or 0, semok_list=semok_filter, force=args.force)

    logger.info("[detail] target %s rows (limit=%s, force=%s)", len(pending), args.limit or "all", args.force)
    log_id = db.log_start("detail", ",".join(semok_filter) if semok_filter else "ALL", "", run_id)

    ok = skip = fail = 0
    for idx, row in enumerate(pending, 1):
        dem_no = row["dem_no"]
        semok = row["semok_code"] or ""
        url = "%s/mUser/dem/demView.do?semok=%s&dem_no=%s" % (fetcher.base, semok, dem_no)
        try:
            html = fetcher.get_text(
                "/mUser/dem/demView.do",
                fetcher.detail_params(semok, dem_no),
                referer="%s/mUser/dem/demList.do?semok=%s" % (fetcher.base, semok),
            )
            meta = parse_detail_meta(html)

            vp = parse_viewer_params(meta.get("viewer_url") or "")
            body = {}
            if vp.get("dem_no"):
                try:
                    vhtml = fetcher.get_text(
                        "/mUser/common/xmlViewer.do",
                        {"dem_no": vp["dem_no"], "db": vp.get("db", "s")},
                        referer=url,
                    )
                    body = parse_body(vhtml)
                except FetchError as e:
                    logger.warning("[body] dem_no=%s body fetch failed: %s", dem_no, e)
                    db.log_error(run_id, "detail-body", dem_no, url, "FetchError", str(e))

            body_text = clean_text(body.get("body_text") or "")
            case = {
                "dem_no": dem_no,
                "doc_no": meta.get("doc_no") or row.get("claim_no") or "",
                "claim_no": body.get("claim_no") or row.get("claim_no") or "",
                "semok_code": semok,
                "semok_name": body.get("semok_name") or meta.get("semok_name") or row.get("semok_name") or "",
                "decision_type": body.get("decision_type") or meta.get("decision_type") or row.get("decision_type") or "",
                "decision_date": meta.get("decision_date") or row.get("decision_date") or "",
                "title": body.get("title") or meta.get("title") or row.get("title") or "",
                "summary": body.get("summary") or "",
                "related_law": body.get("related_law") or "",
                "ref_decision": body.get("ref_decision") or "",
                "fol_decision": body.get("fol_decision") or "",
                "order_text": body.get("order_text") or "",
                "reason_text": body.get("reason_text") or "",
                "body_text": body_text,
                "source_url": url,
                "attach_cnt": len(meta.get("attachments") or []),
                "content_hash": sha1(body_text) if body_text else "",
                "crawl_status": "OK" if body_text else "PARTIAL",
            }
            case_id = db.upsert_case(case)
            if body_text:
                db.save_body(case_id, dem_no, body_text, body.get("viewer_html") or "", cfg.save_body_html)
            atts = meta.get("attachments") or []
            if atts:
                saved = _download_attachments(cfg, logger, fetcher, dem_no, atts)
                db.save_attachments(dem_no, atts, saved)
            db.mark_detail_done(dem_no)
            ok += 1
        except Exception as e:  # noqa: BLE001
            fail += 1
            logger.error("[detail] dem_no=%s failed: %s", dem_no, e)
            db.log_error(run_id, "detail", dem_no, url, type(e).__name__,
                         "%s\n%s" % (e, traceback.format_exc()[:1500]))

        if idx % 50 == 0 or idx == len(pending):
            logger.info("[detail] progress %s/%s (ok %s / fail %s)", idx, len(pending), ok, fail)

    db.log_end(log_id, ok, skip, fail, "detail collection")
    logger.info("[detail] done -> ok %s / fail %s (%s requests)", ok, fail, fetcher.request_cnt)
    db.close()


# ==========================================================================
# full
# ==========================================================================
def cmd_full(cfg, logger, args):
    cmd_list(cfg, logger, args)
    cmd_detail(cfg, logger, args)
    cmd_stats(cfg, logger, args)


# ==========================================================================
# stats
# ==========================================================================
def cmd_stats(cfg, logger, args=None):
    db = open_db(cfg, logger)
    if not db.classify_tables()["new"]:
        logger.error("No new tables found. Run 'init-db' first.")
        db.close()
        return
    s = db.stats()
    print("")
    print("-" * 62)
    print(" Collection status  (%s)" % now_str())
    print("-" * 62)
    print("  List staging    : %8s rows" % s["case_list"])
    print("  Detail done     : %8s rows" % s["case_list_done"])
    print("  Pending detail  : %8s rows" % (s["case_list"] - s["case_list_done"]))
    print("  Case master     : %8s rows" % s["case"])
    print("  Body text       : %8s rows" % s["case_body"])
    print("  Attachments     : %8s rows" % s["attach"])
    print("  Errors          : %8s rows" % s["error"])
    print("-" * 62)
    rows = db.conn.execute(
        "SELECT semok_code, COUNT(*) c, SUM(CASE WHEN detail_yn='Y' THEN 1 ELSE 0 END) d "
        "FROM %s GROUP BY semok_code ORDER BY semok_code" % db.t("case_list")
    ).fetchall()
    if rows:
        print("  category     collected   detail done")
        for r in rows:
            print("  %-12s %9s %12s" % (r["semok_code"], r["c"], r["d"] or 0))
    print("-" * 62)
    db.close()


# ==========================================================================
# export
# ==========================================================================
EXPORT_COLS = [
    "dem_no", "doc_no", "claim_no", "semok_code", "semok_name", "decision_type",
    "decision_date", "title", "summary", "related_law", "ref_decision",
    "fol_decision", "order_text", "reason_text", "source_url", "attach_cnt",
    "crawl_status", "first_crawled_at", "last_crawled_at",
]


def cmd_export(cfg, logger, args):
    db = open_db(cfg, logger)
    if not db.classify_tables()["new"]:
        logger.error("No new tables found. Run 'init-db' first.")
        db.close()
        return
    out_dir = args.out or os.path.join(os.path.dirname(SCHEMA_FILE), "export")
    ensure_dir(out_dir)
    out = os.path.join(out_dir, "tt_cases_%s.csv" % stamp_str())
    rows = db.conn.execute(
        "SELECT %s FROM %s ORDER BY decision_date DESC, dem_no DESC"
        % (",".join(EXPORT_COLS), db.t("case"))
    ).fetchall()
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(EXPORT_COLS)
        for r in rows:
            w.writerow([r[c] for c in EXPORT_COLS])
    logger.info("[export] %s rows -> %s", len(rows), out)
    print(out)
    db.close()
