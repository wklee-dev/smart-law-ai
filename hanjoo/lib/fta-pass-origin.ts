import {
  smartLawTableExists,
  withSmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

const RULES = "fta_pass_origin_rules";

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

export type FtaAbbrAgreement = { code: string; name: string };
export type FtaAbbrRow = {
  id: number;
  year: string;
  agreement: string;
  hs: string;
  name4: string;
  name6: string;
  rule: string;
  abbr: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export async function ftaAbbrMeta(): Promise<{
  years: string[];
  agreements: FtaAbbrAgreement[];
}> {
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, RULES))) return { years: [], agreements: [] };
    const years = (
      await db.all(
        `SELECT DISTINCT hs_version AS y FROM ${RULES}
          WHERE hs_version IS NOT NULL AND TRIM(hs_version) != ''`,
      )
    )
      .map((r) => str(r.y))
      .filter(Boolean)
      .sort((a, b) => b.localeCompare(a, "en"));
    const rows = await db.all(
      `SELECT agreement_code AS code, MAX(agreement_name) AS name
         FROM ${RULES}
        WHERE agreement_code IS NOT NULL AND TRIM(agreement_code) != ''
        GROUP BY agreement_code`,
    );
    const byCode = new Map(
      rows.map((r) => [str(r.code), { code: str(r.code), name: str(r.name) }]),
    );
    const agreements: FtaAbbrAgreement[] = [];
    for (const code of AGREEMENT_ORDER) {
      const hit = byCode.get(code);
      if (hit) {
        agreements.push(hit);
        byCode.delete(code);
      }
    }
    for (const hit of byCode.values()) agreements.push(hit);
    return { years, agreements };
  });
}

export async function suggestFtaAbbrHs(prefix: string): Promise<string[]> {
  const digits = prefix.replace(/\D/g, "").slice(0, 6);
  if (digits.length < 2 || digits.length >= 6) return [];
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, RULES))) return [];
    const rows = await db.all(
      `SELECT DISTINCT hs6_code AS hs FROM ${RULES}
        WHERE hs6_code LIKE ? AND length(hs6_code) = 6
        ORDER BY hs6_code LIMIT 30`,
      [`${digits}%`],
    );
    return rows.map((r) => str(r.hs));
  });
}

export async function searchFtaAbbr(q: {
  year?: string;
  agreement?: string;
  hs?: string;
  recent?: boolean;
  page?: number;
}): Promise<{ rows: FtaAbbrRow[]; total: number; page: number }> {
  const year = (q.year ?? "").trim();
  const agreement = (q.agreement ?? "").trim();
  const hs = (q.hs ?? "").replace(/\D/g, "").slice(0, 6);
  if (!year && !agreement && !hs) {
    throw new Error("기준년도·적용협정·세번 중 하나 이상 입력하세요.");
  }
  if (hs && hs.length < 4) {
    throw new Error("세번은 4자리 이상 입력하세요.");
  }
  const pageSize = 20;
  const page = Math.max(1, q.page ?? 1);
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, RULES))) return { rows: [], total: 0, page: 1 };
    const where: string[] = [];
    const params: unknown[] = [];
    if (year) {
      where.push("hs_version = ?");
      params.push(year);
    }
    if (agreement) {
      where.push("agreement_code = ?");
      params.push(agreement);
    }
    if (hs) {
      where.push("hs6_code LIKE ?");
      params.push(hs.length === 6 ? hs : `${hs}%`);
    }
    if (q.recent) {
      where.push(`hs_version = (
        SELECT MAX(f2.hs_version) FROM ${RULES} f2
        WHERE f2.hs6_code = ${RULES}.hs6_code
          AND IFNULL(f2.agreement_code,'') = IFNULL(${RULES}.agreement_code,'')
      )`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number(
      (await db.get(`SELECT COUNT(*) AS n FROM ${RULES} ${whereSql}`, params))?.n ?? 0,
    );
    const offset = (page - 1) * pageSize;
    const rows = await db.all(
      `SELECT ${db.dialect === "postgres" ? "NULL" : "COALESCE(id, rowid)"} AS id, hs_version, agreement_name, hs6_code,
              goods4_name, goods6_name, origin_rule_text, abbreviation
         FROM ${RULES}
         ${whereSql}
        ORDER BY agreement_name, hs_version DESC, hs6_code
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    return {
      total,
      page,
      rows: rows.map((r, i) => ({
        id: Number(r.id) || offset + i + 1,
        year: str(r.hs_version),
        agreement: str(r.agreement_name),
        hs: str(r.hs6_code),
        name4: str(r.goods4_name),
        name6: str(r.goods6_name),
        rule: str(r.origin_rule_text),
        abbr: str(r.abbreviation),
      })),
    };
  });
}
