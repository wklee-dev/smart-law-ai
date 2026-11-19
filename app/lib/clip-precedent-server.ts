import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getClipPrecedentDbPath } from "@/app/lib/clip-precedent-paths";
import {
  CLIP_PRECEDENT_SECTION_DEFS,
  CLIP_PRECEDENT_SORT_KEYS,
  CLIP_PRECEDENT_TYPE_TABS,
  formatClipDecisionDate,
  type ClipPrecedentDetail,
  type ClipPrecedentDetailSection,
  type ClipPrecedentHsRow,
  type ClipPrecedentLawRow,
  type ClipPrecedentListRow,
  type ClipPrecedentQueryParams,
  type ClipPrecedentSortKey,
  type ClipPrecedentTabCounts,
  type ClipPrecedentTypeTab,
} from "@/app/lib/clip-precedent-shared";

export {
  CLIP_PRECEDENT_TYPE_TABS,
  formatClipDecisionDate,
  type ClipPrecedentDetail,
  type ClipPrecedentDetailSection,
  type ClipPrecedentHsRow,
  type ClipPrecedentLawRow,
  type ClipPrecedentListRow,
  type ClipPrecedentQueryParams,
  type ClipPrecedentSortKey,
  type ClipPrecedentTabCounts,
  type ClipPrecedentTypeTab,
} from "@/app/lib/clip-precedent-shared";

function stmtAll<T extends Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T[] {
  const st = db.prepare(sql);
  const rows = st.all(...params) as T[];
  return rows ?? [];
}

function stmtGet<T extends Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T | undefined {
  const st = db.prepare(sql);
  return st.get(...params) as T | undefined;
}

export function openClipPrecedentDb(): DatabaseSync {
  const p = getClipPrecedentDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`CLIP 판례·결정례 DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p);
}

function normalizeSort(sort: string | null | undefined): ClipPrecedentSortKey {
  const s = (sort ?? "decision_date").trim();
  return (CLIP_PRECEDENT_SORT_KEYS as readonly string[]).includes(s)
    ? (s as ClipPrecedentSortKey)
    : "decision_date";
}

function normalizeDir(d: string | null | undefined): "asc" | "desc" {
  return d?.trim().toLowerCase() === "asc" ? "asc" : "desc";
}

const SORT_SQL: Record<ClipPrecedentSortKey, string> = {
  incd_no: `TRIM(IFNULL(incd_no, ''))`,
  wrdc_ttle: `TRIM(IFNULL(wrdc_ttle, ''))`,
  trial_type: `TRIM(IFNULL(dsbd_incd_clsf_cd_nm, ''))`,
  issue_class: `TRIM(IFNULL(dsbd_isue_lrcl_cd_nm, ''))`,
  decision_date: `TRIM(IFNULL(dtrm_dt, ''))`,
  agency: `TRIM(IFNULL(dsbd_incd_dtrm_ofc_cstm_sgn_nm, ''))`,
};

function mapListRow(r: Record<string, unknown>): ClipPrecedentListRow {
  return {
    dsbd_incd_no: String(r.dsbd_incd_no ?? ""),
    incd_no: String(r.incd_no ?? ""),
    wrdc_ttle: String(r.wrdc_ttle ?? ""),
    trial_type: String(r.dsbd_incd_clsf_cd_nm ?? ""),
    issue_class: String(r.dsbd_isue_lrcl_cd_nm ?? ""),
    decision_date: formatClipDecisionDate(
      r.dtrm_dt as string | null | undefined,
    ),
    agency: String(r.dsbd_incd_dtrm_ofc_cstm_sgn_nm ?? ""),
  };
}

export function clipPrecedentTabCounts(db: DatabaseSync): ClipPrecedentTabCounts {
  const rows = stmtAll<{ trial_type: string | null; c: number }>(
    db,
    `SELECT TRIM(IFNULL(dsbd_incd_clsf_cd_nm, '')) AS trial_type, COUNT(*) AS c
     FROM clip_precedent
     GROUP BY TRIM(IFNULL(dsbd_incd_clsf_cd_nm, ''))`,
  );
  const out: ClipPrecedentTabCounts = {
    전체: 0,
    과세전적부심사: 0,
    심사청구: 0,
    심판청구: 0,
    소송: 0,
  };
  for (const r of rows) {
    const tt = r.trial_type ?? "";
    const c = Number(r.c) || 0;
    out.전체 += c;
    if (tt === "과세전적부심사") out.과세전적부심사 = c;
    else if (tt === "심사청구") out.심사청구 = c;
    else if (tt === "심판청구") out.심판청구 = c;
    else if (tt === "소송") out.소송 = c;
  }
  return out;
}

export function clipPrecedentDistinctFilters(db: DatabaseSync): {
  issue_classes: string[];
  agencies: string[];
} {
  const issue_classes = stmtAll<{ v: string }>(
    db,
    `SELECT DISTINCT TRIM(dsbd_isue_lrcl_cd_nm) AS v FROM clip_precedent
     WHERE dsbd_isue_lrcl_cd_nm IS NOT NULL AND TRIM(dsbd_isue_lrcl_cd_nm) <> ''
     ORDER BY v COLLATE NOCASE`,
  ).map((r) => r.v);
  const agencies = stmtAll<{ v: string }>(
    db,
    `SELECT DISTINCT TRIM(dsbd_incd_dtrm_ofc_cstm_sgn_nm) AS v FROM clip_precedent
     WHERE dsbd_incd_dtrm_ofc_cstm_sgn_nm IS NOT NULL AND TRIM(dsbd_incd_dtrm_ofc_cstm_sgn_nm) <> ''
     ORDER BY v COLLATE NOCASE`,
  ).map((r) => r.v);
  return { issue_classes, agencies };
}

export function queryClipPrecedents(
  db: DatabaseSync,
  p: ClipPrecedentQueryParams,
): { rows: ClipPrecedentListRow[]; total: number } {
  const page = Math.max(1, Math.floor(p.page));
  const pageSize = Math.min(100, Math.max(5, Math.floor(p.pageSize)));
  const offset = (page - 1) * pageSize;

  const binds: unknown[] = [];
  const parts: string[] = ["1=1"];

  const tab = (p.trialTypeTab ?? "ALL").trim();
  if (tab && tab !== "ALL") {
    if ((CLIP_PRECEDENT_TYPE_TABS as readonly string[]).includes(tab)) {
      parts.push(`TRIM(IFNULL(dsbd_incd_clsf_cd_nm, '')) = ?`);
      binds.push(tab);
    }
  }

  const cn = (p.case_no ?? "").trim();
  if (cn !== "") {
    parts.push(`incd_no LIKE ? COLLATE NOCASE`);
    binds.push(`%${cn}%`);
  }

  const title = (p.title ?? "").trim();
  if (title !== "") {
    parts.push(`wrdc_ttle LIKE ? COLLATE NOCASE`);
    binds.push(`%${title}%`);
  }

  const ic = (p.issue_class ?? "").trim();
  if (ic !== "") {
    parts.push(`TRIM(IFNULL(dsbd_isue_lrcl_cd_nm, '')) = ?`);
    binds.push(ic);
  }

  const ag = (p.agency ?? "").trim();
  if (ag !== "") {
    parts.push(`TRIM(IFNULL(dsbd_incd_dtrm_ofc_cstm_sgn_nm, '')) = ?`);
    binds.push(ag);
  }

  const whereSql = parts.join(" AND ");
  const totalRow = stmtGet<{ n: number }>(
    db,
    `SELECT COUNT(*) AS n FROM clip_precedent WHERE ${whereSql}`,
    binds,
  );
  const total = Math.max(0, Number(totalRow?.n ?? 0));

  const sortCol = normalizeSort(p.sort);
  const sortAsc = normalizeDir(p.sort_dir) === "asc";
  const orderExpr = SORT_SQL[sortCol];
  const orderDir = sortAsc ? "ASC" : "DESC";

  const rows = stmtAll<Record<string, unknown>>(
    db,
    `SELECT
       dsbd_incd_no, incd_no, wrdc_ttle,
       dsbd_incd_clsf_cd_nm, dsbd_isue_lrcl_cd_nm,
       dtrm_dt, dsbd_incd_dtrm_ofc_cstm_sgn_nm
     FROM clip_precedent
     WHERE ${whereSql}
     ORDER BY ${orderExpr} ${orderDir}, TRIM(IFNULL(incd_no,'')) ASC
     LIMIT ? OFFSET ?`,
    [...binds, pageSize, offset],
  ).map(mapListRow);

  return { rows, total };
}

function buildSections(detail: Record<string, unknown>): ClipPrecedentDetailSection[] {
  const out: ClipPrecedentDetailSection[] = [];
  for (const def of CLIP_PRECEDENT_SECTION_DEFS) {
    const text = String(detail[def.key] ?? "").trim();
    if (text !== "") {
      out.push({ key: def.key, label: def.label, text });
    }
  }
  return out;
}

export function getClipPrecedentDetail(
  db: DatabaseSync,
  dsbdIncdNo: string,
): ClipPrecedentDetail | null {
  const key = dsbdIncdNo.trim();
  if (!key) return null;

  const row = stmtGet<Record<string, unknown>>(
    db,
    `SELECT
       p.dsbd_incd_no, p.incd_no, p.wrdc_ttle,
       p.dsbd_incd_clsf_cd_nm, p.dsbd_isue_lrcl_cd_nm,
       p.dtrm_dt, p.dsbd_incd_dtrm_ofc_cstm_sgn_nm,
       d.dtrm_type, d.order_text, d.claim_reason, d.claimant_arg,
       d.agency_arg, d.issue, d.judgement, d.conclusion
     FROM clip_precedent p
     LEFT JOIN clip_precedent_detail d ON d.dsbd_incd_no = p.dsbd_incd_no
     WHERE p.dsbd_incd_no = ?`,
    [key],
  );
  if (!row) return null;

  const laws = stmtAll<Record<string, unknown>>(
    db,
    `SELECT id, law_name, law_content
     FROM clip_precedent_law
     WHERE dsbd_incd_no = ?
     ORDER BY id`,
    [key],
  ).map(
    (r): ClipPrecedentLawRow => ({
      id: Number(r.id) || 0,
      law_name: String(r.law_name ?? ""),
      law_content: String(r.law_content ?? ""),
    }),
  );

  const hs_items = stmtAll<Record<string, unknown>>(
    db,
    `SELECT id, hs_code, kor_name, eng_name
     FROM clip_precedent_hs
     WHERE dsbd_incd_no = ?
     ORDER BY id`,
    [key],
  ).map(
    (r): ClipPrecedentHsRow => ({
      id: Number(r.id) || 0,
      hs_code: String(r.hs_code ?? ""),
      kor_name: String(r.kor_name ?? ""),
      eng_name: String(r.eng_name ?? ""),
    }),
  );

  const base = mapListRow(row);
  return {
    ...base,
    decision_type: String(row.dtrm_type ?? "").trim() || "—",
    sections: buildSections(row),
    laws,
    hs_items,
  };
}
