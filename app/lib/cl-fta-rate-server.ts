import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type {
  ClFtaAttachRow,
  ClFtaGeneralRow,
  ClFtaHs2Option,
  ClFtaNationRow,
  ClFtaPsrDetail,
  ClFtaPsrDetailRow,
  ClFtaPsrRef,
  ClFtaPsrRow,
  ClFtaRateCdRow,
  ClFtaRateListRow,
  ClFtaRecomRow,
} from "@/app/lib/cl-fta-rate-shared";
import {
  seedPsrGuideFor,
  seedRecomFor,
} from "@/app/lib/cl-fta-rate-seed";
import {
  clFtaCdForPortal,
  listPortalFtaHs2Options,
  listPortalFtaNations,
  listPortalFtaPsr,
  listPortalFtaRateCodes,
  portalFtaTablesReady,
  queryPortalFtaRates,
} from "@/app/lib/fta-portal-rate-server";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

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

export function openClFtaRateDb(readOnly = true): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly });
}

export type ClFtaQueryOpts = {
  /** true면 FTA 포털(fta_*) 대신 씨엘HS(cl_fta_*)만 사용 */
  preferCl?: boolean;
};

export function clFtaNativeTablesReady(db: DatabaseSync): boolean {
  return hasTable(db, "cl_fta_nation") && hasTable(db, "cl_fta_rate");
}

export function clFtaRateTablesReady(db: DatabaseSync): boolean {
  if (portalFtaTablesReady(db)) return true;
  return clFtaNativeTablesReady(db);
}

function listClFtaNationsNative(db: DatabaseSync): ClFtaNationRow[] {
  if (!hasTable(db, "cl_fta_nation")) return [];
  const hasRate = hasTable(db, "cl_fta_rate");
  const sql = hasRate
    ? `SELECT n.fta_cd, n.fta_nm, n.nation_nm, n.cert_desc, n.psr_desc,
              n.effect_dt, n.treaty_url, n.sort_no, n.base_yr,
              (SELECT COUNT(*) FROM cl_fta_rate r WHERE r.fta_cd = n.fta_cd) AS rate_count
         FROM cl_fta_nation n
        ORDER BY COALESCE(n.sort_no, 9999), n.fta_cd`
    : `SELECT fta_cd, fta_nm, nation_nm, cert_desc, psr_desc,
              effect_dt, treaty_url, sort_no, base_yr, 0 AS rate_count
         FROM cl_fta_nation
        ORDER BY COALESCE(sort_no, 9999), fta_cd`;
  return (db.prepare(sql).all() as Record<string, unknown>[]).map((r) => ({
    fta_cd: str(r.fta_cd),
    fta_nm: str(r.fta_nm),
    nation_nm: str(r.nation_nm),
    cert_desc: str(r.cert_desc),
    psr_desc: str(r.psr_desc),
    effect_dt: str(r.effect_dt),
    treaty_url: str(r.treaty_url),
    sort_no: num(r.sort_no),
    base_yr: str(r.base_yr),
    rate_count: num(r.rate_count),
  }));
}

export function listClFtaNations(
  db: DatabaseSync,
  opts?: ClFtaQueryOpts,
): ClFtaNationRow[] {
  if (!opts?.preferCl && portalFtaTablesReady(db)) {
    return listPortalFtaNations(db);
  }
  return listClFtaNationsNative(db);
}

export function listClFtaGeneral(
  db: DatabaseSync,
  ftaCd = "FTA",
): ClFtaGeneralRow[] {
  if (!hasTable(db, "cl_fta_general")) return [];
  return (
    db
      .prepare(
        `SELECT fta_cd, sect, gubun, content
           FROM cl_fta_general
          WHERE fta_cd = ?
          ORDER BY rowid`,
      )
      .all(ftaCd) as Record<string, unknown>[]
  ).map((r) => ({
    fta_cd: str(r.fta_cd),
    sect: str(r.sect),
    gubun: str(r.gubun),
    content: str(r.content),
  }));
}

/** 협정별 본문(적용법령 등) — fta_cd 일치 또는 공통 FTA */
export function listClFtaGeneralForAgreement(
  db: DatabaseSync,
  ftaCd: string,
): ClFtaGeneralRow[] {
  if (!hasTable(db, "cl_fta_general")) return [];
  const codes = [ftaCd, clFtaCdForPortal(ftaCd)].filter(
    (c, i, arr) => c && arr.indexOf(c) === i,
  );
  for (const cd of codes) {
    const own = listClFtaGeneral(db, cd);
    if (own.length) return own.map((r) => ({ ...r, fta_cd: ftaCd }));
  }
  for (const cd of codes) {
    const rows = (
      db
        .prepare(
          `SELECT fta_cd, sect, gubun, content
             FROM cl_fta_general
            WHERE fta_cd = ? AND sect LIKE '%협정%'
            ORDER BY rowid`,
        )
        .all(cd) as Record<string, unknown>[]
    ).map((r) => ({
      fta_cd: ftaCd,
      sect: str(r.sect),
      gubun: str(r.gubun),
      content: str(r.content),
    }));
    if (rows.length) return rows;
  }
  return [];
}

export function listClFtaRateCodes(
  db: DatabaseSync,
  ftaCd: string,
  opts?: ClFtaQueryOpts,
): ClFtaRateCdRow[] {
  if (!opts?.preferCl && portalFtaTablesReady(db) && ftaCd) {
    return listPortalFtaRateCodes(db, ftaCd);
  }
  if (!hasTable(db, "cl_fta_ratecd") || !ftaCd) return [];
  return (
    db
      .prepare(
        `SELECT rate_cd, fta_cd, nation_nm, grp_nm, COALESCE(sort_no, 9999) AS sort_no
           FROM cl_fta_ratecd
          WHERE fta_cd = ?
          ORDER BY COALESCE(sort_no, 9999), rate_cd`,
      )
      .all(ftaCd) as Record<string, unknown>[]
  ).map((r) => ({
    rate_cd: str(r.rate_cd),
    fta_cd: str(r.fta_cd),
    nation_nm: str(r.nation_nm),
    grp_nm: str(r.grp_nm),
    sort_no: num(r.sort_no),
  }));
}

export function listClFtaHs2Options(
  db: DatabaseSync,
  ftaCd: string,
  opts?: ClFtaQueryOpts,
): ClFtaHs2Option[] {
  if (!opts?.preferCl && portalFtaTablesReady(db) && ftaCd) {
    return listPortalFtaHs2Options(db, ftaCd);
  }
  if (!hasTable(db, "cl_fta_hsk") || !hasTable(db, "cl_fta_rate") || !ftaCd) {
    return [];
  }
  return (
    db
      .prepare(
        `SELECT h.hs2, MAX(h.hs2_nm) AS hs2_nm, COUNT(DISTINCT h.hsk_cd) AS n
           FROM cl_fta_rate r
           JOIN cl_fta_hsk h ON h.hsk_cd = r.hsk_cd
          WHERE r.fta_cd = ?
          GROUP BY h.hs2
          ORDER BY h.hs2`,
      )
      .all(ftaCd) as Record<string, unknown>[]
  ).map((r) => ({
    hs2: str(r.hs2),
    hs2_nm: str(r.hs2_nm),
    n: num(r.n),
  }));
}

export function queryClFtaRates(
  db: DatabaseSync,
  params: {
    ftaCd?: string;
    hs?: string;
    hs2?: string;
    page: number;
    pageSize: number;
    preferCl?: boolean;
  },
): { rows: ClFtaRateListRow[]; total: number } {
  if (!params.preferCl && portalFtaTablesReady(db)) {
    return queryPortalFtaRates(db, params);
  }
  if (!hasTable(db, "cl_fta_rate")) {
    return { rows: [], total: 0 };
  }
  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(200, Math.max(10, Math.floor(params.pageSize) || 50));
  const ftaCd = str(params.ftaCd);
  const hs = str(params.hs).replace(/\D/g, "");
  const hs2 = str(params.hs2).replace(/\D/g, "").slice(0, 2);

  const where: string[] = [];
  const bind: unknown[] = [];
  if (ftaCd) {
    where.push("r.fta_cd = ?");
    bind.push(ftaCd);
  }
  if (hs) {
    where.push("r.hsk_cd LIKE ?");
    bind.push(`${hs}%`);
  } else if (hs2) {
    where.push("(h.hs2 = ? OR substr(r.hsk_cd,1,2) = ?)");
    bind.push(hs2.padStart(2, "0"), hs2.padStart(2, "0"));
  }
  if (!where.length) {
    return { rows: [], total: 0 };
  }

  const whereSql = where.join(" AND ");
  const hasHsk = hasTable(db, "cl_fta_hsk");
  const hasNation = hasTable(db, "cl_fta_nation");
  const fromSql = `FROM cl_fta_rate r
        ${hasHsk ? "LEFT JOIN cl_fta_hsk h ON h.hsk_cd = r.hsk_cd" : ""}
        ${hasNation ? "LEFT JOIN cl_fta_nation n ON n.fta_cd = r.fta_cd" : ""}`;

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n ${fromSql} WHERE ${whereSql}`)
    .get(...bind) as { n: number };
  const total = num(totalRow?.n);
  const offset = (page - 1) * pageSize;

  const selectSql = `SELECT r.fta_cd,
              ${hasNation ? "COALESCE(n.fta_nm, '')" : "''"} AS fta_nm,
              r.hsk_cd,
              ${
                hasHsk
                  ? `COALESCE(h.hs2, substr(r.hsk_cd,1,2), '') AS hs2,
              COALESCE(h.hs4, substr(r.hsk_cd,1,4), '') AS hs4,
              COALESCE(h.hs6, substr(r.hsk_cd,1,6), '') AS hs6,
              COALESCE(h.hs2_nm, '') AS hs2_nm,
              COALESCE(h.hsk_nm, '') AS hsk_nm,
              COALESCE(h.hsk_nm_en, '') AS hsk_nm_en,`
                  : `substr(r.hsk_cd,1,2) AS hs2,
              substr(r.hsk_cd,1,4) AS hs4,
              substr(r.hsk_cd,1,6) AS hs6,
              '' AS hs2_nm, '' AS hsk_nm, '' AS hsk_nm_en,`
              }
              r.rate_cd, r.nation_nm, r.grp_nm, r.rate_txt, r.rate_val, r.row_no
         ${fromSql}
        WHERE ${whereSql}
        ORDER BY r.hsk_cd, r.fta_cd, r.row_no, r.rate_cd
        LIMIT ? OFFSET ?`;

  const rows = (
    db.prepare(selectSql).all(...bind, pageSize, offset) as Record<
      string,
      unknown
    >[]
  ).map((r) => {
    // node:sqlite 결과 키가 대소문자·별칭 차이 날 수 있어 방어
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        if (r[k] != null && String(r[k]).trim() !== "") return r[k];
        const found = Object.keys(r).find(
          (x) => x.toLowerCase() === k.toLowerCase(),
        );
        if (found && r[found] != null && String(r[found]).trim() !== "") {
          return r[found];
        }
      }
      return "";
    };
    return {
      fta_cd: str(pick("fta_cd")),
      fta_nm: str(pick("fta_nm")),
      hsk_cd: str(pick("hsk_cd")),
      hs2: str(pick("hs2")),
      hs4: str(pick("hs4")),
      hs6: str(pick("hs6")),
      hs2_nm: str(pick("hs2_nm")),
      hsk_nm: str(pick("hsk_nm")),
      hsk_nm_en: str(pick("hsk_nm_en")),
      rate_cd: str(pick("rate_cd")),
      nation_nm: str(pick("nation_nm")),
      grp_nm: str(pick("grp_nm")),
      rate_txt: str(pick("rate_txt")),
      rate_val:
        r.rate_val == null || r.rate_val === ""
          ? null
          : Number.isFinite(Number(r.rate_val))
            ? Number(r.rate_val)
            : null,
      row_no: num(r.row_no),
    };
  });

  return { rows, total };
}

function listClFtaPsrRefs(
  db: DatabaseSync,
  ftaCd: string,
  hs2: string,
): ClFtaPsrRef[] {
  if (!hasTable(db, "cl_fta_psr_ref") || !ftaCd || !hs2) return [];
  return (
    db
      .prepare(
        `SELECT ref_fta, psr_id, seq_no
           FROM cl_fta_psr_ref
          WHERE fta_cd = ? AND hs2 = ?
          ORDER BY seq_no, CAST(psr_id AS INT)`,
      )
      .all(ftaCd, hs2) as Record<string, unknown>[]
  ).map((r) => ({
    ref_fta: str(r.ref_fta),
    psr_id: str(r.psr_id),
    seq_no: num(r.seq_no) || 1,
  }));
}

function mapClFtaPsrRow(
  db: DatabaseSync,
  displayFtaCd: string,
  refLookupCd: string,
  r: Record<string, unknown>,
): ClFtaPsrRow {
  const hs2 = str(r.hs2);
  return {
    fta_cd: displayFtaCd,
    hs2,
    psr_txt: str(r.psr_txt),
    note_txt: str(r.note_txt),
    base_desc: str(r.base_desc),
    refs: listClFtaPsrRefs(db, refLookupCd, hs2),
  };
}

export function listClFtaPsr(
  db: DatabaseSync,
  ftaCd: string,
  hs2?: string,
  opts?: ClFtaQueryOpts,
): ClFtaPsrRow[] {
  if (!ftaCd) return [];
  if (!opts?.preferCl && portalFtaTablesReady(db)) {
    const portal = listPortalFtaPsr(db, ftaCd, hs2);
    if (portal.length) {
      const refCd = clFtaCdForPortal(ftaCd);
      return portal.map((r) => ({
        ...r,
        refs: listClFtaPsrRefs(db, refCd, r.hs2),
      }));
    }
  }
  if (!hasTable(db, "cl_fta_psr")) return [];
  const lookupCd = opts?.preferCl ? ftaCd : clFtaCdForPortal(ftaCd);
  const hs2n = str(hs2).replace(/\D/g, "").slice(0, 2);
  if (hs2n) {
    return (
      db
        .prepare(
          `SELECT fta_cd, hs2, psr_txt, note_txt, base_desc
             FROM cl_fta_psr
            WHERE fta_cd = ? AND hs2 = ?
            ORDER BY hs2`,
        )
        .all(lookupCd, hs2n.padStart(2, "0")) as Record<string, unknown>[]
    ).map((r) => mapClFtaPsrRow(db, ftaCd, lookupCd, r));
  }
  return (
    db
      .prepare(
        `SELECT fta_cd, hs2, psr_txt, note_txt, base_desc
           FROM cl_fta_psr
          WHERE fta_cd = ?
          ORDER BY hs2
          LIMIT 200`,
      )
      .all(lookupCd) as Record<string, unknown>[]
  ).map((r) => mapClFtaPsrRow(db, ftaCd, lookupCd, r));
}

/** [참조] 팝업용 원산지결정기준 상세 (cl_fta_psr_dtl) */
export function getClFtaPsrDetail(
  db: DatabaseSync,
  refFta: string,
  psrId: string,
): ClFtaPsrDetail | null {
  const fta = str(refFta).toUpperCase();
  const id = str(psrId);
  if (!fta || !id || !hasTable(db, "cl_fta_psr_dtl")) return null;
  const raw = (
    db
      .prepare(
        `SELECT gubun, content, seq_no
           FROM cl_fta_psr_dtl
          WHERE fta_cd = ? AND psr_id = ?
          ORDER BY seq_no`,
      )
      .all(fta, id) as Record<string, unknown>[]
  ).map((r) => ({
    gubun: str(r.gubun),
    content: str(r.content),
    seq_no: num(r.seq_no),
  }));
  if (!raw.length) return null;

  const rows: ClFtaPsrDetailRow[] = [];
  let note = "";
  for (const r of raw) {
    if (r.gubun === "비고" || r.gubun.startsWith("※")) {
      note = r.content || r.gubun;
      continue;
    }
    // 크롤 시 rowspan 부가가치기준 + 집적법이 한 행으로 합쳐진 경우 보정
    const gCompact = r.gubun.replace(/\s+/g, "");
    if (gCompact.includes("부가가치") && /법$/.test(r.content)) {
      rows.push({ gubun: r.content, content: "", seq_no: r.seq_no });
      continue;
    }
    rows.push(r);
  }
  return { ref_fta: fta, psr_id: id, rows, note };
}

export function listClFtaAttachments(
  db: DatabaseSync,
  ftaCd: string,
): ClFtaAttachRow[] {
  if (!hasTable(db, "cl_fta_attach") || !ftaCd) return [];
  const lookupCd = clFtaCdForPortal(ftaCd);
  return (
    db
      .prepare(
        `SELECT fta_cd, doc_gb, file_nm, file_url, save_path
           FROM cl_fta_attach
          WHERE fta_cd = ?
          ORDER BY doc_gb, file_nm`,
      )
      .all(lookupCd) as Record<string, unknown>[]
  ).map((r) => ({
    fta_cd: ftaCd,
    doc_gb: str(r.doc_gb),
    file_nm: str(r.file_nm),
    file_url: str(r.file_url),
    save_path: str(r.save_path),
  }));
}

/** 원산지결정기준 안내문 (협정 화면 본문) */
export function listClFtaPsrGuide(
  db: DatabaseSync,
  ftaCd: string,
): ClFtaGeneralRow[] {
  if (!ftaCd) return [];
  const codes = [ftaCd, clFtaCdForPortal(ftaCd)].filter(
    (c, i, arr) => c && arr.indexOf(c) === i,
  );
  if (hasTable(db, "cl_fta_general")) {
    for (const cd of codes) {
      const rows = (
        db
          .prepare(
            `SELECT fta_cd, sect, gubun, content
               FROM cl_fta_general
              WHERE fta_cd = ? AND sect LIKE '%원산지%'
              ORDER BY rowid`,
          )
          .all(cd) as Record<string, unknown>[]
      ).map((r) => ({
        fta_cd: ftaCd,
        sect: str(r.sect),
        gubun: str(r.gubun),
        content: str(r.content),
      }));
      if (rows.length) return rows;
    }
  }
  return seedPsrGuideFor(clFtaCdForPortal(ftaCd)).map((r) => ({
    ...r,
    fta_cd: ftaCd,
  }));
}

/** 협정관세추천 대상품목 */
export function listClFtaRecom(
  db: DatabaseSync,
  ftaCd: string,
): ClFtaRecomRow[] {
  if (!ftaCd) return [];
  const lookupCd = clFtaCdForPortal(ftaCd);
  let rows: ClFtaRecomRow[] = [];
  if (hasTable(db, "cl_fta_recom")) {
    const hasHsk = hasTable(db, "cl_fta_hsk");
    const sql = hasHsk
      ? `SELECT r.fta_cd, r.item_nm, r.seq_no, r.hsk_cd, r.hsk_disp,
                COALESCE(NULLIF(r.hsk_nm,''), h.hsk_nm, '') AS hsk_nm,
                r.qty_txt, r.agency
           FROM cl_fta_recom r
           LEFT JOIN cl_fta_hsk h ON h.hsk_cd = r.hsk_cd
          WHERE r.fta_cd = ?
          ORDER BY r.item_nm, r.seq_no`
      : `SELECT fta_cd, item_nm, seq_no, hsk_cd, hsk_disp, hsk_nm, qty_txt, agency
           FROM cl_fta_recom
          WHERE fta_cd = ?
          ORDER BY item_nm, seq_no`;
    rows = (db.prepare(sql).all(lookupCd) as Record<string, unknown>[]).map(
      (r) => ({
        fta_cd: ftaCd,
        item_nm: str(r.item_nm),
        seq_no: num(r.seq_no),
        hsk_cd: str(r.hsk_cd),
        hsk_disp: str(r.hsk_disp) || formatHskDispServer(str(r.hsk_cd)),
        hsk_nm: str(r.hsk_nm),
        qty_txt: str(r.qty_txt),
        agency: str(r.agency),
      }),
    );
  }
  if (!rows.length) {
    rows = seedRecomFor(lookupCd).map((r) => ({ ...r, fta_cd: ftaCd }));
    if (hasTable(db, "cl_fta_hsk") && rows.length) {
      const stmt = db.prepare(
        "SELECT hsk_nm FROM cl_fta_hsk WHERE hsk_cd = ?",
      );
      for (const r of rows) {
        const hit = stmt.get(r.hsk_cd) as { hsk_nm?: string } | undefined;
        if (hit?.hsk_nm) r.hsk_nm = str(hit.hsk_nm);
      }
    }
  }
  return rows;
}

function formatHskDispServer(code: string): string {
  const d = code.replace(/\D/g, "");
  if (d.length < 4) return code;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}-${d.slice(6)}`;
}
