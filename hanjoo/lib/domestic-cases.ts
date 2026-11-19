import {
  getSmartLawSqliteRow,
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

export type DomesticCaseRow = {
  id: number;
  committee_name: string;
  reff_no: string;
  enfr_dt: string;
  dtrm_hs_sgn: string;
  cmdt_nm: string;
  image_count: number;
};

export type DomesticImageRow = {
  id: number;
  cmdt_nm: string;
  dtrm_hs_sgn: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function digits(v: string): string {
  return v.replace(/\D/g, "");
}

function hsKeys(hsCode: string): string[] {
  const d = digits(hsCode);
  if (d.length < 8) return [];
  const keys = new Set<string>([d]);
  if (d.length >= 6) {
    const head = d.slice(0, 4);
    const sub = d.slice(4, 6);
    const rest = d.slice(6);
    keys.add(`${head}.${sub}-${rest}`);
    keys.add(`${head}.${sub}.${rest}`);
  }
  return [...keys];
}

function inSql(column: string, keys: string[]): string {
  return `${column} IN (${keys.map(() => "?").join(",")})`;
}

/** @deprecated 호환 re-export — `@/hanjoo/lib/smart-law-db` 사용 권장 */
export { openSmartLawDb };

export async function listLatestDomesticCases(
  db: SmartLawDb,
  limit = 3,
): Promise<DomesticCaseRow[]> {
  if (!(await smartLawTableExists(db, "classification_cases"))) return [];
  const take = Math.min(Math.max(limit, 1), 20);
  const rows = await db.all(
    `SELECT id, committee_name, reff_no, enfr_dt, dtrm_hs_sgn, cmdt_nm,
            CAST(COALESCE(imge_cnt, 0) AS INTEGER) AS image_count
       FROM classification_cases
      WHERE id IN (
        SELECT MAX(id) FROM classification_cases GROUP BY TRIM(rrdc_no)
      )
      ORDER BY (CASE WHEN enfr_dt IS NULL OR enfr_dt = '' THEN 1 ELSE 0 END),
               enfr_dt DESC, id DESC
      LIMIT ?`,
    [take],
  );
  return rows.map((r) => ({
    id: Number(r.id) || 0,
    committee_name: str(r.committee_name),
    reff_no: str(r.reff_no),
    enfr_dt: str(r.enfr_dt),
    dtrm_hs_sgn: str(r.dtrm_hs_sgn),
    cmdt_nm: str(r.cmdt_nm).replace(/\s+/g, " "),
    image_count: Number(r.image_count) || 0,
  }));
}

export async function countDomesticCasesByHs(db: SmartLawDb, hsCode: string): Promise<number> {
  const keys = hsKeys(hsCode);
  if (!keys.length || !(await smartLawTableExists(db, "classification_cases"))) return 0;
  const row = await db.get(
    `SELECT COUNT(*) AS c FROM (
       SELECT TRIM(rrdc_no) FROM classification_cases
        WHERE ${inSql("dtrm_hs_sgn", keys)}
        GROUP BY TRIM(rrdc_no)
     )`,
    keys,
  );
  return Number(row?.c) || 0;
}

export async function listDomesticCasesByHs(
  db: SmartLawDb,
  hsCode: string,
  limit = 15,
): Promise<DomesticCaseRow[]> {
  const keys = hsKeys(hsCode);
  if (!keys.length || !(await smartLawTableExists(db, "classification_cases"))) return [];
  const take = Math.min(Math.max(limit, 1), 1000);
  const rows = await db.all(
    `SELECT id, committee_name, reff_no, enfr_dt, dtrm_hs_sgn, cmdt_nm,
            CAST(COALESCE(imge_cnt, 0) AS INTEGER) AS image_count
       FROM classification_cases
      WHERE id IN (
        SELECT MAX(id) FROM classification_cases
         WHERE ${inSql("dtrm_hs_sgn", keys)}
         GROUP BY TRIM(rrdc_no)
      )
      ORDER BY (CASE WHEN enfr_dt IS NULL OR enfr_dt = '' THEN 1 ELSE 0 END),
               enfr_dt DESC, id DESC
      LIMIT ?`,
    [...keys, take],
  );
  return rows.map((r) => ({
    id: Number(r.id) || 0,
    committee_name: str(r.committee_name),
    reff_no: str(r.reff_no),
    enfr_dt: str(r.enfr_dt),
    dtrm_hs_sgn: str(r.dtrm_hs_sgn),
    cmdt_nm: str(r.cmdt_nm),
    image_count: Number(r.image_count) || 0,
  }));
}

export async function countDomesticImagesByHs(db: SmartLawDb, hsCode: string): Promise<number> {
  const keys = hsKeys(hsCode);
  if (
    !keys.length ||
    !(await smartLawTableExists(db, "classification_cases")) ||
    !(await smartLawTableExists(db, "case_images"))
  ) {
    return 0;
  }
  const row = await db.get(
    `SELECT COUNT(*) AS c FROM (
       SELECT i.case_id, i.image_seq
         FROM case_images i
        WHERE i.case_id IN (
          SELECT MAX(id) FROM classification_cases
           WHERE ${inSql("dtrm_hs_sgn", keys)}
           GROUP BY TRIM(rrdc_no)
        )
          AND COALESCE(i.image_size, 0) > 0
        GROUP BY i.case_id, i.image_seq
     )`,
    keys,
  );
  return Number(row?.c) || 0;
}

export async function listDomesticImagesByHs(
  db: SmartLawDb,
  hsCode: string,
  limit = 12,
): Promise<DomesticImageRow[]> {
  const keys = hsKeys(hsCode);
  if (
    !keys.length ||
    !(await smartLawTableExists(db, "classification_cases")) ||
    !(await smartLawTableExists(db, "case_images"))
  ) {
    return [];
  }
  const take = Math.min(Math.max(limit, 1), 80);
  const rows = await db.all(
    `SELECT MIN(i.id) AS id, MAX(c.cmdt_nm) AS cmdt_nm, MAX(c.dtrm_hs_sgn) AS dtrm_hs_sgn
       FROM case_images i
       JOIN classification_cases c ON c.id = i.case_id
      WHERE c.id IN (
        SELECT MAX(id) FROM classification_cases
         WHERE ${inSql("dtrm_hs_sgn", keys)}
         GROUP BY TRIM(rrdc_no)
      )
        AND COALESCE(i.image_size, 0) > 0
      GROUP BY c.id, i.image_seq
      ORDER BY MAX(c.enfr_dt) DESC, i.image_seq ASC
      LIMIT ?`,
    [...keys, take],
  );
  return rows.map((r) => ({
    id: Number(r.id) || 0,
    cmdt_nm: str(r.cmdt_nm),
    dtrm_hs_sgn: str(r.dtrm_hs_sgn),
  }));
}

export async function readDomesticImage(
  db: SmartLawDb,
  imageId: number,
): Promise<{ contentType: string; data: Uint8Array } | null> {
  if (!(await smartLawTableExists(db, "case_images")) || !Number.isFinite(imageId)) return null;
  const sql = "SELECT image_data, content_type FROM case_images WHERE id = ?";
  const row =
    db.dialect === "postgres" ? getSmartLawSqliteRow(sql, [imageId]) : await db.get(sql, [imageId]);
  const raw = row?.image_data;
  if (!(raw instanceof Uint8Array) || raw.byteLength === 0) return null;
  const contentType = str(row?.content_type) || "image/jpeg";
  return { contentType, data: raw };
}
