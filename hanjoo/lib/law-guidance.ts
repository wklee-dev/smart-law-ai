import { withSmartLawDb } from "@/hanjoo/lib/smart-law-db";

export type LawGuidanceRow = {
  law: string;
  exportAgencies: string[];
  importAgencies: string[];
};

function split(value: unknown): string[] {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, rows) => rows.indexOf(item) === index);
}

export async function listLawGuidance(): Promise<LawGuidanceRow[]> {
  return withSmartLawDb(async (db) => {
    const agg = (expr: string) =>
      db.dialect === "postgres"
        ? `STRING_AGG(DISTINCT ${expr}, ',')`
        : `GROUP_CONCAT(DISTINCT ${expr})`;
    const rows = await db.all(
      `SELECT TRIM(r.related_law_name) AS law,
              ${agg(`CASE
                WHEN r.imex_tpcd = '1' OR r.imex_name LIKE '%수출%'
                THEN TRIM(a.agency_name) END`)} AS export_agencies,
              ${agg(`CASE
                WHEN r.imex_tpcd = '2' OR r.imex_name LIKE '%수입%'
                THEN TRIM(a.agency_name) END`)} AS import_agencies
         FROM clip_cc_item_requirement r
         LEFT JOIN clip_cc_requirement_agency a ON a.requirement_id = r.requirement_id
        WHERE TRIM(IFNULL(r.related_law_name,'')) <> ''
        GROUP BY TRIM(r.related_law_name)
        ORDER BY law`,
    );
    return rows.map((row) => ({
      law: String(row.law ?? "").trim(),
      exportAgencies: split(row.export_agencies),
      importAgencies: split(row.import_agencies),
    }));
  });
}
