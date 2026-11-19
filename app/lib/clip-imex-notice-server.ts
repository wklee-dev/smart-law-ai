import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { normalizeClipCustomsChiefHsQuery } from "@/app/lib/clip-customs-chief-shared";
import {
  CLIP_IMEX_NOTICE_SORT_KEYS,
  type ClipImexNoticeListRow,
  type ClipImexNoticeMasterRow,
  type ClipImexNoticeQueryParams,
  type ClipImexNoticeSortKey,
  type ClipImexNoticeSummary,
} from "@/app/lib/clip-imex-notice-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export {
  type ClipImexNoticeListRow,
  type ClipImexNoticeMasterRow,
  type ClipImexNoticeQueryParams,
  type ClipImexNoticeSummary,
} from "@/app/lib/clip-imex-notice-shared";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

export function openClipImexNoticeDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p, { readOnly: true });
  if (!hasTable(db, "imex_notice_master")) {
    db.close();
    throw new Error(
      "imex_notice_master 테이블이 없습니다. customs_notice_crawler.py로 수출입공고를 수집하세요.",
    );
  }
  return db;
}

function normalizeSort(sort: string | null | undefined): ClipImexNoticeSortKey {
  const s = (sort ?? "hs_code").trim();
  return (CLIP_IMEX_NOTICE_SORT_KEYS as readonly string[]).includes(s)
    ? (s as ClipImexNoticeSortKey)
    : "hs_code";
}

const SORT_SQL: Record<ClipImexNoticeSortKey, string> = {
  hs_code: "TRIM(IFNULL(i.hs_code, ''))",
  item_name: "TRIM(IFNULL(i.item_name, ''))",
  imex_type_name: "TRIM(IFNULL(i.imex_type_name, ''))",
};

export function listClipImexNoticeMasters(
  db: DatabaseSync,
): ClipImexNoticeMasterRow[] {
  return db
    .prepare(
      `SELECT notice_key, notice_no, notice_date, pmgt_dt_tp_no, total_item_count
       FROM imex_notice_master
       ORDER BY notice_date DESC, notice_no DESC`,
    )
    .all()
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        notice_key: str(r.notice_key),
        notice_no: str(r.notice_no),
        notice_date: str(r.notice_date),
        pmgt_dt_tp_no: str(r.pmgt_dt_tp_no),
        total_item_count: num(r.total_item_count),
      };
    });
}

function buildWhere(params: ClipImexNoticeQueryParams): {
  sql: string;
  bind: unknown[];
} {
  const parts = ["i.notice_key = ?"];
  const bind: unknown[] = [params.noticeKey];

  const hs = normalizeClipCustomsChiefHsQuery(params.hsCode);
  if (hs) {
    parts.push("REPLACE(REPLACE(TRIM(IFNULL(i.hs_code, '')), '.', ''), '-', '') LIKE ?");
    bind.push(`${hs}%`);
  }

  const kw = str(params.keyword);
  if (kw) {
    parts.push(
      "(TRIM(IFNULL(i.guidance_text, '')) LIKE ? OR TRIM(IFNULL(i.item_name, '')) LIKE ?)",
    );
    bind.push(`%${kw}%`, `%${kw}%`);
  }

  const imexType = str(params.imexType);
  if (imexType === "01" || imexType === "02" || imexType === "03") {
    parts.push("TRIM(IFNULL(i.imex_type_code, '')) = ?");
    bind.push(imexType);
  }

  return { sql: parts.join(" AND "), bind };
}

export function queryClipImexNoticeItems(
  db: DatabaseSync,
  params: ClipImexNoticeQueryParams,
): { rows: ClipImexNoticeListRow[]; total: number } {
  const { sql: whereSql, bind } = buildWhere(params);
  const sort = normalizeSort(params.sort);
  const dir = params.sort_dir?.trim().toLowerCase() === "desc" ? "DESC" : "ASC";
  const page = Math.max(1, params.page);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize)));
  const offset = (page - 1) * pageSize;

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM imex_notice_item i WHERE ${whereSql}`)
    .get(...bind) as { c: number } | undefined;
  const total = num(totalRow?.c);

  const rows = db
    .prepare(
      `SELECT i.notice_item_key, i.hs_code, i.item_name, i.guidance_text,
              i.guidance_html, i.imex_type_code, i.imex_type_name, i.relation_rule_name
       FROM imex_notice_item i
       WHERE ${whereSql}
       ORDER BY ${SORT_SQL[sort]} ${dir}, i.notice_item_key ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, offset)
    .map((row) => {
      const r = row as Record<string, unknown>;
      return {
        notice_item_key: str(r.notice_item_key),
        hs_code: str(r.hs_code),
        item_name: str(r.item_name),
        guidance_text: str(r.guidance_text),
        guidance_html: str(r.guidance_html),
        imex_type_code: str(r.imex_type_code),
        imex_type_name: str(r.imex_type_name),
        relation_rule_name: str(r.relation_rule_name),
      };
    });

  return { rows, total };
}

export function getClipImexNoticeSummary(
  db: DatabaseSync,
  noticeKey: string,
): ClipImexNoticeSummary | null {
  if (!hasTable(db, "imex_notice_summary")) return null;
  const row = db
    .prepare(
      `SELECT notice_key, content_html, content_text
       FROM imex_notice_summary WHERE notice_key = ?`,
    )
    .get(noticeKey) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    notice_key: str(row.notice_key),
    content_html: rewriteClipPortalHtml(str(row.content_html)),
    content_text: str(row.content_text),
  };
}

export function countClipImexNoticeItems(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM imex_notice_item")
    .get() as { c: number } | undefined;
  return num(row?.c);
}

/** 포털 상대 경로 → 절대 URL */
export function rewriteClipPortalHtml(html: string): string {
  if (!html.trim()) return "";
  return html.replace(
    /\s(href|src)=(['"])\/(clip\/[^'"]+)\2/gi,
    " $1=$2https://unipass.customs.go.kr/$3$2",
  );
}
