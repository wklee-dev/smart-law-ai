import { NextRequest, NextResponse } from "next/server";
import {
  sectionNameEnSelectAsync,
  withTariffScheduleDb,
} from "@/app/tariff/lib/tariff-schedule-db";
import {
  scheduleCountryPred,
  scheduleYearPred,
} from "@/app/tariff/lib/tariff-schedule-sql";

export const runtime = "nodejs";

/** ?countryCode=KR&year=2026 */
export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const countryCode = (u.get("countryCode") ?? "KR").trim().toUpperCase();
    const year = Number(u.get("year") ?? "");

    if (!countryCode || !Number.isFinite(year) || year <= 0) {
      return NextResponse.json(
        { ok: false, error: "countryCode, year 가 필요합니다." },
        { status: 400 },
      );
    }

    const sections = await withTariffScheduleDb(async (db) => {
      const nameEn = await sectionNameEnSelectAsync(db, "ts");
      return db.all(
        `SELECT section_code, section_name,
                ${nameEn} AS section_name_en,
                record_uuid
         FROM tariff_section ts
         WHERE ${scheduleYearPred("ts")}
           AND ${scheduleCountryPred("ts")}
         ORDER BY CAST(ts.section_code AS INTEGER) ASC`,
        [year, countryCode],
      );
    });

    return NextResponse.json({
      ok: true,
      countryCode,
      year,
      sections,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("tariff/schedule/sections:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
