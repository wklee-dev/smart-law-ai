import {
  smartLawTableExists,
  withSmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

export type StrategicHit = {
  code: string;
  text: string;
};

function like(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function plain(value: unknown): string {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function searchStrategicGoods(field: string, query: string) {
  const q = query.trim();
  const mode = field === "hs" || field === "name" ? field : "control";
  if (!q) return { rows: [] as StrategicHit[], total: 0 };
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "kita_strategic_material_mapping"))) {
      return { rows: [] as StrategicHit[], total: 0 };
    }
    const where: string[] = [];
    const params: unknown[] = [];
    if (mode === "hs") {
      const digits = q.replace(/\D/g, "");
      if (!digits) return { rows: [] as StrategicHit[], total: 0 };
      where.push("replace(replace(m.hs_code, '.', ''), '-', '') LIKE ?");
      params.push(`${digits}%`);
    } else if (mode === "name") {
      const escaped = like(q);
      where.push(
        "(m.content_ko LIKE '%' || ? || '%' ESCAPE '\\' OR EXISTS (SELECT 1 FROM kita_strategic_material_hs h WHERE h.hs_code = m.hs_code AND h.hs_name_ko LIKE '%' || ? || '%' ESCAPE '\\'))",
      );
      params.push(escaped, escaped);
    } else {
      const code = like(q.replace(/\s+/g, "").toUpperCase());
      where.push("upper(replace(m.control_no, ' ', '')) LIKE ? ESCAPE '\\'");
      params.push(`${code}%`);
    }
    const whereSql = where.join(" AND ");
    const total = Number(
      (
        await db.get(
          `SELECT COUNT(*) AS n FROM (
             SELECT m.control_no
               FROM kita_strategic_material_mapping m
              WHERE ${whereSql}
              GROUP BY m.control_no
           )`,
          params,
        )
      )?.n ?? 0,
    );
    const rows = await db.all(
      `SELECT m.control_no AS code, MIN(m.content_ko) AS text
         FROM kita_strategic_material_mapping m
        WHERE ${whereSql}
        GROUP BY m.control_no
        ORDER BY m.control_no
        LIMIT 120`,
      params,
    );
    return {
      rows: rows.map((row) => ({ code: plain(row.code), text: plain(row.text) })),
      total,
    };
  });
}
