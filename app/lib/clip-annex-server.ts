import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import {
  CLIP_ANNEX_SORT_KEYS,
  CLIP_ANNEX_TYPE_TABS,
  clipAnnexTypeLabel,
  type ClipAnnexDetail,
  type ClipAnnexFileRow,
  type ClipAnnexListRow,
  type ClipAnnexQueryParams,
  type ClipAnnexSortKey,
  type ClipAnnexTabCounts,
  type ClipAnnexTabKey,
  type ClipAnnexTypeCode,
} from "@/app/lib/clip-annex-shared";

export {
  CLIP_ANNEX_TYPE_TABS,
  clipAnnexTypeLabel,
  formatClipAnnexDate,
  type ClipAnnexDetail,
  type ClipAnnexFileRow,
  type ClipAnnexListRow,
  type ClipAnnexQueryParams,
  type ClipAnnexSortKey,
  type ClipAnnexTabCounts,
  type ClipAnnexTabKey,
} from "@/app/lib/clip-annex-shared";

const DEFAULT_ATTACH_ROOT = "C:/SQLiteDB/ATTACH";
const LAW_KIND_LABEL = "행정규칙";

function stmtAll<T extends Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T[] {
  const rows = db.prepare(sql).all(...params) as T[];
  return rows ?? [];
}

function stmtGet<T extends Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

function hasAnnexTable(db: DatabaseSync): boolean {
  const row = stmtGet<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='clip_annex_forms'",
  );
  return Boolean(row?.name);
}

export function getClipAnnexAttachRoot(): string {
  return (
    process.env.CLIP_ANNEX_ATTACH_DIR?.trim() ||
    process.env.SMART_LAW_ATTACH_DIR?.trim() ||
    DEFAULT_ATTACH_ROOT
  );
}

export function openClipAnnexDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`별표/서식 DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p);
  if (!hasAnnexTable(db)) {
    db.close();
    throw new Error(
      "clip_annex_forms 테이블이 없습니다. clip_annex_crawler.py로 별표/서식 데이터를 수집하세요.",
    );
  }
  return db;
}

function normalizeSort(sort: string | null | undefined): ClipAnnexSortKey {
  const s = (sort ?? "effective_date").trim();
  return (CLIP_ANNEX_SORT_KEYS as readonly string[]).includes(s)
    ? (s as ClipAnnexSortKey)
    : "effective_date";
}

function normalizeDir(d: string | null | undefined): "asc" | "desc" {
  return d?.trim().toLowerCase() === "asc" ? "asc" : "desc";
}

const SORT_SQL: Record<ClipAnnexSortKey, string> = {
  law_name: "TRIM(IFNULL(f.law_name, ''))",
  annex_type_code: "TRIM(IFNULL(f.annex_type_code, ''))",
  form_title: "TRIM(IFNULL(f.form_title, ''))",
  effective_date: "TRIM(IFNULL(f.effective_date, ''))",
};

function buildWhere(params: ClipAnnexQueryParams): {
  sql: string;
  binds: unknown[];
} {
  const parts: string[] = ["1=1"];
  const binds: unknown[] = [];

  if (params.tab !== "ALL") {
    parts.push("TRIM(IFNULL(f.annex_type_code, '')) = ?");
    binds.push(params.tab);
  }
  if (params.lawName.trim()) {
    parts.push("TRIM(IFNULL(f.law_name, '')) LIKE ?");
    binds.push(`%${params.lawName.trim()}%`);
  }
  if (params.formTitle.trim()) {
    parts.push("TRIM(IFNULL(f.form_title, '')) LIKE ?");
    binds.push(`%${params.formTitle.trim()}%`);
  }

  return { sql: parts.join(" AND "), binds };
}

function mapListRow(r: Record<string, unknown>): ClipAnnexListRow {
  const annexTypeCode = String(r.annex_type_code ?? "");
  const pdfId = String(r.pdf_attachment_id ?? "");
  const hwpId = String(r.hwp_attachment_id ?? "");
  return {
    form_key: String(r.form_key ?? ""),
    law_name: String(r.law_name ?? ""),
    annex_type_code: annexTypeCode,
    annex_type_label: clipAnnexTypeLabel(annexTypeCode),
    form_title: String(r.form_title ?? ""),
    effective_date: String(r.effective_date ?? ""),
    law_kind_label: LAW_KIND_LABEL,
    has_pdf: Boolean(pdfId),
    has_hwp: Boolean(hwpId),
    pdf_attachment_id: pdfId,
    hwp_attachment_id: hwpId,
  };
}

export function clipAnnexTabCounts(db: DatabaseSync): ClipAnnexTabCounts {
  const rows = stmtAll<{ annex_type_code: string | null; n: number }>(
    db,
    `SELECT TRIM(IFNULL(annex_type_code, '')) AS annex_type_code, COUNT(*) AS n
     FROM clip_annex_forms
     GROUP BY TRIM(IFNULL(annex_type_code, ''))`,
  );
  const out: ClipAnnexTabCounts = {
    ALL: 0,
    "01": 0,
    "02": 0,
    "03": 0,
    "04": 0,
  };
  for (const row of rows) {
    const code = (row.annex_type_code ?? "").trim();
    const n = Number(row.n) || 0;
    out.ALL += n;
    if ((CLIP_ANNEX_TYPE_TABS as readonly { code: string }[]).some((t) => t.code === code)) {
      out[code as ClipAnnexTypeCode] = n;
    }
  }
  return out;
}

export function queryClipAnnexForms(
  db: DatabaseSync,
  params: ClipAnnexQueryParams,
): { rows: ClipAnnexListRow[]; total: number } {
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize)));
  const offset = (page - 1) * pageSize;
  const sort = normalizeSort(params.sort);
  const dir = normalizeDir(params.sort_dir);
  const { sql: whereSql, binds } = buildWhere(params);

  const totalRow = stmtGet<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM clip_annex_forms AS f WHERE ${whereSql}`,
    binds,
  );
  const total = Number(totalRow?.n) || 0;

  const rows = stmtAll<Record<string, unknown>>(
    db,
    `SELECT
       f.form_key,
       f.law_name,
       f.annex_type_code,
       f.form_title,
       f.effective_date,
       (
         SELECT a.attachment_id FROM clip_annex_files AS a
         WHERE a.form_key = f.form_key AND a.file_type = 'pdf' AND a.download_status = 'downloaded'
         LIMIT 1
       ) AS pdf_attachment_id,
       (
         SELECT a.attachment_id FROM clip_annex_files AS a
         WHERE a.form_key = f.form_key AND a.file_type = 'hwp' AND a.download_status = 'downloaded'
         LIMIT 1
       ) AS hwp_attachment_id
     FROM clip_annex_forms AS f
     WHERE ${whereSql}
     ORDER BY ${SORT_SQL[sort]} ${dir}, f.form_key ASC
     LIMIT ? OFFSET ?`,
    [...binds, pageSize, offset],
  );

  return { rows: rows.map(mapListRow), total };
}

function mapFileRow(r: Record<string, unknown>): ClipAnnexFileRow {
  return {
    attachment_id: String(r.attachment_id ?? ""),
    file_type: String(r.file_type ?? ""),
    original_filename: String(r.original_filename ?? ""),
    download_status: String(r.download_status ?? ""),
    byte_size: r.byte_size == null ? null : Number(r.byte_size),
    last_error: String(r.last_error ?? ""),
  };
}

export function getClipAnnexDetail(
  db: DatabaseSync,
  formKey: string,
): ClipAnnexDetail | null {
  const row = stmtGet<Record<string, unknown>>(
    db,
    `SELECT form_key, law_name, annex_type_code, form_title, effective_date
     FROM clip_annex_forms WHERE form_key = ?`,
    [formKey],
  );
  if (!row) return null;

  const annexTypeCode = String(row.annex_type_code ?? "");
  const files = stmtAll<Record<string, unknown>>(
    db,
    `SELECT attachment_id, file_type, original_filename, download_status, byte_size, last_error
     FROM clip_annex_files
     WHERE form_key = ?
     ORDER BY CASE file_type WHEN 'pdf' THEN 0 WHEN 'hwp' THEN 1 ELSE 2 END, attachment_id`,
    [formKey],
  ).map(mapFileRow);

  return {
    form_key: String(row.form_key ?? ""),
    law_name: String(row.law_name ?? ""),
    annex_type_code: annexTypeCode,
    annex_type_label: clipAnnexTypeLabel(annexTypeCode),
    form_title: String(row.form_title ?? ""),
    effective_date: String(row.effective_date ?? ""),
    law_kind_label: LAW_KIND_LABEL,
    files,
  };
}

export function resolveClipAnnexFilePath(
  attachmentId: string,
): { absolutePath: string; fileName: string; fileType: string } | null {
  const db = openClipAnnexDb();
  try {
    const row = stmtGet<{
      stored_path: string | null;
      original_filename: string | null;
      file_type: string | null;
      download_status: string | null;
    }>(
      db,
      `SELECT stored_path, original_filename, file_type, download_status
       FROM clip_annex_files
       WHERE attachment_id = ? AND download_status = 'downloaded'`,
      [attachmentId],
    );
    if (!row?.stored_path) return null;

    const attachRoot = path.resolve(getClipAnnexAttachRoot());
    const abs = path.resolve(row.stored_path.replaceAll("\\", path.sep));
    if (!abs.startsWith(attachRoot)) return null;
    if (!fs.existsSync(abs)) return null;

    const fileName =
      (row.original_filename ?? "").trim() || path.basename(abs);
    return {
      absolutePath: abs,
      fileName,
      fileType: String(row.file_type ?? ""),
    };
  } finally {
    db.close();
  }
}
