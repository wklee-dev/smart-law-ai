import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  CLIP_WORLD_HS_CLASSIFICATION_CASE_SORT_KEYS,
  type ClipWorldHsClassificationCaseDetail,
  type ClipWorldHsClassificationCaseListRow,
  type ClipWorldHsClassificationCaseQueryParams,
  type ClipWorldHsClassificationCaseSortKey,
} from "@/app/lib/clip-world-hs-classification-cases-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export {
  CLIP_WORLD_HS_CLASSIFICATION_CASE_SORT_KEYS,
  CLIP_WORLD_HS_CLASSIFICATION_COUNTRY_FLAG,
  type ClipWorldHsClassificationCaseDetail,
  type ClipWorldHsClassificationCaseListRow,
  type ClipWorldHsClassificationCaseQueryParams,
  type ClipWorldHsClassificationCaseSortKey,
} from "@/app/lib/clip-world-hs-classification-cases-shared";

const TABLE = "world_hs_classification_cases";
const ATTACH_TABLE = "world_hs_case_attachments";

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

export function openClipWorldHsClassificationCasesDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly: true });
}

export function worldHsClassificationCasesTableReady(db: DatabaseSync): boolean {
  return hasTable(db, TABLE);
}

function normalizeSort(
  sort: string | null | undefined,
): ClipWorldHsClassificationCaseSortKey {
  const s = (sort ?? "registered_date").trim();
  return (
    CLIP_WORLD_HS_CLASSIFICATION_CASE_SORT_KEYS as readonly string[]
  ).includes(s)
    ? (s as ClipWorldHsClassificationCaseSortKey)
    : "registered_date";
}

function normalizeDir(d: string | null | undefined): "ASC" | "DESC" {
  return d?.trim().toLowerCase() === "asc" ? "ASC" : "DESC";
}

const SORT_SQL: Record<ClipWorldHsClassificationCaseSortKey, string> = {
  registered_date: "registered_date",
  view_count: "view_count",
  title: "title",
};

function mapListRow(row: Record<string, unknown>): ClipWorldHsClassificationCaseListRow {
  return {
    case_id: str(row.case_id),
    title: str(row.title),
    country: str(row.country),
    effective_period: str(row.effective_period),
    registered_date: str(row.registered_date),
    view_count: num(row.view_count),
  };
}

export function listClipWorldHsClassificationCaseCountries(
  db: DatabaseSync,
): string[] {
  if (!worldHsClassificationCasesTableReady(db)) return [];
  return db
    .prepare(
      `SELECT DISTINCT country FROM ${TABLE}
       WHERE country IS NOT NULL AND TRIM(country) <> ''
       ORDER BY country ASC`,
    )
    .all()
    .map((row) => str((row as Record<string, unknown>).country))
    .filter(Boolean);
}

export function listClipWorldHsClassificationCaseEffectivePeriods(
  db: DatabaseSync,
): string[] {
  if (!worldHsClassificationCasesTableReady(db)) return [];
  return db
    .prepare(
      `SELECT DISTINCT effective_period FROM ${TABLE}
       WHERE effective_period IS NOT NULL AND TRIM(effective_period) <> ''
       ORDER BY effective_period DESC`,
    )
    .all()
    .map((row) => str((row as Record<string, unknown>).effective_period))
    .filter(Boolean);
}

export function queryClipWorldHsClassificationCases(
  db: DatabaseSync,
  params: ClipWorldHsClassificationCaseQueryParams,
): { rows: ClipWorldHsClassificationCaseListRow[]; total: number } {
  if (!worldHsClassificationCasesTableReady(db)) {
    return { rows: [], total: 0 };
  }

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const sort = normalizeSort(params.sort);
  const dir = normalizeDir(params.sort_dir);

  const where: string[] = [];
  const bind: unknown[] = [];

  const registeredFrom = str(params.registeredFrom);
  const registeredTo = str(params.registeredTo);
  if (registeredFrom) {
    where.push("registered_date >= ?");
    bind.push(registeredFrom);
  }
  if (registeredTo) {
    where.push("registered_date <= ?");
    bind.push(registeredTo);
  }

  const country = str(params.country);
  if (country) {
    where.push("country = ?");
    bind.push(country);
  }

  const effectivePeriod = str(params.effectivePeriod);
  if (effectivePeriod) {
    where.push("effective_period = ?");
    bind.push(effectivePeriod);
  }

  const keyword = str(params.keyword);
  const keywordField = str(params.keywordField) || "title";
  if (keyword) {
    if (keywordField === "content") {
      where.push("(title LIKE ? OR content_text LIKE ?)");
      const like = `%${keyword}%`;
      bind.push(like, like);
    } else {
      where.push("title LIKE ?");
      bind.push(`%${keyword}%`);
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM ${TABLE} ${whereSql}`)
    .get(...bind) as { n: number };
  const total = num(totalRow?.n);

  const orderCol = SORT_SQL[sort];
  const rows = db
    .prepare(
      `SELECT case_id, title, country, effective_period, registered_date, view_count
       FROM ${TABLE}
       ${whereSql}
       ORDER BY ${orderCol} ${dir}, case_id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, (page - 1) * pageSize)
    .map((row) => mapListRow(row as Record<string, unknown>));

  return { rows, total };
}

function listAttachmentsForCase(
  db: DatabaseSync,
  caseId: string,
): ClipWorldHsClassificationCaseAttachment[] {
  if (!hasTable(db, ATTACH_TABLE)) return [];
  return db
    .prepare(
      `SELECT attachment_id, original_file_name, displayed_size, local_path
       FROM ${ATTACH_TABLE}
       WHERE case_id = ?
       ORDER BY original_file_name ASC`,
    )
    .all(caseId)
    .map((row) => {
      const r = row as Record<string, unknown>;
      const local = str(r.local_path);
      return {
        attachment_id: str(r.attachment_id),
        original_file_name: str(r.original_file_name),
        displayed_size: str(r.displayed_size),
        has_local_file: Boolean(local && fs.existsSync(local)),
      };
    });
}

export function getClipWorldHsClassificationCaseAttachmentFile(
  db: DatabaseSync,
  attachmentId: string,
): {
  attachment_id: string;
  case_id: string;
  original_file_name: string;
  local_path: string;
  download_url: string;
} | null {
  if (!hasTable(db, ATTACH_TABLE)) return null;
  const id = str(attachmentId);
  if (!id) return null;
  const row = db
    .prepare(
      `SELECT attachment_id, case_id, original_file_name, local_path, download_url
       FROM ${ATTACH_TABLE}
       WHERE attachment_id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    attachment_id: str(row.attachment_id),
    case_id: str(row.case_id),
    original_file_name: str(row.original_file_name),
    local_path: str(row.local_path),
    download_url: str(row.download_url),
  };
}

export function getClipWorldHsClassificationCaseDetail(
  db: DatabaseSync,
  caseId: string,
): ClipWorldHsClassificationCaseDetail | null {
  if (!worldHsClassificationCasesTableReady(db)) return null;
  const id = str(caseId);
  if (!id) return null;
  const row = db
    .prepare(
      `SELECT case_id, title, country, effective_period, registered_date, registered_by,
              view_count, content_html, content_text, source_url
       FROM ${TABLE}
       WHERE case_id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    case_id: str(row.case_id),
    title: str(row.title),
    country: str(row.country),
    effective_period: str(row.effective_period),
    registered_date: str(row.registered_date),
    registered_by: str(row.registered_by),
    view_count: num(row.view_count),
    content_html: str(row.content_html),
    content_text: str(row.content_text),
    source_url: str(row.source_url),
    attachments: listAttachmentsForCase(db, id),
  };
}
