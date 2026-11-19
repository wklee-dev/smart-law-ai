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

/**
 * 부·류 목록 (부 를 rowspan 으로 묶을 수 있게 동일 section 의 chapter 를 순서대로)
 * ?countryCode=KR&year=2026&sectionCode=01 (선택)
 * &q=검색어
 */
export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const countryCode = (u.get("countryCode") ?? "KR").trim().toUpperCase();
    const year = Number(u.get("year") ?? "");
    const sectionFilter = (u.get("sectionCode") ?? "").trim();
    const q = (u.get("q") ?? "").trim();

    if (!countryCode || !Number.isFinite(year) || year <= 0) {
      return NextResponse.json(
        { ok: false, error: "countryCode, year 가 필요합니다." },
        { status: 400 },
      );
    }

    const items = await withTariffScheduleDb(async (db) => {
      const parts = [
        `${scheduleYearPred("tc")}`,
        `${scheduleCountryPred("tc")}`,
      ];
      const params: unknown[] = [year, countryCode];

      if (sectionFilter) {
        parts.push("TRIM(tc.section_code) = TRIM(?)");
        params.push(sectionFilter);
      }
      if (q) {
        const pat = `%${q.replace(/%/g, "")}%`;
        parts.push(
          "(tc.chapter_name LIKE ? OR IFNULL(tc.chapter_name_en,'') LIKE ? OR ts.section_name LIKE ?)",
        );
        params.push(pat, pat, pat);
      }

      const where = parts.join(" AND ");
      const nameEn = await sectionNameEnSelectAsync(db, "ts");

      return db.all(
        `SELECT
          tc.record_uuid AS chapterUuid,
          tc.section_code,
          tc.chapter_code,
          tc.chapter_name,
          IFNULL(tc.chapter_name_en, '') AS chapter_name_en,
          ts.section_name,
          ${nameEn} AS section_name_en,
          ts.record_uuid AS sectionUuid
        FROM tariff_chapter tc
        INNER JOIN tariff_section ts
          ON CAST(ts.year AS INTEGER) = CAST(tc.year AS INTEGER)
         AND TRIM(ts.section_code) = TRIM(tc.section_code)
         AND UPPER(TRIM(IFNULL(ts.country_code,''))) = UPPER(TRIM(IFNULL(tc.country_code,'')))
        WHERE ${where}
        ORDER BY CAST(tc.chapter_code AS INTEGER) ASC`,
        params,
      );
    });

    return NextResponse.json({
      ok: true,
      countryCode,
      year,
      sectionCode: sectionFilter || null,
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("tariff/schedule/section-chapters:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
