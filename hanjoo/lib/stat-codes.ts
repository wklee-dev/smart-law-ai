import {
  smartLawTableExists,
  withSmartLawDb,
  type SmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

const CAT = "clip_statistical_code";
const DET = "clip_statistical_code_detail";

export type StatCategory = { code: string; sign: string; name: string };
export type StatDetail = {
  code: string;
  nameKr: string;
  abbrKr: string;
  abbrEn: string;
  nameEn: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function pageOf(page: number, pageSize: number) {
  const size = Math.min(100, Math.max(5, pageSize || 10));
  const p = Math.max(1, page || 1);
  return { page: p, pageSize: size, offset: (p - 1) * size };
}

export async function listStatCategories(input: {
  keyword?: string;
  sign?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  ready: boolean;
  rows: StatCategory[];
  total: number;
  page: number;
  signs: string[];
}> {
  const { page, pageSize, offset } = pageOf(input.page ?? 1, input.pageSize ?? 10);
  const keyword = str(input.keyword);
  const sign = str(input.sign);
  return withSmartLawDb(async (db: SmartLawDb) => {
    if (!(await smartLawTableExists(db, CAT))) {
      return { ready: false, rows: [], total: 0, page, signs: [] };
    }
    const where: string[] = [];
    const params: unknown[] = [];
    if (keyword) {
      where.push("(stat_name LIKE ? OR stat_code LIKE ?)");
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    if (sign) {
      where.push("stat_sign = ?");
      params.push(sign);
    }
    const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number(
      (await db.get(`SELECT COUNT(*) AS n FROM ${CAT} ${sql}`, params))?.n ?? 0,
    );
    const rows = (
      await db.all(
        `SELECT stat_code, stat_sign, stat_name FROM ${CAT} ${sql}
          ORDER BY stat_name, stat_code LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      )
    ).map((row) => ({
      code: str(row.stat_code),
      sign: str(row.stat_sign),
      name: str(row.stat_name),
    }));
    const signs = (
      await db.all(
        `SELECT DISTINCT stat_sign FROM ${CAT} WHERE TRIM(IFNULL(stat_sign,'')) <> '' ORDER BY stat_sign`,
      )
    ).map((row) => str(row.stat_sign));
    return { ready: true, rows, total, page, signs };
  });
}

export async function listStatDetails(input: {
  code?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: StatDetail[]; total: number; page: number }> {
  const { page, pageSize, offset } = pageOf(input.page ?? 1, input.pageSize ?? 10);
  const code = str(input.code);
  const keyword = str(input.keyword);
  if (!code) return { rows: [], total: 0, page };
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, DET))) return { rows: [], total: 0, page };
    const where = ["stat_code = ?"];
    const params: unknown[] = [code];
    if (keyword) {
      where.push(
        "(detail_code LIKE ? OR name_kr LIKE ? OR abbr_kr LIKE ? OR abbr_en LIKE ? OR name_en LIKE ?)",
      );
      const like = `%${keyword}%`;
      params.push(like, like, like, like, like);
    }
    const sql = `WHERE ${where.join(" AND ")}`;
    const total = Number(
      (await db.get(`SELECT COUNT(*) AS n FROM ${DET} ${sql}`, params))?.n ?? 0,
    );
    const rows = (
      await db.all(
        `SELECT detail_code, name_kr, abbr_kr, abbr_en, name_en FROM ${DET} ${sql}
          ORDER BY source_seq, detail_code LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      )
    ).map((row) => ({
      code: str(row.detail_code),
      nameKr: str(row.name_kr),
      abbrKr: str(row.abbr_kr),
      abbrEn: str(row.abbr_en),
      nameEn: str(row.name_en),
    }));
    return { rows, total, page };
  });
}
