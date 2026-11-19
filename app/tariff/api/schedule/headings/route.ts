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

function chapterCodeMatch(alias: string, paramPlaceholder: string): string {
  return `(TRIM(IFNULL(${alias}.chapter_code,'')) = ${paramPlaceholder}
    OR CAST(TRIM(IFNULL(${alias}.chapter_code,'')) AS INTEGER) = CAST(? AS INTEGER))`;
}

/** 호 목록: ?countryCode=KR&year=2026&chapterCode=01 */
export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const countryCode = (u.get("countryCode") ?? "KR").trim().toUpperCase();
    const year = Number(u.get("year") ?? "");
    const chapterCode = (u.get("chapterCode") ?? "").trim();
    const chDigits = chapterCode.replace(/\D/g, "");
    const chapterNum =
      chDigits.length > 0 ? parseInt(chDigits, 10) : Number.NaN;

    if (
      !countryCode ||
      !Number.isFinite(year) ||
      year <= 0 ||
      !chapterCode ||
      !Number.isFinite(chapterNum)
    ) {
      return NextResponse.json(
        { ok: false, error: "countryCode, year, chapterCode 가 필요합니다." },
        { status: 400 },
      );
    }

    const payload = await withTariffScheduleDb(async (db) => {
      const chapter = (await db.get(
        `SELECT chapter_name, IFNULL(chapter_name_en,'') AS chapter_name_en,
                section_code, record_uuid
         FROM tariff_chapter tc
         WHERE ${scheduleYearPred("tc")}
           AND ${scheduleCountryPred("tc")}
           AND ${chapterCodeMatch("tc", "?")}
         LIMIT 1`,
        [year, countryCode, chapterCode.trim(), chapterNum],
      )) as
        | {
            chapter_name: string;
            chapter_name_en: string;
            section_code: string;
            record_uuid: string;
          }
        | undefined;

      const nameEn = await sectionNameEnSelectAsync(db, "ts");
      const section = chapter
        ? ((await db.get(
            `SELECT section_name, ${nameEn} AS section_name_en, record_uuid
             FROM tariff_section ts
             WHERE ${scheduleYearPred("ts")}
               AND ${scheduleCountryPred("ts")}
               AND TRIM(IFNULL(ts.section_code,'')) = TRIM(IFNULL(?, ''))
             LIMIT 1`,
            [year, countryCode, chapter.section_code.trim()],
          )) as
            | {
                section_name: string;
                section_name_en: string;
                record_uuid: string;
              }
            | undefined)
        : null;

      const headings = await db.all(
        `SELECT record_uuid, heading_code,
                heading_name,
                IFNULL(heading_name_en, '') AS heading_name_en
         FROM tariff_heading th
         WHERE ${scheduleYearPred("th")}
           AND ${scheduleCountryPred("th")}
           AND ${chapterCodeMatch("th", "?")}
         ORDER BY CAST(heading_code AS INTEGER) ASC`,
        [year, countryCode, chapterCode.trim(), chapterNum],
      );

      return { chapter: chapter ?? null, section: section ?? null, headings };
    });

    return NextResponse.json({
      ok: true,
      countryCode,
      year,
      chapterCode,
      chapter: payload.chapter
        ? {
            nameKr: payload.chapter.chapter_name,
            nameEn: payload.chapter.chapter_name_en,
            uuid: payload.chapter.record_uuid,
            sectionCode: payload.chapter.section_code,
          }
        : null,
      section: payload.section
        ? {
            nameKr: payload.section.section_name,
            nameEn: payload.section.section_name_en,
            code: payload.chapter?.section_code ?? "",
            uuid: payload.section.record_uuid,
          }
        : null,
      headings: payload.headings,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("tariff/schedule/headings:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
