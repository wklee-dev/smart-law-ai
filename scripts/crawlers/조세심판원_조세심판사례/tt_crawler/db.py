# -*- coding: utf-8 -*-
"""SQLite persistence layer.

Design rules
------------
1) Reuse the existing DB (D:\\SQLiteDB\\smart_law_ai.db). Never change the path.
2) Existing tables are read-only: no DROP / ALTER / DELETE on them.
3) New tables are created with CREATE TABLE IF NOT EXISTS only, and are
   distinguished by the tb_tt_ prefix.
4) Optional pre-run backup via the sqlite3 backup API (safe with locks/WAL).
"""
from __future__ import annotations

import os
import sqlite3

from .util import ensure_dir, now_str, sha1, stamp_str


class Db:
    def __init__(self, cfg, logger=None):
        self.cfg = cfg
        self.log = logger
        self.prefix = cfg.table_prefix
        self.path = cfg.db_path
        self.conn = None

    # ------------------------------------------------------------------
    def t(self, name: str) -> str:
        """Physical table name with prefix."""
        return self.prefix + name

    # ------------------------------------------------------------------
    def connect(self):
        d = os.path.dirname(os.path.abspath(self.path))
        if d:
            ensure_dir(d)
        self.conn = sqlite3.connect(self.path, timeout=self.cfg.db_timeout)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA busy_timeout = %d" % (self.cfg.db_timeout * 1000))
        self.conn.execute("PRAGMA foreign_keys = OFF")
        return self.conn

    def close(self):
        if self.conn:
            try:
                self.conn.commit()
            except Exception:
                pass
            self.conn.close()
            self.conn = None

    # ------------------------------------------------------------------
    def backup(self) -> str:
        """Pre-run backup. Returns the backup path ('' on failure)."""
        if not self.cfg.backup_before_run:
            return ""
        try:
            ensure_dir(self.cfg.backup_dir)
            base = os.path.splitext(os.path.basename(self.path))[0]
            dest = os.path.join(self.cfg.backup_dir, "%s_%s.bak" % (base, stamp_str()))
            src = sqlite3.connect(self.path, timeout=self.cfg.db_timeout)
            try:
                dst = sqlite3.connect(dest)
                try:
                    src.backup(dst)
                finally:
                    dst.close()
            finally:
                src.close()
            if self.log:
                self.log.info("DB backup created: %s", dest)
            return dest
        except Exception as e:  # noqa: BLE001
            if self.log:
                self.log.warning("DB backup failed (continuing): %s", e)
            return ""

    # ------------------------------------------------------------------
    def init_schema(self, schema_path: str, semok_master: list):
        with open(schema_path, "r", encoding="utf-8") as f:
            ddl = f.read()
        ddl = ddl.replace("{{PREFIX}}", self.prefix)
        self.conn.executescript(ddl)
        self.conn.commit()
        self._seed_semok(semok_master)
        self._set_meta("schema_version", "1.0")
        self._set_meta("init_at", now_str())

    def _seed_semok(self, semok_master: list):
        sql = (
            "INSERT INTO %s (semok_code, semok_name, semok_group, sort_order, use_yn, updated_at) "
            "VALUES (?,?,?,?, 'Y', ?) "
            "ON CONFLICT(semok_code) DO UPDATE SET "
            "semok_name=excluded.semok_name, semok_group=excluded.semok_group, "
            "sort_order=excluded.sort_order, updated_at=excluded.updated_at" % self.t("semok")
        )
        for code, name, grp, order in semok_master:
            self.conn.execute(sql, (code, name, grp, order, now_str()))
        self.conn.commit()

    def _set_meta(self, key: str, value: str):
        self.conn.execute(
            "INSERT INTO %s (meta_key, meta_value, updated_at) VALUES (?,?,?) "
            "ON CONFLICT(meta_key) DO UPDATE SET meta_value=excluded.meta_value, "
            "updated_at=excluded.updated_at" % self.t("meta"),
            (key, value, now_str()),
        )
        self.conn.commit()

    def get_meta(self, key: str) -> str:
        row = self.conn.execute(
            "SELECT meta_value FROM %s WHERE meta_key=?" % self.t("meta"), (key,)
        ).fetchone()
        return row["meta_value"] if row else ""

    # ------------------------------------------------------------------
    # Existing vs new table classification
    # ------------------------------------------------------------------
    def all_tables(self) -> list:
        rows = self.conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).fetchall()
        return [r["name"] for r in rows]

    def classify_tables(self) -> dict:
        tables = self.all_tables()
        mine = [t for t in tables if t.startswith(self.prefix)]
        others = [t for t in tables if not t.startswith(self.prefix)]
        return {"new": mine, "existing": others, "total": len(tables)}

    # ------------------------------------------------------------------
    # Run log
    # ------------------------------------------------------------------
    def log_start(self, phase: str, target: str, args: str, run_id: str = "") -> int:
        cur = self.conn.execute(
            "INSERT INTO %s (run_id, phase, target, started_at, arg_text, status) VALUES (?,?,?,?,?,'RUN')"
            % self.t("crawl_log"),
            (run_id, phase, target, now_str(), args),
        )
        self.conn.commit()
        return int(cur.lastrowid)

    def log_end(self, log_id: int, ok: int, skip: int, fail: int, msg: str = "", status: str = "OK"):
        self.conn.execute(
            "UPDATE %s SET ended_at=?, ok_cnt=?, skip_cnt=?, fail_cnt=?, result_msg=?, status=? "
            "WHERE log_id=?" % self.t("crawl_log"),
            (now_str(), ok, skip, fail, msg[:1000], status, log_id),
        )
        self.conn.commit()

    def log_error(self, run_id: int, phase: str, dem_no, url: str, etype: str, msg: str):
        self.conn.execute(
            "INSERT INTO %s (run_id, phase, dem_no, page_url, error_type, error_msg, occurred_at) "
            "VALUES (?,?,?,?,?,?,?)" % self.t("error_log"),
            (run_id, phase, str(dem_no or ""), url, etype, str(msg)[:2000], now_str()),
        )
        self.conn.commit()

    # ------------------------------------------------------------------
    # List staging upsert
    # ------------------------------------------------------------------
    def upsert_list_items(self, items: list, semok_code: str) -> tuple:
        """Returns (inserted, updated)."""
        ins = 0
        upd = 0
        ts = now_str()
        for it in items:
            row = self.conn.execute(
                "SELECT list_id FROM %s WHERE dem_no=?" % self.t("case_list"), (it["dem_no"],)
            ).fetchone()
            if row:
                self.conn.execute(
                    "UPDATE %s SET semok_code=?, page_no=?, decision_date=?, claim_no=?, "
                    "decision_type=?, title=?, list_summary=?, last_seen_at=? WHERE dem_no=?"
                    % self.t("case_list"),
                    (
                        it.get("semok_code") or semok_code,
                        it.get("page_no"),
                        it.get("decision_date"),
                        it.get("claim_no"),
                        it.get("decision_type"),
                        it.get("title"),
                        it.get("list_summary"),
                        ts,
                        it["dem_no"],
                    ),
                )
                upd += 1
            else:
                self.conn.execute(
                    "INSERT INTO %s (dem_no, semok_code, semok_name, page_no, decision_date, "
                    "claim_no, decision_type, title, list_summary, detail_yn, first_seen_at, last_seen_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?,'N',?,?)" % self.t("case_list"),
                    (
                        it["dem_no"],
                        it.get("semok_code") or semok_code,
                        it.get("semok_name"),
                        it.get("page_no"),
                        it.get("decision_date"),
                        it.get("claim_no"),
                        it.get("decision_type"),
                        it.get("title"),
                        it.get("list_summary"),
                        ts,
                        ts,
                    ),
                )
                ins += 1
        self.conn.commit()
        return ins, upd

    def update_list_total(self, semok_code: str, total_cnt: int, total_pages: int):
        self.conn.execute(
            "INSERT INTO %s (semok_code, total_cnt, total_pages, last_checked_at) VALUES (?,?,?,?) "
            "ON CONFLICT(semok_code) DO UPDATE SET total_cnt=excluded.total_cnt, "
            "total_pages=excluded.total_pages, last_checked_at=excluded.last_checked_at"
            % self.t("semok_stat"),
            (semok_code, total_cnt, total_pages, now_str()),
        )
        self.conn.commit()

    def pending_details(self, limit: int = 0, semok_list: list = None, force: bool = False) -> list:
        sql = (
            "SELECT dem_no, semok_code, semok_name, claim_no, title, decision_date, decision_type "
            "FROM %s WHERE 1=1" % self.t("case_list")
        )
        params = []
        if not force:
            sql += " AND IFNULL(detail_yn,'N') <> 'Y'"
        if semok_list:
            sql += " AND semok_code IN (%s)" % ",".join("?" * len(semok_list))
            params.extend(semok_list)
        sql += " ORDER BY decision_date DESC, dem_no DESC"
        if limit and limit > 0:
            sql += " LIMIT %d" % limit
        return [dict(r) for r in self.conn.execute(sql, params).fetchall()]

    # ------------------------------------------------------------------
    # Detail upsert
    # ------------------------------------------------------------------
    def upsert_case(self, case: dict) -> int:
        """Upsert one decision master row. Returns case_id."""
        cols = [
            "dem_no",
            "doc_no",
            "claim_no",
            "semok_code",
            "semok_name",
            "decision_type",
            "decision_date",
            "title",
            "summary",
            "related_law",
            "ref_decision",
            "fol_decision",
            "order_text",
            "reason_text",
            "body_text",
            "source_url",
            "attach_cnt",
            "content_hash",
            "crawl_status",
            "first_crawled_at",
            "last_crawled_at",
        ]
        vals = [case.get(c) for c in cols]
        vals[-1] = now_str()                      # last_crawled_at
        vals[-2] = case.get("first_crawled_at") or now_str()

        exists = self.conn.execute(
            "SELECT case_id FROM %s WHERE dem_no=?" % self.t("case"), (case["dem_no"],)
        ).fetchone()
        if exists:
            set_clause = ", ".join("%s=?" % c for c in cols if c != "first_crawled_at")
            params = [case.get(c) for c in cols if c != "first_crawled_at"]
            params[-1] = now_str()  # last_crawled_at
            params.append(case["dem_no"])
            self.conn.execute(
                "UPDATE %s SET %s WHERE dem_no=?" % (self.t("case"), set_clause), params
            )
            self.conn.commit()
            return int(exists["case_id"])

        q = "INSERT INTO %s (%s) VALUES (%s)" % (
            self.t("case"), ",".join(cols), ",".join("?" * len(cols)),
        )
        cur = self.conn.execute(q, vals)
        self.conn.commit()
        return int(cur.lastrowid)

    def save_body(self, case_id: int, dem_no: int, body_text: str, viewer_html: str, save_html: bool = True):
        self.conn.execute(
            "INSERT INTO %s (case_id, dem_no, body_text, viewer_html, text_len, extracted_at) "
            "VALUES (?,?,?,?,?,?) "
            "ON CONFLICT(case_id) DO UPDATE SET body_text=excluded.body_text, "
            "viewer_html=excluded.viewer_html, text_len=excluded.text_len, "
            "extracted_at=excluded.extracted_at" % self.t("case_body"),
            (case_id, dem_no, body_text, (viewer_html if save_html else None), len(body_text or ""), now_str()),
        )
        self.conn.commit()

    def save_attachments(self, dem_no: int, atts: list, saved=None):
        saved = saved or {}
        for a in atts:
            self.conn.execute(
                "INSERT INTO %s (dem_no, file_name, file_path, file_ext, dem_str, download_url, "
                "saved_path, download_yn, reg_at) VALUES (?,?,?,?,?,?,?,?,?) "
                "ON CONFLICT(dem_no, file_path) DO UPDATE SET file_name=excluded.file_name, "
                "file_ext=excluded.file_ext, dem_str=excluded.dem_str, "
                "download_url=excluded.download_url, saved_path=excluded.saved_path, "
                "download_yn=excluded.download_yn, reg_at=excluded.reg_at" % self.t("attach"),
                (
                    dem_no,
                    a.get("file_name"),
                    a.get("file_path"),
                    a.get("file_ext"),
                    a.get("dem_str"),
                    a.get("download_url"),
                    saved.get(a.get("file_path")),
                    "Y" if a.get("file_path") in saved else "N",
                    now_str(),
                ),
            )
        self.conn.commit()

    def mark_detail_done(self, dem_no: int):
        self.conn.execute(
            "UPDATE %s SET detail_yn='Y', detail_at=? WHERE dem_no=?" % self.t("case_list"),
            (now_str(), dem_no),
        )
        self.conn.commit()

    # ------------------------------------------------------------------
    # Stats
    # ------------------------------------------------------------------
    def stats(self) -> dict:
        def one(sql, params=()):
            r = self.conn.execute(sql, params).fetchone()
            return r[0] if r and r[0] is not None else 0

        return {
            "case_list": one("SELECT COUNT(*) FROM %s" % self.t("case_list")),
            "case_list_done": one("SELECT COUNT(*) FROM %s WHERE detail_yn='Y'" % self.t("case_list")),
            "case": one("SELECT COUNT(*) FROM %s" % self.t("case")),
            "case_body": one("SELECT COUNT(*) FROM %s" % self.t("case_body")),
            "attach": one("SELECT COUNT(*) FROM %s" % self.t("attach")),
            "error": one("SELECT COUNT(*) FROM %s" % self.t("error_log")),
        }

    def semok_stats(self) -> list:
        sql = (
            "SELECT semok_code, COUNT(*) cnt, "
            "SUM(CASE WHEN detail_yn='Y' THEN 1 ELSE 0 END) done "
            "FROM %s GROUP BY semok_code ORDER BY semok_code" % self.t("case_list")
        )
        return [dict(r) for r in self.conn.execute(sql).fetchall()]