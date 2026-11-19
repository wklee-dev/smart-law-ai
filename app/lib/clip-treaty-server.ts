import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import { getSmartLawAttachRoot } from "@/app/lib/smart-law-db";
import {
  CLIP_TREATY_CATEGORY_TABS,
  CLIP_TREATY_SORT_KEYS,
  type ClipFtaAgreementDocSummary,
  type ClipTreatyAttachmentRow,
  type ClipTreatyCategoryTab,
  type ClipTreatyDetail,
  type ClipTreatyListRow,
  type ClipTreatyQueryParams,
  type ClipTreatySortKey,
  type ClipTreatyTabCounts,
  type ClipTreatyTabKey,
} from "@/app/lib/clip-treaty-shared";

export {
  CLIP_TREATY_CATEGORY_TABS,
  type ClipFtaAgreementDocDetail,
  type ClipFtaAgreementDocSummary,
  type ClipTreatyAttachmentRow,
  type ClipTreatyCategoryTab,
  type ClipTreatyDetail,
  type ClipTreatyListRow,
  type ClipTreatyQueryParams,
  type ClipTreatySortKey,
  type ClipTreatyTabCounts,
  type ClipTreatyTabKey,
} from "@/app/lib/clip-treaty-shared";

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

function hasTreatyTable(db: DatabaseSync): boolean {
  const row = stmtGet<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='clip_treaties'",
  );
  return Boolean(row?.name);
}

export function openClipTreatyDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`조약/협정 DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p);
  if (!hasTreatyTable(db)) {
    db.close();
    throw new Error(
      "clip_treaties 테이블이 없습니다. clip_treaty_crawler.py로 조약/협정 데이터를 수집하세요.",
    );
  }
  return db;
}

function normalizeSort(sort: string | null | undefined): ClipTreatySortKey {
  const s = (sort ?? "effective_date").trim();
  return (CLIP_TREATY_SORT_KEYS as readonly string[]).includes(s)
    ? (s as ClipTreatySortKey)
    : "effective_date";
}

function normalizeDir(d: string | null | undefined): "asc" | "desc" {
  return d?.trim().toLowerCase() === "asc" ? "asc" : "desc";
}

const SORT_SQL: Record<ClipTreatySortKey, string> = {
  treaty_name: "TRIM(IFNULL(treaty_name, ''))",
  category_name: "TRIM(IFNULL(category_name, ''))",
  countries: "TRIM(IFNULL(countries, ''))",
  treaty_number: "TRIM(IFNULL(treaty_number, ''))",
  effective_date: "TRIM(IFNULL(effective_date, ''))",
};

function mapListRow(r: Record<string, unknown>): ClipTreatyListRow {
  return {
    trty_srno: String(r.trty_srno ?? ""),
    treaty_name: String(r.treaty_name ?? ""),
    category_name: String(r.category_name ?? ""),
    countries: String(r.countries ?? ""),
    treaty_number: String(r.treaty_number ?? ""),
    effective_date: String(r.effective_date ?? ""),
  };
}

function buildWhere(params: ClipTreatyQueryParams): {
  sql: string;
  binds: unknown[];
} {
  const parts: string[] = ["1=1"];
  const binds: unknown[] = [];

  if (params.tab !== "ALL") {
    parts.push("TRIM(IFNULL(category_name, '')) = ?");
    binds.push(params.tab);
  }
  if (params.treatyName.trim()) {
    parts.push("TRIM(IFNULL(treaty_name, '')) LIKE ?");
    binds.push(`%${params.treatyName.trim()}%`);
  }
  if (params.countryName.trim()) {
    parts.push("TRIM(IFNULL(countries, '')) LIKE ?");
    binds.push(`%${params.countryName.trim()}%`);
  }

  return { sql: parts.join(" AND "), binds };
}

export function clipTreatyTabCounts(db: DatabaseSync): ClipTreatyTabCounts {
  const rows = stmtAll<{ category_name: string | null; n: number }>(
    db,
    `SELECT TRIM(IFNULL(category_name, '')) AS category_name, COUNT(*) AS n
     FROM clip_treaties
     GROUP BY TRIM(IFNULL(category_name, ''))`,
  );
  const out: ClipTreatyTabCounts = {
    ALL: 0,
    양자조약: 0,
    다자조약: 0,
    FTA협정: 0,
    세관상호지원협정: 0,
  };
  for (const row of rows) {
    const name = (row.category_name ?? "").trim();
    const n = Number(row.n) || 0;
    out.ALL += n;
    if ((CLIP_TREATY_CATEGORY_TABS as readonly string[]).includes(name)) {
      out[name as ClipTreatyCategoryTab] = n;
    }
  }
  return out;
}

export function queryClipTreaties(
  db: DatabaseSync,
  params: ClipTreatyQueryParams,
): { rows: ClipTreatyListRow[]; total: number } {
  const page = Math.max(1, Math.floor(params.page));
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize)));
  const offset = (page - 1) * pageSize;
  const sort = normalizeSort(params.sort);
  const dir = normalizeDir(params.sort_dir);
  const { sql: whereSql, binds } = buildWhere(params);

  const totalRow = stmtGet<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM clip_treaties WHERE ${whereSql}`,
    binds,
  );
  const total = Number(totalRow?.n) || 0;

  const rows = stmtAll<Record<string, unknown>>(
    db,
    `SELECT trty_srno, treaty_name, category_name, countries, treaty_number, effective_date
     FROM clip_treaties
     WHERE ${whereSql}
     ORDER BY ${SORT_SQL[sort]} ${dir}, trty_srno ASC
     LIMIT ? OFFSET ?`,
    [...binds, pageSize, offset],
  );

  return { rows: rows.map(mapListRow), total };
}

function mapAttachment(r: Record<string, unknown>): ClipTreatyAttachmentRow {
  return {
    attachment_id: String(r.attachment_id ?? ""),
    file_name: String(r.file_name ?? ""),
    displayed_size: String(r.displayed_size ?? ""),
    download_status: String(r.download_status ?? ""),
    relative_path: r.relative_path ? String(r.relative_path) : null,
  };
}

export function getClipTreatyDetail(
  db: DatabaseSync,
  trtySrno: string,
): ClipTreatyDetail | null {
  const row = stmtGet<Record<string, unknown>>(
    db,
    `SELECT trty_srno, treaty_name, category_name, countries, treaty_number,
            effective_date, registered_date, korean_content, english_content,
            detail_text, source_url
     FROM clip_treaties WHERE trty_srno = ?`,
    [trtySrno],
  );
  if (!row) return null;

  const attachments = stmtAll<Record<string, unknown>>(
    db,
    `SELECT attachment_id, file_name, displayed_size, download_status, relative_path
     FROM clip_treaty_attachments
     WHERE trty_srno = ?
     ORDER BY file_name`,
    [trtySrno],
  ).map(mapAttachment);

  // 추출 성공·실패 모두 반환 (UI는 ok 우선, 원본 링크는 항상 표시)
  const agreement_docs = listFtaAgreementDocsByTrty(db, trtySrno, {
    onlyOk: false,
  });

  return {
    trty_srno: String(row.trty_srno ?? ""),
    treaty_name: String(row.treaty_name ?? ""),
    category_name: String(row.category_name ?? ""),
    countries: String(row.countries ?? ""),
    treaty_number: String(row.treaty_number ?? ""),
    effective_date: String(row.effective_date ?? ""),
    registered_date: String(row.registered_date ?? ""),
    korean_content: String(row.korean_content ?? ""),
    english_content: String(row.english_content ?? ""),
    detail_text: String(row.detail_text ?? ""),
    source_url: String(row.source_url ?? ""),
    attachments,
    agreement_docs,
  };
}

function hasFtaAgreementDocTable(db: DatabaseSync): boolean {
  const row = stmtGet<{ name: string }>(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='clip_fta_agreement_doc'",
  );
  return Boolean(row?.name);
}

function mapFtaDocSummary(r: Record<string, unknown>): ClipFtaAgreementDocSummary {
  return {
    doc_id: Number(r.doc_id) || 0,
    trty_srno: String(r.trty_srno ?? ""),
    treaty_number: String(r.treaty_number ?? ""),
    treaty_name: String(r.treaty_name ?? ""),
    countries: String(r.countries ?? ""),
    primary_country: String(r.primary_country ?? ""),
    lang: String(r.lang ?? ""),
    file_name: String(r.file_name ?? ""),
    page_count: Number(r.page_count) || 0,
    content_chars: Number(r.content_chars) || 0,
    extract_status: String(r.extract_status ?? ""),
  };
}

/** 조약일련번호로 추출된 협정서 목록 */
export function listFtaAgreementDocsByTrty(
  db: DatabaseSync,
  trtySrno: string,
  opts?: { onlyOk?: boolean },
): ClipFtaAgreementDocSummary[] {
  if (!hasFtaAgreementDocTable(db)) return [];
  const onlyOk = opts?.onlyOk !== false;
  const rows = stmtAll<Record<string, unknown>>(
    db,
    `
    SELECT doc_id, trty_srno, treaty_number, treaty_name,
           countries, primary_country, lang, file_name,
           page_count, content_chars, extract_status
    FROM clip_fta_agreement_doc
    WHERE trty_srno = ?
      ${onlyOk ? "AND extract_status = 'ok'" : ""}
    ORDER BY
      CASE UPPER(TRIM(IFNULL(lang,'')))
        WHEN 'KO' THEN 0 WHEN 'EN' THEN 1 ELSE 2 END,
      file_name
    `,
    [trtySrno],
  );
  return rows.map(mapFtaDocSummary);
}

/** 국가 키/라벨로 FTA 협정서 목록 (참조 링크용) */
export function listFtaAgreementDocsByCountry(
  db: DatabaseSync,
  country: string,
  opts?: { lang?: string; onlyOk?: boolean },
): import("@/app/lib/clip-treaty-shared").ClipFtaAgreementDocSummary[] {
  if (!hasFtaAgreementDocTable(db)) return [];
  const key = country.replace(/\s+/g, "").trim();
  const lang = opts?.lang?.trim().toUpperCase();
  const onlyOk = opts?.onlyOk !== false;
  const parts = [
    `(c.country_key LIKE ? OR c.country_label LIKE ? OR d.primary_country LIKE ? OR d.countries LIKE ?)`,
  ];
  const binds: unknown[] = [`%${key}%`, `%${country}%`, `%${country}%`, `%${country}%`];
  if (lang) {
    parts.push("UPPER(TRIM(IFNULL(d.lang,''))) = ?");
    binds.push(lang);
  }
  if (onlyOk) {
    parts.push("d.extract_status = 'ok'");
  }
  const rows = stmtAll<Record<string, unknown>>(
    db,
    `
    SELECT DISTINCT d.doc_id, d.trty_srno, d.treaty_number, d.treaty_name,
           d.countries, d.primary_country, d.lang, d.file_name,
           d.page_count, d.content_chars, d.extract_status
    FROM clip_fta_agreement_country c
    JOIN clip_fta_agreement_doc d ON d.doc_id = c.doc_id
    WHERE ${parts.join(" AND ")}
    ORDER BY d.treaty_number, d.lang, d.file_name
    `,
    binds,
  );
  return rows.map(mapFtaDocSummary);
}

export function getFtaAgreementDoc(
  db: DatabaseSync,
  docId: number,
): import("@/app/lib/clip-treaty-shared").ClipFtaAgreementDocDetail | null {
  if (!hasFtaAgreementDocTable(db)) return null;
  const r = stmtGet<Record<string, unknown>>(
    db,
    `
    SELECT doc_id, trty_srno, attachment_id, treaty_number, treaty_name,
           countries, primary_country, lang, file_name, page_count,
           content_chars, extract_status, content_text, relative_path,
           effective_date, source_url
    FROM clip_fta_agreement_doc WHERE doc_id = ?
    `,
    [docId],
  );
  if (!r) return null;
  return {
    doc_id: Number(r.doc_id) || 0,
    trty_srno: String(r.trty_srno ?? ""),
    attachment_id: String(r.attachment_id ?? ""),
    treaty_number: String(r.treaty_number ?? ""),
    treaty_name: String(r.treaty_name ?? ""),
    countries: String(r.countries ?? ""),
    primary_country: String(r.primary_country ?? ""),
    lang: String(r.lang ?? ""),
    file_name: String(r.file_name ?? ""),
    page_count: Number(r.page_count) || 0,
    content_chars: Number(r.content_chars) || 0,
    extract_status: String(r.extract_status ?? ""),
    content_text: String(r.content_text ?? ""),
    relative_path: r.relative_path ? String(r.relative_path) : null,
    effective_date: String(r.effective_date ?? ""),
    source_url: String(r.source_url ?? ""),
  };
}

export function resolveClipTreatyAttachmentPath(
  attachmentId: string,
): { absolutePath: string; fileName: string } | null {
  const db = openClipTreatyDb();
  try {
    const row = stmtGet<{ relative_path: string | null; file_name: string }>(
      db,
      `SELECT relative_path, file_name FROM clip_treaty_attachments
       WHERE attachment_id = ? AND download_status = 'downloaded'`,
      [attachmentId],
    );
    if (!row?.relative_path) return null;

    const dbDir = getSmartLawAttachRoot();
    const abs = path.resolve(dbDir, row.relative_path.replaceAll("\\", path.sep));
    const root = path.resolve(dbDir, "attachments", "조약협정");
    if (!abs.startsWith(root)) return null;
    if (!fs.existsSync(abs)) return null;

    return { absolutePath: abs, fileName: row.file_name || path.basename(abs) };
  } finally {
    db.close();
  }
}
