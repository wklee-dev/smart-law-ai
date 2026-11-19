import { NextResponse } from "next/server";
import { loadCountriesFromClipJson } from "@/app/lib/clip-countries";
import { scheduleCountryPred } from "@/app/tariff/lib/tariff-schedule-sql";
import {
  getTariffScheduleDbPath,
  withTariffScheduleDb,
} from "@/app/tariff/lib/tariff-schedule-db";

export const runtime = "nodejs";

function normYear(v: unknown): number | null {
  const n =
    typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function uniqYearsDescending(rows: { year: unknown }[]): number[] {
  const nums = rows
    .map((r) => normYear(r.year))
    .filter((y): y is number => y != null);
  return [...new Set(nums)].sort((a, b) => b - a);
}

export async function GET() {
  try {
    const payload = await withTariffScheduleDb(async (db) => {
      const clipList = loadCountriesFromClipJson();
      const clipByCode = new Map(
        clipList.map((c) => [c.code.trim().toUpperCase(), c.name.trim()]),
      );

      const fromDb = (await db.all(
        `SELECT UPPER(TRIM(IFNULL(country_code,''))) AS code,
                MAX(TRIM(country_name)) AS name
         FROM tariff_section
         GROUP BY UPPER(TRIM(IFNULL(country_code,'')))
         ORDER BY CASE UPPER(TRIM(IFNULL(country_code,''))) WHEN 'KR' THEN 0 ELSE 1 END,
                  name`,
      )) as { code: string; name: string }[];

      const codeToName = new Map<string, string>();
      for (const r of fromDb) {
        const code = (r.code ?? "").trim().toUpperCase();
        if (!code) continue;
        codeToName.set(code, clipByCode.get(code) ?? (r.name ?? "").trim());
      }
      for (const c of clipList) {
        const code = c.code.trim().toUpperCase();
        if (!code) continue;
        if (!codeToName.has(code)) {
          codeToName.set(code, c.name.trim());
        }
      }

      const ordered: { code: string; name: string }[] = [];
      const placed = new Set<string>();
      for (const c of clipList) {
        const code = c.code.trim().toUpperCase();
        if (!code || !codeToName.has(code) || placed.has(code)) continue;
        placed.add(code);
        ordered.push({ code, name: codeToName.get(code)! });
      }
      const dbOnly: { code: string; name: string }[] = [];
      for (const [code, name] of codeToName) {
        if (!placed.has(code)) dbOnly.push({ code, name });
      }
      dbOnly.sort((a, b) =>
        a.name.localeCompare(b.name, "ko", { sensitivity: "base" }),
      );
      const countries = [...ordered, ...dbOnly];

      const allYears = uniqYearsDescending(
        (await db.all(
          `SELECT DISTINCT CAST(year AS INTEGER) AS year
           FROM tariff_section
           WHERE year IS NOT NULL
             AND TRIM(CAST(year AS TEXT)) != ''
           ORDER BY CAST(year AS INTEGER) DESC`,
        )) as { year: unknown }[],
      );

      const yearsByCountry: Record<string, number[]> = {};
      for (const c of countries) {
        yearsByCountry[c.code] = uniqYearsDescending(
          (await db.all(
            `SELECT DISTINCT CAST(year AS INTEGER) AS year
             FROM tariff_section ts
             WHERE ${scheduleCountryPred("ts")}
               AND ts.year IS NOT NULL
               AND TRIM(CAST(ts.year AS TEXT)) != ''
             ORDER BY CAST(ts.year AS INTEGER) DESC`,
            [c.code],
          )) as { year: unknown }[],
        );
      }

      return { countries, yearsByCountry, allYears };
    });

    return NextResponse.json({
      ok: true,
      ...(process.env.NODE_ENV !== "production"
        ? { scheduleDbPath: getTariffScheduleDbPath() }
        : {}),
      ...payload,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("tariff/schedule/meta:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
