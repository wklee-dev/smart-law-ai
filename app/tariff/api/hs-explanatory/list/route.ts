import { NextRequest, NextResponse } from "next/server";
import { hsManualListPreview } from "@/app/lib/hs-explanatory-html";
import { withTariffDb } from "@/app/tariff/lib/tariff-db";

export const runtime = "nodejs";

/** sortBy 키 → ORDER BY 표현식 (별칭 m). `hierarchy`는 별도 처리(류→부→호). */
const SORT_SQL: Record<string, string> = {
  division: "m.manl_orgn_tpcd_nm",
  year: "CAST(m.aply_year AS INTEGER)",
  unit: "m.manl_ut_tpcd",
  hs: "LENGTH(m.manl_ut_sgn), m.manl_ut_sgn",
  content: "COALESCE(m.display_title, '')",
};

/** 같은 2자리 묶음에서 부(01) → 류(02) → 호(03), 호는 0101, 0102… 순 (원본 UNIPASS) */
function orderClauseHierarchy(sortDir: "ASC" | "DESC"): string {
  return `ORDER BY
    CAST(
      CASE m.manl_ut_tpcd
        WHEN '03' THEN substr(trim(m.manl_ut_sgn), 1, 2)
        ELSE trim(m.manl_ut_sgn)
      END AS INTEGER
    ) ${sortDir},
    CASE m.manl_ut_tpcd
      WHEN '01' THEN 1
      WHEN '02' THEN 2
      WHEN '03' THEN 3
      ELSE 4
    END ASC,
    length(trim(m.manl_ut_sgn)) ASC,
    trim(m.manl_ut_sgn) ASC`;
}

function orgFilter(
  alias: string,
  division: string,
): { sql: string; params: unknown[] } {
  const col = `${alias}.`;
  const d = (division ?? "WCO").trim().toUpperCase();
  if (d === "KR" || d === "한국") {
    return {
      sql: `(${col}manl_orgn_tpcd_nm LIKE ? OR ${col}manl_orgn_tpcd = ?)`,
      params: ["%한국%", "KR"],
    };
  }
  return { sql: `${col}manl_orgn_tpcd_nm = ?`, params: ["WCO"] };
}

export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const year = Number(u.get("year") ?? "");
    const division = (u.get("division") ?? "WCO").trim() || "WCO";
    const hsRaw = (u.get("hs") ?? "").trim();
    const qRaw = (u.get("q") ?? "").trim();
    const page = Math.max(1, Number(u.get("page") ?? "1") || 1);
    const pageSize = Math.min(
      100,
      Math.max(5, Number(u.get("pageSize") ?? "10") || 10),
    );
    const offset = (page - 1) * pageSize;

    const sortKey = u.get("sortBy")?.trim() ?? "hierarchy";
    const orderExpr = SORT_SQL[sortKey] ?? SORT_SQL.hs!;
    const sortDir: "ASC" | "DESC" =
      u.get("sortDir")?.toLowerCase() === "desc" ? "DESC" : "ASC";

    const payload = await withTariffDb(async (db) => {
      const { sql: orgSql, params: orgParams } = orgFilter("m", division);

      const years = (
        await db.all(
          `SELECT DISTINCT m.aply_year AS y
           FROM hs_manual_meta m
           WHERE ${orgSql}`,
          orgParams,
        )
      )
        .map((r) => Number(r.y))
        .filter((y) => Number.isFinite(y) && y > 0)
        .sort((a, b) => b - a);

      const effYear =
        Number.isFinite(year) && year > 0 ? year : (years[0] ?? 2022);
      const effYearStr = String(effYear);

      const hsPat = hsRaw ? `${hsRaw.replace(/%/g, "")}%` : null;
      const qPat = qRaw ? `%${qRaw.replace(/%/g, "")}%` : null;

      const whereParts: string[] = ["m.aply_year = ?", orgSql];
      const baseParams: unknown[] = [effYearStr, ...orgParams];

      if (hsPat) {
        whereParts.push("m.manl_ut_sgn LIKE ?");
        baseParams.push(hsPat);
      }
      if (qPat) {
        whereParts.push(
          `(m.display_title LIKE ? OR EXISTS (
             SELECT 1 FROM hs_manual_content c
             WHERE c.meta_id = m.id AND c.content_text LIKE ?
           ))`,
        );
        baseParams.push(qPat, qPat);
      }

      const whereSql = whereParts.join(" AND ");
      const total = Number(
        (await db.get(
          `SELECT COUNT(*) AS c FROM hs_manual_meta m WHERE ${whereSql}`,
          baseParams,
        ))?.c ?? 0,
      );

      const orderSql =
        sortKey === "hierarchy"
          ? orderClauseHierarchy(sortDir)
          : `ORDER BY ${orderExpr} ${sortDir}, m.manl_ut_tpcd ASC, LENGTH(m.manl_ut_sgn), m.manl_ut_sgn ASC`;

      const rows = (await db.all(
        `SELECT
          m.id,
          m.manl_orgn_tpcd_nm,
          m.aply_year,
          m.manl_ut_tpcd,
          m.manl_ut_tpcd_nm,
          m.manl_ut_sgn,
          m.display_title
        FROM hs_manual_meta m
        WHERE ${whereSql}
        ${orderSql}
        LIMIT ? OFFSET ?`,
        [...baseParams, pageSize, offset],
      )) as {
        id: number;
        manl_orgn_tpcd_nm: string | null;
        aply_year: string;
        manl_ut_tpcd: string;
        manl_ut_tpcd_nm: string | null;
        manl_ut_sgn: string;
        display_title: string | null;
      }[];

      return { years, effYear, total, rows };
    });

    const recordTypeFromTpcd = (tp: string): string => {
      if (tp === "01") return "section";
      if (tp === "02") return "chapter";
      if (tp === "03") return "heading";
      return "other";
    };

    const divLabel =
      division.toUpperCase() === "KR" || division === "한국"
        ? "한국"
        : "WCO";

    return NextResponse.json({
      ok: true,
      division,
      years: payload.years,
      year: payload.effYear,
      page,
      pageSize,
      total: payload.total,
      sortBy: sortKey,
      sortDir: sortDir.toLowerCase(),
      items: payload.rows.map((r) => ({
        id: r.id,
        recordType: recordTypeFromTpcd(r.manl_ut_tpcd),
        division: divLabel,
        manalOrg: r.manl_orgn_tpcd_nm ?? "",
        year: Number(r.aply_year),
        unitLevel: r.manl_ut_tpcd_nm ?? "",
        hsClass: r.manl_ut_sgn ?? "",
        contentPreview: hsManualListPreview(r.display_title ?? "", 500),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("tariff/hs-explanatory/list:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
