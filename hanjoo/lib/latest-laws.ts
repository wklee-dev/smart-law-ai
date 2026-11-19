import {
  smartLawTableExists,
  withSmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

const TYPES = [
  { code: "", label: "전체" },
  { code: "A01", label: "법률" },
  { code: "A02", label: "시행령" },
  { code: "A03", label: "시행규칙" },
] as const;

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function likeEsc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export type LatestLawRow = {
  id: string;
  name: string;
  category: string;
  typeName: string;
  jurisdiction: string;
  enforcementDate: string;
  promulgationDate: string;
  revision: string;
};

export async function searchLatestLaws(input: {
  type?: string;
  category?: string;
  jurisdiction?: string;
  q?: string;
  page?: number;
}) {
  const pageSize = 20;
  const page = Math.max(Number(input.page) || 1, 1);
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "latest_laws"))) {
      return {
        rows: [] as LatestLawRow[],
        total: 0,
        page,
        pageSize,
        categories: [] as string[],
        jurisdictions: [] as string[],
        counts: { "": 0, A01: 0, A02: 0, A03: 0 },
      };
    }
    const categories = (
      await db.all(
        `SELECT DISTINCT category_name AS v FROM latest_laws
          WHERE TRIM(IFNULL(category_name,'')) <> ''
          ORDER BY v COLLATE NOCASE`,
      )
    ).map((r) => str(r.v));
    const jurisdictions = (
      await db.all(
        `SELECT DISTINCT jurisdiction_name AS v FROM latest_laws
          WHERE TRIM(IFNULL(jurisdiction_name,'')) <> ''
          ORDER BY v COLLATE NOCASE`,
      )
    ).map((r) => str(r.v));
    const countRows = await db.all(
      `SELECT law_type_code, COUNT(*) AS c FROM latest_laws GROUP BY law_type_code`,
    );
    const counts = { "": 0, A01: 0, A02: 0, A03: 0 };
    for (const r of countRows) {
      const n = Number(r.c) || 0;
      counts[""] += n;
      const code = str(r.law_type_code);
      if (code === "A01" || code === "A02" || code === "A03") counts[code] = n;
    }

    const clauses: string[] = [];
    const params: unknown[] = [];
    const type = str(input.type);
    if (type === "A01" || type === "A02" || type === "A03") {
      clauses.push("law_type_code = ?");
      params.push(type);
    }
    const category = str(input.category);
    if (category) {
      clauses.push("category_name = ?");
      params.push(category);
    }
    const jurisdiction = str(input.jurisdiction);
    if (jurisdiction) {
      clauses.push("jurisdiction_name = ?");
      params.push(jurisdiction);
    }
    const q = str(input.q);
    if (q) {
      clauses.push("law_name LIKE '%' || ? || '%' ESCAPE '\\'");
      params.push(likeEsc(q));
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const total = Number(
      (await db.get(`SELECT COUNT(*) AS c FROM latest_laws ${where}`, params))?.c ??
        0,
    );
    const rows = (
      await db.all(
        `SELECT law_id, pmgt_dt_tp_no, law_name, category_name, law_type_name,
                jurisdiction_name, enforcement_date, promulgation_date, revision_type_name
           FROM latest_laws
           ${where}
          ORDER BY (CASE WHEN promulgation_date IS NULL OR promulgation_date = '' THEN 1 ELSE 0 END),
                   promulgation_date DESC, law_id DESC
          LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize],
      )
    ).map((r) => ({
      id: `${str(r.law_id)}:${str(r.pmgt_dt_tp_no)}`,
      name: str(r.law_name),
      category: str(r.category_name),
      typeName: str(r.law_type_name),
      jurisdiction: str(r.jurisdiction_name),
      enforcementDate: str(r.enforcement_date),
      promulgationDate: str(r.promulgation_date),
      revision: str(r.revision_type_name),
    }));
    return { rows, total, page, pageSize, categories, jurisdictions, counts, types: TYPES };
  });
}

export async function listLatestLaws(limit = 3): Promise<LatestLawRow[]> {
  const take = Math.min(Math.max(limit, 1), 20);
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "latest_laws"))) return [];
    return (
      await db.all(
        `SELECT law_id, pmgt_dt_tp_no, law_name, category_name, law_type_name,
                jurisdiction_name, enforcement_date, promulgation_date, revision_type_name
           FROM latest_laws
          ORDER BY (CASE WHEN promulgation_date IS NULL OR promulgation_date = '' THEN 1 ELSE 0 END),
                   promulgation_date DESC, law_id DESC
          LIMIT ?`,
        [take],
      )
    ).map((r) => ({
      id: `${str(r.law_id)}:${str(r.pmgt_dt_tp_no)}`,
      name: str(r.law_name),
      category: str(r.category_name),
      typeName: str(r.law_type_name),
      jurisdiction: str(r.jurisdiction_name),
      enforcementDate: str(r.enforcement_date),
      promulgationDate: str(r.promulgation_date),
      revision: str(r.revision_type_name),
    }));
  });
}

export async function getLatestLaw(id: string) {
  const [lawId, pmgt] = id.split(":");
  if (!lawId || !pmgt) return null;
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "latest_laws"))) return null;
    const row = await db.get(
      `SELECT law_id, pmgt_dt_tp_no, law_name, category_name, law_type_name,
              jurisdiction_name, enforcement_date, promulgation_date, revision_type_name,
              law_body_text
         FROM latest_laws
        WHERE law_id = ? AND pmgt_dt_tp_no = ?`,
      [lawId, pmgt],
    );
    if (!row) return null;
    return {
      id: `${str(row.law_id)}:${str(row.pmgt_dt_tp_no)}`,
      name: str(row.law_name),
      category: str(row.category_name),
      typeName: str(row.law_type_name),
      jurisdiction: str(row.jurisdiction_name),
      enforcementDate: str(row.enforcement_date),
      promulgationDate: str(row.promulgation_date),
      revision: str(row.revision_type_name),
      body: str(row.law_body_text),
    };
  });
}
