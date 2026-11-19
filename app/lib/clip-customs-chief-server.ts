import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import {
  CLIP_CUSTOMS_CHIEF_SORT_KEYS,
  type ClipCustomsChiefDetail,
  type ClipCustomsChiefGuideDocRow,
  type ClipCustomsChiefListRow,
  type ClipCustomsChiefQueryParams,
  type ClipCustomsChiefSectionRow,
  type ClipCustomsChiefSortKey,
} from "@/app/lib/clip-customs-chief-shared";

export {
  type ClipCustomsChiefDetail,
  type ClipCustomsChiefGuideDocRow,
  type ClipCustomsChiefListRow,
  type ClipCustomsChiefQueryParams,
  type ClipCustomsChiefSectionRow,
} from "@/app/lib/clip-customs-chief-shared";

const DEFAULT_ATTACH_ROOT = "C:/SQLiteDB/attachments/세관장확인사항";

const CREATE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS clip_cc_crawl_run (
  run_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  program_version TEXT NOT NULL,
  source_name TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  statistics_json TEXT,
  error_summary TEXT
);
CREATE TABLE IF NOT EXISTS clip_cc_item_requirement (
  requirement_id INTEGER PRIMARY KEY,
  source_key TEXT NOT NULL UNIQUE,
  hs_sgn TEXT NOT NULL,
  item_name TEXT,
  imex_tpcd TEXT,
  imex_name TEXT,
  requirement_document_name TEXT,
  related_law_name TEXT,
  law_record_no TEXT,
  law_kind_code TEXT,
  requirement_law_code TEXT,
  application_start_dt TEXT,
  application_end_dt TEXT,
  target_detail_text TEXT,
  extension_reason_text TEXT,
  raw_json TEXT NOT NULL DEFAULT '{}',
  source_url TEXT NOT NULL DEFAULT '',
  first_collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_run_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_clip_cc_requirement_hs_sgn ON clip_cc_item_requirement(hs_sgn);
CREATE INDEX IF NOT EXISTS idx_clip_cc_requirement_dates ON clip_cc_item_requirement(application_start_dt, application_end_dt);
CREATE INDEX IF NOT EXISTS idx_clip_cc_requirement_law ON clip_cc_item_requirement(related_law_name);
CREATE TABLE IF NOT EXISTS clip_cc_requirement_agency (
  agency_id INTEGER PRIMARY KEY,
  requirement_id INTEGER NOT NULL,
  application_start_dt TEXT,
  application_end_dt TEXT,
  agency_name TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  raw_html TEXT NOT NULL DEFAULT '',
  first_collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_run_id TEXT NOT NULL DEFAULT '',
  UNIQUE(requirement_id, application_start_dt, application_end_dt, agency_name)
);
CREATE INDEX IF NOT EXISTS idx_clip_cc_agency_name ON clip_cc_requirement_agency(agency_name);
CREATE TABLE IF NOT EXISTS clip_cc_integrated_info (
  integrated_info_id INTEGER PRIMARY KEY,
  section_key TEXT NOT NULL UNIQUE,
  section_order INTEGER NOT NULL,
  section_title TEXT NOT NULL,
  section_level TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT NOT NULL,
  content_hash TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  first_collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_run_id TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS clip_cc_guide_content (
  guide_content_id INTEGER PRIMARY KEY,
  section_key TEXT NOT NULL UNIQUE,
  section_order INTEGER NOT NULL,
  section_title TEXT NOT NULL,
  section_level TEXT NOT NULL,
  body_text TEXT NOT NULL,
  body_html TEXT NOT NULL,
  content_hash TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  first_collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_run_id TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS clip_cc_guide_document (
  guide_document_id INTEGER PRIMARY KEY,
  source_url TEXT NOT NULL UNIQUE,
  document_type TEXT NOT NULL,
  document_title TEXT NOT NULL,
  attachment_file_id TEXT,
  local_path TEXT,
  content_type TEXT,
  file_size_bytes INTEGER,
  sha256 TEXT,
  download_status TEXT NOT NULL,
  error_message TEXT,
  first_collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_collected_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_run_id TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_clip_cc_guide_document_status ON clip_cc_guide_document(download_status);
`;

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function stmtRun(db: DatabaseSync, sql: string, params: unknown[] = []) {
  return db.prepare(sql).run(...params);
}

function executeSql(db: DatabaseSync, sql: string): void {
  for (const statement of sql
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)) {
    stmtRun(db, statement);
  }
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name?: string } | undefined;
  return Boolean(row?.name);
}

export function ensureClipCustomsChiefSchema(db: DatabaseSync): void {
  executeSql(db, CREATE_SCHEMA_SQL);
}

export function openClipCustomsChiefDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p);
  ensureClipCustomsChiefSchema(db);
  return db;
}

export function clipCustomsChiefTableReady(db: DatabaseSync): boolean {
  return hasTable(db, "clip_cc_item_requirement");
}

export function countClipCustomsChiefItems(db: DatabaseSync): number {
  if (!hasTable(db, "clip_cc_item_requirement")) return 0;
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM clip_cc_item_requirement")
    .get() as { n: number };
  return num(row?.n);
}

function normalizeSort(sort: string | null | undefined): ClipCustomsChiefSortKey {
  const s = (sort ?? "hs_sgn").trim();
  return (CLIP_CUSTOMS_CHIEF_SORT_KEYS as readonly string[]).includes(s)
    ? (s as ClipCustomsChiefSortKey)
    : "hs_sgn";
}

function normalizeDir(d: string | null | undefined): "ASC" | "DESC" {
  return d?.trim().toLowerCase() === "desc" ? "DESC" : "ASC";
}

const SORT_SQL: Record<ClipCustomsChiefSortKey, string> = {
  hs_sgn: "hs_sgn",
  item_name: "item_name",
  requirement_document_name: "requirement_document_name",
  related_law_name: "related_law_name",
  application_start_dt: "application_start_dt",
  application_end_dt: "application_end_dt",
  imex_name: "imex_name",
};

function buildWhere(params: ClipCustomsChiefQueryParams): {
  whereSql: string;
  bind: unknown[];
} {
  const where: string[] = [];
  const bind: unknown[] = [];

  const hs = str(params.hsCode).replace(/\D/g, "");
  if (hs) {
    where.push("hs_sgn LIKE ?");
    bind.push(`${hs}%`);
  }

  const doc = str(params.requirementDoc);
  if (doc) {
    where.push("requirement_document_name LIKE ?");
    bind.push(`%${doc}%`);
  }

  const law = str(params.relatedLaw);
  if (law) {
    where.push("related_law_name LIKE ?");
    bind.push(`%${law}%`);
  }

  const imex = str(params.imex);
  if (imex === "E" || imex === "I") {
    where.push("(imex_tpcd = ? OR imex_name LIKE ?)");
    bind.push(imex, imex === "E" ? "%수출%" : "%수입%");
  }

  if (!params.includeHistory) {
    where.push(
      "(application_end_dt >= date('now') OR application_end_dt LIKE '2999%' OR application_end_dt = '')",
    );
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    bind,
  };
}

export function queryClipCustomsChiefItems(
  db: DatabaseSync,
  params: ClipCustomsChiefQueryParams,
): { rows: ClipCustomsChiefListRow[]; total: number } {
  if (!hasTable(db, "clip_cc_item_requirement")) {
    return { rows: [], total: 0 };
  }

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const sort = normalizeSort(params.sort);
  const dir = normalizeDir(params.sort_dir);
  const { whereSql, bind } = buildWhere(params);

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM clip_cc_item_requirement ${whereSql}`)
    .get(...bind) as { n: number };
  const total = num(totalRow?.n);

  const orderCol = SORT_SQL[sort];
  const secondary =
    sort === "hs_sgn" ? ", application_start_dt DESC" : ", hs_sgn ASC";

  const rows = db
    .prepare(
      `SELECT requirement_id, hs_sgn, item_name, requirement_document_name,
              related_law_name, application_start_dt, application_end_dt, imex_name
       FROM clip_cc_item_requirement
       ${whereSql}
       ORDER BY ${orderCol} ${dir}${secondary}, requirement_id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, (page - 1) * pageSize) as ClipCustomsChiefListRow[];

  return { rows, total };
}

export function getClipCustomsChiefDetail(
  db: DatabaseSync,
  requirementId: number,
): ClipCustomsChiefDetail | null {
  if (!hasTable(db, "clip_cc_item_requirement")) return null;

  const row = db
    .prepare(
      `SELECT requirement_id, hs_sgn, item_name, requirement_document_name,
              related_law_name, application_start_dt, application_end_dt,
              imex_name, imex_tpcd, target_detail_text, extension_reason_text, law_record_no
       FROM clip_cc_item_requirement WHERE requirement_id = ?`,
    )
    .get(requirementId) as ClipCustomsChiefDetail | undefined;

  if (!row) return null;

  const agencies = hasTable(db, "clip_cc_requirement_agency")
    ? ((db
        .prepare(
          `SELECT agency_id, application_start_dt, application_end_dt, agency_name
           FROM clip_cc_requirement_agency
           WHERE requirement_id = ?
           ORDER BY application_start_dt, agency_name`,
        )
        .all(requirementId) as ClipCustomsChiefDetail["agencies"]) ?? [])
    : [];

  return { ...row, agencies };
}

export function listClipCustomsChiefIntegrated(
  db: DatabaseSync,
): ClipCustomsChiefSectionRow[] {
  if (!hasTable(db, "clip_cc_integrated_info")) return [];
  return db
    .prepare(
      `SELECT section_order, section_title, section_level, body_html, body_text
       FROM clip_cc_integrated_info ORDER BY section_order ASC`,
    )
    .all() as ClipCustomsChiefSectionRow[];
}

export function listClipCustomsChiefGuideSections(
  db: DatabaseSync,
): ClipCustomsChiefSectionRow[] {
  if (!hasTable(db, "clip_cc_guide_content")) return [];
  return db
    .prepare(
      `SELECT section_order, section_title, section_level, body_html, body_text
       FROM clip_cc_guide_content ORDER BY section_order ASC`,
    )
    .all() as ClipCustomsChiefSectionRow[];
}

export function listClipCustomsChiefGuideDocuments(
  db: DatabaseSync,
): ClipCustomsChiefGuideDocRow[] {
  if (!hasTable(db, "clip_cc_guide_document")) return [];
  return db
    .prepare(
      `SELECT guide_document_id, document_title, document_type, download_status,
              local_path, attachment_file_id
       FROM clip_cc_guide_document
       ORDER BY document_title ASC`,
    )
    .all() as ClipCustomsChiefGuideDocRow[];
}

export function getClipCustomsChiefGuideFilePath(
  db: DatabaseSync,
  guideDocumentId: number,
): { filePath: string; fileName: string; contentType: string } | null {
  if (!hasTable(db, "clip_cc_guide_document")) return null;
  const row = db
    .prepare(
      `SELECT local_path, document_title, content_type, download_status
       FROM clip_cc_guide_document WHERE guide_document_id = ?`,
    )
    .get(guideDocumentId) as
    | {
        local_path: string | null;
        document_title: string;
        content_type: string | null;
        download_status: string;
      }
    | undefined;

  if (!row?.local_path || row.download_status !== "DOWNLOADED") return null;

  const resolved = path.resolve(row.local_path);
  const attachRoot = path.resolve(
    process.env.CLIP_CC_ATTACH_DIR?.trim() ||
      process.env.SMART_LAW_ATTACH_DIR?.trim() ||
      DEFAULT_ATTACH_ROOT,
  );
  if (!resolved.startsWith(attachRoot) && !fs.existsSync(resolved)) {
    // allow absolute paths recorded by crawler under attachments tree
    const alt = path.resolve(DEFAULT_ATTACH_ROOT, "..", path.basename(resolved));
    if (!fs.existsSync(resolved) && fs.existsSync(alt)) {
      return {
        filePath: alt,
        fileName: path.basename(alt),
        contentType: row.content_type ?? "application/octet-stream",
      };
    }
  }
  if (!fs.existsSync(resolved)) return null;

  return {
    filePath: resolved,
    fileName: path.basename(resolved) || `${row.document_title}.pdf`,
    contentType: row.content_type ?? "application/pdf",
  };
}
