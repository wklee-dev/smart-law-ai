import "server-only";

import type { DatabaseSync } from "node:sqlite";
import type {
  ClFtaHs2Option,
  ClFtaNationRow,
  ClFtaPsrRow,
  ClFtaRateCdRow,
  ClFtaRateListRow,
} from "@/app/lib/cl-fta-rate-shared";
import type {
  PortalFtaChapter,
  PortalFtaGuide,
  PortalFtaHsItem,
  PortalFtaNation,
  PortalFtaYearRate,
} from "@/app/lib/fta-portal-rate-shared";

export type {
  PortalFtaChapter,
  PortalFtaGuide,
  PortalFtaHsItem,
  PortalFtaNation,
  PortalFtaYearRate,
} from "@/app/lib/fta-portal-rate-shared";

/** 관세청 FTA 포털 nation_code → 기존 CLHS fta_cd (부가 안내·추천 보강용) */
export const PORTAL_TO_CL_FTA: Record<string, string> = {
  CL: "FCL",
  SG: "FSG",
  NO: "FEF",
  IS: "FEF",
  CH: "FEF",
  AS: "FAS",
  IN: "FIN",
  EU: "FEU",
  PE: "FPE",
  US: "FUS",
  TR: "FTR",
  AU: "FAU",
  CA: "FCA",
  CN: "FCN",
  NZ: "FNZ",
  VE: "FVN",
  CO: "FCO",
  NI: "FCE",
  HN: "FCE",
  CR: "FCE",
  SV: "FCE",
  PA: "FCE",
  GB: "FGB",
  RA: "FRC",
  RU: "FRC",
  RC: "FRC",
  RJ: "FRC",
  RN: "FRC",
  IL: "FIL",
  KH: "FKH",
  ID: "FID",
  PP: "FPH",
  AE: "FAE",
};

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

export function portalFtaTablesReady(db: DatabaseSync): boolean {
  if (!hasTable(db, "fta_agreement_master") || !hasTable(db, "fta_hs_item")) {
    return false;
  }
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM fta_hs_item
        WHERE length(replace(hs_no,' ','')) >= 10`,
    )
    .get() as { n: number } | undefined;
  return num(row?.n) > 0;
}

export function clFtaCdForPortal(nationCode: string): string {
  const c = nationCode.trim().toUpperCase();
  return PORTAL_TO_CL_FTA[c] ?? (c.startsWith("F") ? c : `F${c}`);
}

function formatRateTxt(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/%|면제|무세|종량|원\b/i.test(t)) return t;
  if (/^-?\d+(\.\d+)?$/.test(t)) return `${t}%`;
  return t;
}

function parseRateVal(raw: string): number | null {
  const m = raw.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

export function listPortalFtaNations(db: DatabaseSync): ClFtaNationRow[] {
  return listPortalAgreementTabs(db)
    .filter((n) => n.nation_code !== "ALL")
    .map((n) => ({
      fta_cd: n.nation_code,
      fta_nm: n.nation_name_kr || n.nation_name_en || n.nation_code,
      nation_nm: n.nation_name_kr || n.nation_name_en || n.nation_code,
      cert_desc: "",
      psr_desc: "",
      effect_dt: "",
      treaty_url: "",
      sort_no: n.tab_order,
      base_yr: "",
      rate_count: n.rate_count,
    }));
}

/** FTA 포털 협정 탭(전체 포함) */
export function listPortalAgreementTabs(db: DatabaseSync): PortalFtaNation[] {
  if (!hasTable(db, "fta_agreement_master")) return [];
  const hasItems = hasTable(db, "fta_hs_item");
  const sql = hasItems
    ? `SELECT m.nation_code, m.nation_name_kr, m.nation_name_en, m.fta_id,
              m.tab_order,
              (SELECT COUNT(*) FROM fta_hs_item i
                WHERE i.nation_code = m.nation_code
                  AND length(replace(i.hs_no,' ','')) >= 10) AS rate_count
         FROM fta_agreement_master m
        WHERE UPPER(TRIM(IFNULL(m.crawl_yn,'Y'))) = 'Y'
        ORDER BY COALESCE(m.tab_order, 9999), m.nation_code`
    : `SELECT nation_code, nation_name_kr, nation_name_en, fta_id,
              tab_order, 0 AS rate_count
         FROM fta_agreement_master
        WHERE UPPER(TRIM(IFNULL(crawl_yn,'Y'))) = 'Y'
        ORDER BY COALESCE(tab_order, 9999), nation_code`;

  return (db.prepare(sql).all() as Record<string, unknown>[]).map((r) => {
    const code = str(r.nation_code).toUpperCase();
    return {
      nation_code: code,
      nation_name_kr: str(r.nation_name_kr) || (code === "ALL" ? "전체" : code),
      nation_name_en: str(r.nation_name_en) || (code === "ALL" ? "All FTA" : ""),
      fta_id: str(r.fta_id),
      tab_order: num(r.tab_order),
      rate_count: num(r.rate_count),
    };
  });
}

export function listPortalChapters(
  db: DatabaseSync,
  nationCode: string,
): PortalFtaChapter[] {
  if (!hasTable(db, "fta_hs_chapter") || !nationCode || nationCode === "ALL") {
    return [];
  }
  return (
    db
      .prepare(
        `SELECT chapter_code, chapter_name_kr, chapter_name_en
           FROM fta_hs_chapter
          WHERE UPPER(TRIM(nation_code)) = UPPER(TRIM(?))
          ORDER BY chapter_code`,
      )
      .all(nationCode) as Record<string, unknown>[]
  ).map((r) => ({
    chapter_code: str(r.chapter_code).padStart(2, "0"),
    chapter_name_kr: str(r.chapter_name_kr),
    chapter_name_en: str(r.chapter_name_en),
  }));
}

export function listPortalHsGuides(db: DatabaseSync): PortalFtaGuide[] {
  if (!hasTable(db, "fta_hs_base_guide")) return [];
  return (
    db
      .prepare(
        `SELECT guide_type, agreement_name, base_ref
           FROM fta_hs_base_guide
          ORDER BY guide_id`,
      )
      .all() as Record<string, unknown>[]
  ).map((r) => ({
    guide_type: str(r.guide_type),
    agreement_name: str(r.agreement_name),
    base_ref: str(r.base_ref),
  }));
}

export function queryPortalHsItems(
  db: DatabaseSync,
  params: {
    nationCode?: string;
    chapter?: string;
    q?: string;
    qType?: "hs" | "ko" | "en";
    page: number;
    pageSize: number;
  },
): { rows: PortalFtaHsItem[]; total: number } {
  if (!hasTable(db, "fta_hs_item")) return { rows: [], total: 0 };

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(
    200,
    Math.max(10, Math.floor(params.pageSize) || 50),
  );
  const nation = str(params.nationCode).toUpperCase();
  const chapter = str(params.chapter).replace(/\D/g, "").slice(0, 2);
  const qType = params.qType ?? "hs";
  const qRaw = str(params.q);
  const qHs = qRaw.replace(/\D/g, "");

  const where: string[] = [];
  const bind: unknown[] = [];

  if (nation && nation !== "ALL") {
    where.push("UPPER(TRIM(i.nation_code)) = ?");
    bind.push(nation);
  }
  if (chapter) {
    where.push("substr(replace(i.hs_no,' ',''),1,2) = ?");
    bind.push(chapter.padStart(2, "0"));
  }
  if (qType === "hs" && qHs) {
    where.push("replace(i.hs_no,' ','') LIKE ?");
    bind.push(`${qHs}%`);
  } else if (qType === "ko" && qRaw) {
    where.push("i.item_name LIKE ?");
    bind.push(`%${qRaw}%`);
  } else if (qType === "en" && qRaw) {
    where.push(
      "(i.item_name LIKE ? OR EXISTS (SELECT 1 FROM fta_hs_chapter c2 WHERE c2.nation_code = i.nation_code AND c2.chapter_code = substr(replace(i.hs_no,' ',''),1,2) AND c2.chapter_name_en LIKE ?))",
    );
    bind.push(`%${qRaw}%`, `%${qRaw}%`);
  }

  if (!where.length) {
    return { rows: [], total: 0 };
  }

  const whereSql = where.join(" AND ");
  const hasMaster = hasTable(db, "fta_agreement_master");
  const fromSql = `FROM fta_hs_item i
    ${
      hasMaster
        ? "LEFT JOIN fta_agreement_master m ON m.nation_code = i.nation_code"
        : ""
    }`;

  const total = num(
    (
      db
        .prepare(`SELECT COUNT(*) AS n ${fromSql} WHERE ${whereSql}`)
        .get(...bind) as { n: number }
    )?.n,
  );
  const offset = (page - 1) * pageSize;

  const rows = (
    db
      .prepare(
        `SELECT UPPER(TRIM(i.nation_code)) AS nation_code,
                ${hasMaster ? "COALESCE(m.nation_name_kr,'')" : "''"} AS nation_name_kr,
                replace(i.hs_no,' ','') AS hs_no,
                COALESCE(i.division,'') AS division,
                COALESCE(i.item_name,'') AS item_name,
                COALESCE(i.base_year,'') AS base_year,
                COALESCE(i.base_rate,'') AS base_rate,
                COALESCE(i.has_year_link,'N') AS has_year_link
           ${fromSql}
          WHERE ${whereSql}
          ORDER BY replace(i.hs_no,' ',''), i.nation_code
          LIMIT ? OFFSET ?`,
      )
      .all(...bind, pageSize, offset) as Record<string, unknown>[]
  ).map((r) => ({
    nation_code: str(r.nation_code).toUpperCase(),
    nation_name_kr: str(r.nation_name_kr),
    hs_no: str(r.hs_no),
    division: str(r.division),
    item_name: str(r.item_name),
    base_year: str(r.base_year),
    base_rate: formatRateTxt(str(r.base_rate)),
    has_year_link: str(r.has_year_link).toUpperCase() === "Y",
  }));

  return { rows, total };
}

export function listPortalYearRates(
  db: DatabaseSync,
  nationCode: string,
  hsNo: string,
): PortalFtaYearRate[] {
  if (!hasTable(db, "fta_hs_rate_year") || !nationCode || !hsNo) return [];
  const hs = hsNo.replace(/\D/g, "");
  return (
    db
      .prepare(
        `SELECT rate_year, agreement_rate
           FROM fta_hs_rate_year
          WHERE UPPER(TRIM(nation_code)) = UPPER(TRIM(?))
            AND replace(hs_no,' ','') = ?
          ORDER BY rate_year`,
      )
      .all(nationCode, hs) as Record<string, unknown>[]
  ).map((r) => ({
    rate_year: str(r.rate_year),
    agreement_rate: formatRateTxt(str(r.agreement_rate)),
  }));
}

export function listPortalFtaRateCodes(
  db: DatabaseSync,
  nationCode: string,
): ClFtaRateCdRow[] {
  if (!hasTable(db, "fta_agreement_master") || !nationCode) return [];
  const row = db
    .prepare(
      `SELECT nation_code, nation_name_kr, fta_id, tab_order
         FROM fta_agreement_master
        WHERE UPPER(TRIM(nation_code)) = UPPER(TRIM(?))
        LIMIT 1`,
    )
    .get(nationCode) as Record<string, unknown> | undefined;
  if (!row) return [];
  const code = str(row.nation_code).toUpperCase();
  const nm = str(row.nation_name_kr) || code;
  const rateCd = str(row.fta_id) || code;
  return [
    {
      rate_cd: rateCd,
      fta_cd: code,
      nation_nm: nm,
      grp_nm: "협정세율",
      sort_no: num(row.tab_order) || 1,
    },
  ];
}

export function listPortalFtaHs2Options(
  db: DatabaseSync,
  nationCode: string,
): ClFtaHs2Option[] {
  if (!hasTable(db, "fta_hs_item") || !nationCode) return [];
  const hasCh = hasTable(db, "fta_hs_chapter");
  const sql = hasCh
    ? `SELECT substr(replace(i.hs_no,' ',''),1,2) AS hs2,
              MAX(COALESCE(c.chapter_name_kr,'')) AS hs2_nm,
              COUNT(DISTINCT replace(i.hs_no,' ','')) AS n
         FROM fta_hs_item i
         LEFT JOIN fta_hs_chapter c
           ON c.nation_code = i.nation_code
          AND c.chapter_code = substr(replace(i.hs_no,' ',''),1,2)
        WHERE UPPER(TRIM(i.nation_code)) = UPPER(TRIM(?))
          AND length(replace(i.hs_no,' ','')) >= 10
        GROUP BY substr(replace(i.hs_no,' ',''),1,2)
        ORDER BY 1`
    : `SELECT substr(replace(hs_no,' ',''),1,2) AS hs2,
              '' AS hs2_nm,
              COUNT(DISTINCT replace(hs_no,' ','')) AS n
         FROM fta_hs_item
        WHERE UPPER(TRIM(nation_code)) = UPPER(TRIM(?))
          AND length(replace(hs_no,' ','')) >= 10
        GROUP BY substr(replace(hs_no,' ',''),1,2)
        ORDER BY 1`;
  return (db.prepare(sql).all(nationCode) as Record<string, unknown>[]).map(
    (r) => ({
      hs2: str(r.hs2).padStart(2, "0"),
      hs2_nm: str(r.hs2_nm),
      n: num(r.n),
    }),
  );
}

export function queryPortalFtaRates(
  db: DatabaseSync,
  params: {
    ftaCd?: string;
    hs?: string;
    hs2?: string;
    page: number;
    pageSize: number;
  },
): { rows: ClFtaRateListRow[]; total: number } {
  if (!hasTable(db, "fta_hs_item")) return { rows: [], total: 0 };

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(
    200,
    Math.max(10, Math.floor(params.pageSize) || 50),
  );
  const ftaCd = str(params.ftaCd).toUpperCase();
  const hs = str(params.hs).replace(/\D/g, "");
  const hs2 = str(params.hs2).replace(/\D/g, "").slice(0, 2).padStart(2, "0");

  const where: string[] = [`length(replace(i.hs_no,' ','')) >= 10`];
  const bind: unknown[] = [];
  if (ftaCd && ftaCd !== "ALL") {
    where.push("UPPER(TRIM(i.nation_code)) = ?");
    bind.push(ftaCd);
  }
  if (hs) {
    where.push("replace(i.hs_no,' ','') LIKE ?");
    bind.push(`${hs}%`);
  } else if (hs2 && hs2 !== "00") {
    where.push("substr(replace(i.hs_no,' ',''),1,2) = ?");
    bind.push(hs2);
  }
  if (where.length <= 1 && !hs && (!hs2 || hs2 === "00") && !ftaCd) {
    return { rows: [], total: 0 };
  }

  const whereSql = where.join(" AND ");
  const hasMaster = hasTable(db, "fta_agreement_master");
  const hasCh = hasTable(db, "fta_hs_chapter");

  const fromSql = `FROM fta_hs_item i
    ${
      hasMaster
        ? "LEFT JOIN fta_agreement_master m ON m.nation_code = i.nation_code"
        : ""
    }
    ${
      hasCh
        ? `LEFT JOIN fta_hs_chapter c
             ON c.nation_code = i.nation_code
            AND c.chapter_code = substr(replace(i.hs_no,' ',''),1,2)`
        : ""
    }`;

  const total = num(
    (
      db
        .prepare(`SELECT COUNT(*) AS n ${fromSql} WHERE ${whereSql}`)
        .get(...bind) as { n: number }
    )?.n,
  );
  const offset = (page - 1) * pageSize;

  const rows = (
    db
      .prepare(
        `SELECT UPPER(TRIM(i.nation_code)) AS fta_cd,
                ${hasMaster ? "COALESCE(m.nation_name_kr,'')" : "''"} AS fta_nm,
                replace(i.hs_no,' ','') AS hsk_cd,
                substr(replace(i.hs_no,' ',''),1,2) AS hs2,
                substr(replace(i.hs_no,' ',''),1,4) AS hs4,
                substr(replace(i.hs_no,' ',''),1,6) AS hs6,
                ${hasCh ? "COALESCE(c.chapter_name_kr,'')" : "''"} AS hs2_nm,
                COALESCE(i.item_name,'') AS hsk_nm,
                '' AS hsk_nm_en,
                COALESCE(NULLIF(i.fta_id,''), i.nation_code) AS rate_cd,
                ${hasMaster ? "COALESCE(m.nation_name_kr,'')" : "''"} AS nation_nm,
                '협정세율' AS grp_nm,
                COALESCE(NULLIF(TRIM(i.base_rate),''), '') AS rate_raw,
                COALESCE(NULLIF(TRIM(i.base_year),''), '') AS base_year
           ${fromSql}
          WHERE ${whereSql}
          ORDER BY replace(i.hs_no,' ',''), i.nation_code
          LIMIT ? OFFSET ?`,
      )
      .all(...bind, pageSize, offset) as Record<string, unknown>[]
  ).map((r, idx) => {
    const rateRaw = str(r.rate_raw);
    const rateTxt = formatRateTxt(rateRaw);
    return {
      fta_cd: str(r.fta_cd).toUpperCase(),
      fta_nm: str(r.fta_nm),
      hsk_cd: str(r.hsk_cd),
      hs2: str(r.hs2),
      hs4: str(r.hs4),
      hs6: str(r.hs6),
      hs2_nm: str(r.hs2_nm),
      hsk_nm: str(r.hsk_nm),
      hsk_nm_en: str(r.hsk_nm_en),
      rate_cd: str(r.rate_cd),
      nation_nm: str(r.nation_nm),
      grp_nm: str(r.grp_nm) || "협정세율",
      rate_txt: rateTxt,
      rate_val: parseRateVal(rateRaw),
      row_no: idx + 1 + offset,
    };
  });

  return { rows, total };
}

export function listPortalFtaPsr(
  db: DatabaseSync,
  nationCode: string,
  hs2?: string,
): ClFtaPsrRow[] {
  if (!hasTable(db, "fta_psr_item") || !nationCode) return [];
  const key = nationCode.trim().toLowerCase();
  const hs2n = str(hs2).replace(/\D/g, "").slice(0, 2).padStart(2, "0");
  const sql = hs2n
    ? `SELECT agreement_key, category_code, preference_criterion_ko, item_name_ko
         FROM fta_psr_item
        WHERE LOWER(TRIM(agreement_key)) = ?
          AND category_code = ?
        ORDER BY hs_code
        LIMIT 200`
    : `SELECT agreement_key, category_code, preference_criterion_ko, item_name_ko
         FROM fta_psr_item
        WHERE LOWER(TRIM(agreement_key)) = ?
        ORDER BY category_code, hs_code
        LIMIT 200`;
  const raw = (
    hs2n
      ? (db.prepare(sql).all(key, hs2n) as Record<string, unknown>[])
      : (db.prepare(sql).all(key) as Record<string, unknown>[])
  ).map((r) => ({
    fta_cd: nationCode.toUpperCase(),
    hs2: str(r.category_code).padStart(2, "0"),
    psr_txt: str(r.preference_criterion_ko),
    note_txt: str(r.item_name_ko),
    base_desc: "",
    refs: [],
  }));
  return raw;
}
