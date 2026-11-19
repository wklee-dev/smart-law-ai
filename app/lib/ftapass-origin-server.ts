/**
 * FTA PASS 원산지결정기준 (구 협정별약어)
 * 우선: fta_pass_origin_rules (FTAPASS crawler V1)
 * 폴백: ftapass_origin_determination (구 수집)
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

const RULES_TABLE = "fta_pass_origin_rules";
const LEGACY_TABLE = "ftapass_origin_determination";
const INPUT_HS_TABLE = "ftapass_input_hs";

export function getFtaPassDbPath(): string {
  return (
    process.env.FTAPASS_DB_PATH?.trim() ||
    process.env.LAW_DB_PATH?.trim() ||
    getSmartLawSqliteDbPath()
  ).trim();
}

export function openFtaPassDb(): DatabaseSync {
  const p = path.resolve(getFtaPassDbPath());
  if (!fs.existsSync(p)) {
    throw new Error(`FTA PASS DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly: true });
}

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
    )
    .get(name) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

function tableCount(db: DatabaseSync, name: string): number {
  if (!tableExists(db, name)) return 0;
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get() as {
    n: number;
  };
  return Number(row?.n) || 0;
}

/** 신규 규칙 테이블에 데이터가 있으면 우선 사용 */
function useRulesTable(db: DatabaseSync): boolean {
  return tableCount(db, RULES_TABLE) > 0;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/** 원본 FTA PASS 적용협정 표시 순서 */
const AGREEMENT_ORDER = [
  "KORAP",
  "KORCP",
  "KOREF",
  "KOREU",
  "KORNZ",
  "KORUS",
  "KORVN",
  "KORSG",
  "KORAE",
  "KORAS",
  "KORUK",
  "KORIL",
  "KORIN",
  "KORID",
  "KORCN",
  "KORC1",
  "KORC2",
  "KORCL",
  "KORKH",
  "KORCA",
  "KORCO",
  "KORTR",
  "KORPE",
  "KORPH",
  "KORAU",
  "KORKR",
];

export type FtaPassAgreement = {
  code: string;
  name: string;
  nameEn: string;
  count: number;
};

export type FtaPassOriginRow = {
  id: number;
  stdyy: string;
  ontAgreeCd: string;
  ontAgreeNm: string;
  hs6Cd: string;
  gods4Name: string;
  gods6Name: string;
  orgDcsnBase: string;
  coPrtCd: string;
  lastStdyy: string;
};

function orderAgreements(
  rows: {
    code: string;
    name: string;
    name_en: string;
    n: number;
  }[],
): FtaPassAgreement[] {
  const byCode = new Map(
    rows.map((r) => [
      str(r.code),
      {
        code: str(r.code),
        name: str(r.name),
        nameEn: str(r.name_en),
        count: Number(r.n) || 0,
      },
    ]),
  );
  const ordered: FtaPassAgreement[] = [];
  for (const code of AGREEMENT_ORDER) {
    const hit = byCode.get(code);
    if (hit) {
      ordered.push(hit);
      byCode.delete(code);
    }
  }
  for (const hit of byCode.values()) ordered.push(hit);
  return ordered;
}

export function listFtaPassStdYears(): string[] {
  const db = openFtaPassDb();
  try {
    if (useRulesTable(db)) {
      const rows = db
        .prepare(
          `SELECT DISTINCT hs_version AS y FROM ${RULES_TABLE}
           WHERE hs_version IS NOT NULL AND TRIM(hs_version) != ''
           ORDER BY hs_version DESC`,
        )
        .all() as { y: string }[];
      return rows.map((r) => str(r.y));
    }
    if (!tableExists(db, LEGACY_TABLE)) return [];
    const rows = db
      .prepare(
        `SELECT DISTINCT stdyy AS y FROM ${LEGACY_TABLE}
         WHERE stdyy IS NOT NULL AND TRIM(stdyy) != ''
         ORDER BY stdyy DESC`,
      )
      .all() as { y: string }[];
    return rows.map((r) => str(r.y));
  } finally {
    db.close();
  }
}

export function listFtaPassAgreements(): FtaPassAgreement[] {
  const db = openFtaPassDb();
  try {
    if (useRulesTable(db)) {
      const rows = db
        .prepare(
          `SELECT agreement_code AS code,
                  MAX(agreement_name) AS name,
                  '' AS name_en,
                  COUNT(*) AS n
             FROM ${RULES_TABLE}
            WHERE agreement_code IS NOT NULL AND TRIM(agreement_code) != ''
            GROUP BY agreement_code`,
        )
        .all() as {
        code: string;
        name: string;
        name_en: string;
        n: number;
      }[];
      return orderAgreements(rows);
    }
    if (!tableExists(db, LEGACY_TABLE)) return [];
    const rows = db
      .prepare(
        `SELECT ont_agree_cd AS code,
                MAX(ont_agree_nm) AS name,
                MAX(ont_agree_nm_en) AS name_en,
                COUNT(*) AS n
         FROM ${LEGACY_TABLE}
         WHERE ont_agree_cd IS NOT NULL AND TRIM(ont_agree_cd) != ''
         GROUP BY ont_agree_cd`,
      )
      .all() as {
      code: string;
      name: string;
      name_en: string;
      n: number;
    }[];
    return orderAgreements(rows);
  } finally {
    db.close();
  }
}

/** 세번 2자리 이상 입력 시 6자리 후보 목록 */
export function suggestFtaPassHs6(prefix: string, limit = 30): string[] {
  const digits = prefix.replace(/\D/g, "").slice(0, 6);
  if (digits.length < 2) return [];
  const cap = Math.min(50, Math.max(1, limit));
  const like = `${digits}%`;
  const db = openFtaPassDb();
  try {
    const parts: string[] = [];
    if (tableExists(db, INPUT_HS_TABLE)) {
      parts.push(
        `SELECT hs6_cd AS hs FROM ${INPUT_HS_TABLE} WHERE hs6_cd LIKE ?`,
      );
    }
    if (useRulesTable(db)) {
      parts.push(
        `SELECT DISTINCT hs6_code AS hs FROM ${RULES_TABLE} WHERE hs6_code LIKE ?`,
      );
    } else if (tableExists(db, LEGACY_TABLE)) {
      parts.push(
        `SELECT DISTINCT hs6_cd AS hs FROM ${LEGACY_TABLE} WHERE hs6_cd LIKE ?`,
      );
    }
    if (parts.length === 0) return [];
    const params = parts.map(() => like);
    const rows = db
      .prepare(
        `SELECT hs FROM (${parts.join(" UNION ")})
         WHERE length(hs) = 6
         ORDER BY hs
         LIMIT ?`,
      )
      .all(...params, cap) as { hs: string }[];
    return rows.map((r) => str(r.hs));
  } finally {
    db.close();
  }
}

export type FtaPassQuery = {
  stdyy?: string;
  ontAgreeCd?: string;
  hs6Cd?: string;
  recentStdyy?: boolean;
  page?: number;
  pageSize?: number;
};

export type FtaPassQueryResult = {
  items: FtaPassOriginRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function queryFtaPassOrigin(q: FtaPassQuery): FtaPassQueryResult {
  const stdyy = (q.stdyy ?? "").trim();
  const ontAgreeCd = (q.ontAgreeCd ?? "").trim();
  const hs6Cd = (q.hs6Cd ?? "").replace(/\D/g, "").slice(0, 6);
  const recent = Boolean(q.recentStdyy);
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 100));
  const page = Math.max(1, Number(q.page) || 1);

  if (!hs6Cd && !stdyy && !ontAgreeCd) {
    throw new Error("기준년도·적용협정·세번 중 하나 이상 입력하세요.");
  }
  if (hs6Cd && hs6Cd.length < 6) {
    throw new Error("세번은 6자리 이상이어야 합니다.");
  }

  const db = openFtaPassDb();
  try {
    if (useRulesTable(db)) {
      return queryFromRules(db, {
        stdyy,
        ontAgreeCd,
        hs6Cd,
        recent,
        page,
        pageSize,
      });
    }
    if (!tableExists(db, LEGACY_TABLE)) {
      throw new Error(
        `${RULES_TABLE} / ${LEGACY_TABLE} 테이블이 없습니다. FTAPASS 크롤을 실행하세요.`,
      );
    }
    return queryFromLegacy(db, {
      stdyy,
      ontAgreeCd,
      hs6Cd,
      recent,
      page,
      pageSize,
    });
  } finally {
    db.close();
  }
}

function queryFromRules(
  db: DatabaseSync,
  q: {
    stdyy: string;
    ontAgreeCd: string;
    hs6Cd: string;
    recent: boolean;
    page: number;
    pageSize: number;
  },
): FtaPassQueryResult {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.stdyy) {
    where.push("hs_version = ?");
    params.push(q.stdyy);
  }
  if (q.ontAgreeCd) {
    where.push("agreement_code = ?");
    params.push(q.ontAgreeCd);
  }
  if (q.hs6Cd) {
    where.push("hs6_code LIKE ?");
    params.push(q.hs6Cd.length === 6 ? q.hs6Cd : `${q.hs6Cd}%`);
  }
  if (q.recent) {
    where.push(`hs_version = (
      SELECT MAX(f2.hs_version) FROM ${RULES_TABLE} f2
      WHERE f2.hs6_code = ${RULES_TABLE}.hs6_code
        AND IFNULL(f2.agreement_code,'') = IFNULL(${RULES_TABLE}.agreement_code,'')
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM ${RULES_TABLE} ${whereSql}`)
    .get(...params) as { n: number };
  const total = Number(totalRow?.n) || 0;
  const totalPages = Math.max(1, Math.ceil(total / q.pageSize));
  const offset = (q.page - 1) * q.pageSize;

  const rows = db
    .prepare(
      `SELECT rowid AS id, hs_version AS stdyy, agreement_code AS ont_agree_cd,
              agreement_name AS ont_agree_nm, hs6_code AS hs6_cd,
              goods4_name AS gods4_name, goods6_name AS gods6_name,
              origin_rule_text AS org_dcsn_base, abbreviation AS co_prt_cd,
              hs_version AS last_stdyy
         FROM ${RULES_TABLE}
         ${whereSql}
         ORDER BY agreement_name ASC, hs_version DESC, hs6_code ASC
         LIMIT ? OFFSET ?`,
    )
    .all(...params, q.pageSize, offset) as Record<string, unknown>[];

  return {
    items: rows.map(mapRow),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages,
  };
}

function queryFromLegacy(
  db: DatabaseSync,
  q: {
    stdyy: string;
    ontAgreeCd: string;
    hs6Cd: string;
    recent: boolean;
    page: number;
    pageSize: number;
  },
): FtaPassQueryResult {
  const where: string[] = [];
  const params: unknown[] = [];

  if (q.stdyy) {
    where.push("stdyy = ?");
    params.push(q.stdyy);
  }
  if (q.ontAgreeCd) {
    where.push("ont_agree_cd = ?");
    params.push(q.ontAgreeCd);
  }
  if (q.hs6Cd) {
    where.push("hs6_cd LIKE ?");
    params.push(q.hs6Cd.length === 6 ? q.hs6Cd : `${q.hs6Cd}%`);
  }
  if (q.recent) {
    where.push(`stdyy = (
      SELECT MAX(f2.stdyy) FROM ${LEGACY_TABLE} f2
      WHERE f2.hs6_cd = ${LEGACY_TABLE}.hs6_cd
        AND IFNULL(f2.ont_agree_cd,'') = IFNULL(${LEGACY_TABLE}.ont_agree_cd,'')
    )`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM ${LEGACY_TABLE} ${whereSql}`)
    .get(...params) as { n: number };
  const total = Number(totalRow?.n) || 0;
  const totalPages = Math.max(1, Math.ceil(total / q.pageSize));
  const offset = (q.page - 1) * q.pageSize;

  const rows = db
    .prepare(
      `SELECT id, stdyy, ont_agree_cd, ont_agree_nm, hs6_cd,
              gods4_name, gods6_name, org_dcsn_base, co_prt_cd, last_stdyy
         FROM ${LEGACY_TABLE}
         ${whereSql}
         ORDER BY ont_agree_nm ASC, stdyy DESC, hs6_cd ASC
         LIMIT ? OFFSET ?`,
    )
    .all(...params, q.pageSize, offset) as Record<string, unknown>[];

  return {
    items: rows.map(mapRow),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages,
  };
}

function mapRow(r: Record<string, unknown>): FtaPassOriginRow {
  return {
    id: Number(r.id) || 0,
    stdyy: str(r.stdyy),
    ontAgreeCd: str(r.ont_agree_cd),
    ontAgreeNm: str(r.ont_agree_nm),
    hs6Cd: str(r.hs6_cd),
    gods4Name: str(r.gods4_name),
    gods6Name: str(r.gods6_name),
    orgDcsnBase: str(r.org_dcsn_base),
    coPrtCd: str(r.co_prt_cd),
    lastStdyy: str(r.last_stdyy),
  };
}
