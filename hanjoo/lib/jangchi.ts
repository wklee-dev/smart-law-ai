import {
  smartLawTableExists,
  withSmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

const TABLE = "jangchi_code";

export type JangchiRow = {
  code: string;
  name: string;
  customs: string;
  importDept: string;
  exportDept: string;
  extraTax: string;
  address: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function pageOf(page: number, pageSize: number) {
  const size = Math.min(100, Math.max(5, pageSize || 20));
  const p = Math.max(1, page || 1);
  return { page: p, pageSize: size, offset: (p - 1) * size };
}

export async function searchJangchi(input: {
  code?: string;
  name?: string;
  customs?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: JangchiRow[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize, offset } = pageOf(input.page ?? 1, input.pageSize ?? 20);
  const code = str(input.code);
  const name = str(input.name);
  const customs = str(input.customs);
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, TABLE))) return { rows: [], total: 0, page, pageSize };
    const where: string[] = [];
    const params: unknown[] = [];
    if (code) {
      where.push("jangchi_code LIKE ?");
      params.push(`${code}%`);
    }
    if (name) {
      where.push("jangchi_name LIKE ?");
      params.push(`%${name}%`);
    }
    if (customs) {
      where.push("(jangchi_se LIKE ? OR substr(jangchi_code, 1, 3) LIKE ?)");
      params.push(`${customs}%`, `${customs}%`);
    }
    const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = Number(
      (await db.get(`SELECT COUNT(*) AS n FROM ${TABLE} ${sql}`, params))?.n ?? 0,
    );
    const rows = (
      await db.all(
        `SELECT jangchi_code, jangchi_name, jangchi_se, jangchi_gwa, jangchi_egwa,
                jangchi_gasan_yn, jangchi_juso
           FROM ${TABLE} ${sql}
          ORDER BY jangchi_code
          LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
      )
    ).map((row) => ({
      code: str(row.jangchi_code),
      name: str(row.jangchi_name),
      customs: str(row.jangchi_se) || str(row.jangchi_code).slice(0, 3),
      importDept: str(row.jangchi_gwa),
      exportDept: str(row.jangchi_egwa),
      extraTax: str(row.jangchi_gasan_yn),
      address: str(row.jangchi_juso),
    }));
    return { rows, total, page, pageSize };
  });
}
