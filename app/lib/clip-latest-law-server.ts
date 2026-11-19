import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolveClipLatestLawAttachmentPath } from "@/app/lib/clip-latest-law-attach-path";
import {
  CLIP_LATEST_LAW_SORT_KEYS,
  CLIP_LATEST_LAW_TYPE_TABS,
  type ClipLatestLawAttachmentRow,
  type ClipLatestLawDetail,
  type ClipLatestLawListRow,
  type ClipLatestLawQueryParams,
  type ClipLatestLawSortKey,
  type ClipLatestLawTabCounts,
  type ClipLatestLawTypeCode,
} from "@/app/lib/clip-latest-law-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export {
  CLIP_LATEST_LAW_SORT_KEYS,
  CLIP_LATEST_LAW_TYPE_TABS,
  clipLatestLawRowKey,
  parseClipLatestLawRowKey,
  type ClipLatestLawAttachmentRow,
  type ClipLatestLawDetail,
  type ClipLatestLawListRow,
  type ClipLatestLawQueryParams,
  type ClipLatestLawSortKey,
  type ClipLatestLawTabCounts,
  type ClipLatestLawTypeCode,
} from "@/app/lib/clip-latest-law-shared";

const TABLE = "latest_laws";
const ATTACH_TABLE = "latest_law_attachments";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

export function clipLatestLawTableReady(db: DatabaseSync): boolean {
  return hasTable(db, TABLE);
}

export function openClipLatestLawDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly: true });
}

function mapListRow(row: Record<string, unknown>): ClipLatestLawListRow {
  return {
    law_id: str(row.law_id),
    pmgt_dt_tp_no: str(row.pmgt_dt_tp_no),
    law_name: str(row.law_name),
    category_name: str(row.category_name),
    law_type_name: str(row.law_type_name),
    jurisdiction_name: str(row.jurisdiction_name),
    enforcement_date: str(row.enforcement_date),
    promulgation_date: str(row.promulgation_date),
    revision_type_name: str(row.revision_type_name),
    detail_url: str(row.detail_url),
  };
}

function normalizeSort(raw: string | null | undefined): ClipLatestLawSortKey {
  const s = (raw ?? "promulgation_date").trim();
  return (CLIP_LATEST_LAW_SORT_KEYS as readonly string[]).includes(s)
    ? (s as ClipLatestLawSortKey)
    : "promulgation_date";
}

function normalizeDir(d: string | null | undefined): "ASC" | "DESC" {
  return d?.trim().toLowerCase() === "asc" ? "ASC" : "DESC";
}

const SORT_SQL: Record<ClipLatestLawSortKey, string> = {
  law_name: "law_name",
  category_name: "category_name",
  law_type_name: "law_type_name",
  jurisdiction_name: "jurisdiction_name",
  enforcement_date: "enforcement_date",
  promulgation_date: "promulgation_date",
  revision_type_name: "revision_type_name",
};

function buildWhere(
  p: ClipLatestLawQueryParams,
  bind: unknown[],
): string {
  const where: string[] = [];
  const tab = p.lawTypeTab;
  if (tab && tab !== "ALL") {
    where.push("law_type_code = ?");
    bind.push(tab);
  }
  const category = str(p.category);
  if (category) {
    where.push("category_name = ?");
    bind.push(category);
  }
  const jurisdiction = str(p.jurisdiction);
  if (jurisdiction) {
    where.push("jurisdiction_name = ?");
    bind.push(jurisdiction);
  }
  const lawName = str(p.lawName);
  if (lawName) {
    where.push("law_name LIKE ?");
    bind.push(`%${lawName}%`);
  }
  return where.length ? `WHERE ${where.join(" AND ")}` : "";
}

export function clipLatestLawTabCounts(db: DatabaseSync): ClipLatestLawTabCounts {
  if (!clipLatestLawTableReady(db)) {
    return { 전체: 0, 법률: 0, 시행령: 0, 시행규칙: 0 };
  }
  const rows = db
    .prepare(
      `SELECT law_type_code, COUNT(*) AS c FROM ${TABLE} GROUP BY law_type_code`,
    )
    .all() as { law_type_code: string; c: number }[];
  const out: ClipLatestLawTabCounts = {
    전체: 0,
    법률: 0,
    시행령: 0,
    시행규칙: 0,
  };
  for (const r of rows) {
    const c = num(r.c);
    out.전체 += c;
    if (r.law_type_code === "A01") out.법률 = c;
    else if (r.law_type_code === "A02") out.시행령 = c;
    else if (r.law_type_code === "A03") out.시행규칙 = c;
  }
  return out;
}

export function clipLatestLawDistinctFilters(db: DatabaseSync): {
  categories: string[];
  jurisdictions: string[];
} {
  if (!clipLatestLawTableReady(db)) {
    return { categories: [], jurisdictions: [] };
  }
  const categories = db
    .prepare(
      `SELECT DISTINCT category_name AS v FROM ${TABLE}
       WHERE category_name IS NOT NULL AND TRIM(category_name) <> ''
       ORDER BY v COLLATE NOCASE`,
    )
    .all()
    .map((r) => str((r as Record<string, unknown>).v))
    .filter(Boolean);
  const jurisdictions = db
    .prepare(
      `SELECT DISTINCT jurisdiction_name AS v FROM ${TABLE}
       WHERE jurisdiction_name IS NOT NULL AND TRIM(jurisdiction_name) <> ''
       ORDER BY v COLLATE NOCASE`,
    )
    .all()
    .map((r) => str((r as Record<string, unknown>).v))
    .filter(Boolean);
  return { categories, jurisdictions };
}

export function queryClipLatestLaws(
  db: DatabaseSync,
  p: ClipLatestLawQueryParams,
): { rows: ClipLatestLawListRow[]; total: number } {
  if (!clipLatestLawTableReady(db)) {
    return { rows: [], total: 0 };
  }

  const page = Math.max(1, Math.floor(p.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(p.pageSize) || 10));
  const sort = normalizeSort(p.sort);
  const dir = normalizeDir(p.sort_dir);
  const bind: unknown[] = [];
  const whereSql = buildWhere(p, bind);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM ${TABLE} ${whereSql}`)
    .get(...bind) as { n: number };
  const total = num(totalRow?.n);

  const orderCol = SORT_SQL[sort];
  const rows = db
    .prepare(
      `SELECT law_id, pmgt_dt_tp_no, law_name, category_name, law_type_name,
              jurisdiction_name, enforcement_date, promulgation_date,
              revision_type_name, detail_url
       FROM ${TABLE}
       ${whereSql}
       ORDER BY ${orderCol} ${dir}, promulgation_date DESC, law_id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, (page - 1) * pageSize)
    .map((row) => mapListRow(row as Record<string, unknown>));

  return { rows, total };
}

function listAttachments(
  db: DatabaseSync,
  lawId: string,
  pmgtDtTpNo: string,
): ClipLatestLawAttachmentRow[] {
  if (!hasTable(db, ATTACH_TABLE)) return [];
  return db
    .prepare(
      `SELECT attachment_id, attachment_label, attachment_kind, original_filename,
              byte_size, saved_relative_path, status
       FROM ${ATTACH_TABLE}
       WHERE law_id = ? AND pmgt_dt_tp_no = ?
       ORDER BY attachment_label ASC`,
    )
    .all(lawId, pmgtDtTpNo)
    .map((row) => {
      const r = row as Record<string, unknown>;
      const rel = str(r.saved_relative_path);
      let hasLocal = false;
      if (rel && str(r.status) === "downloaded") {
        try {
          const abs = resolveClipLatestLawAttachmentPath(rel);
          hasLocal = fs.existsSync(abs);
        } catch {
          hasLocal = false;
        }
      }
      return {
        attachment_id: str(r.attachment_id),
        attachment_label: str(r.attachment_label),
        attachment_kind: str(r.attachment_kind),
        original_filename: str(r.original_filename),
        byte_size: num(r.byte_size),
        has_local_file: hasLocal,
      };
    });
}

export function getClipLatestLawDetail(
  db: DatabaseSync,
  lawId: string,
  pmgtDtTpNo: string,
): ClipLatestLawDetail | null {
  if (!clipLatestLawTableReady(db)) return null;
  const row = db
    .prepare(
      `SELECT law_id, pmgt_dt_tp_no, law_name, category_name, law_type_name,
              jurisdiction_name, enforcement_date, promulgation_date,
              revision_type_name, detail_url, law_body_html, law_body_text,
              revision_reason_html
       FROM ${TABLE}
       WHERE law_id = ? AND pmgt_dt_tp_no = ?`,
    )
    .get(lawId, pmgtDtTpNo) as Record<string, unknown> | undefined;
  if (!row) return null;
  const base = mapListRow(row);
  return {
    ...base,
    law_body_html: str(row.law_body_html),
    law_body_text: str(row.law_body_text),
    revision_reason_html: str(row.revision_reason_html),
    attachments: listAttachments(db, lawId, pmgtDtTpNo),
  };
}

export function getClipLatestLawAttachmentForDownload(
  db: DatabaseSync,
  attachmentId: string,
): {
  attachment_id: string;
  original_filename: string;
  saved_relative_path: string;
  source_url: string;
} | null {
  if (!hasTable(db, ATTACH_TABLE)) return null;
  const id = str(attachmentId);
  if (!id) return null;
  const row = db
    .prepare(
      `SELECT attachment_id, original_filename, saved_relative_path, source_url, status
       FROM ${ATTACH_TABLE}
       WHERE attachment_id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row || str(row.status) !== "downloaded") return null;
  return {
    attachment_id: id,
    original_filename: str(row.original_filename),
    saved_relative_path: str(row.saved_relative_path),
    source_url: str(row.source_url),
  };
}
