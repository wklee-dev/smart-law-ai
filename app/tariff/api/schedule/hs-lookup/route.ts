import { NextRequest, NextResponse } from "next/server";
import {
  chapterCodeFromHeading,
  normalizeHeadingCode,
  normalizeHsDigits,
} from "@/app/tariff/lib/tariff-hs-display";
import { withTariffScheduleDb } from "@/app/tariff/lib/tariff-schedule-db";
import {
  scheduleCountryPred,
  scheduleYearPred,
} from "@/app/tariff/lib/tariff-schedule-sql";

export const runtime = "nodejs";

function normalizeTwoCode(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d.length) return "";
  return d.slice(0, 2).padStart(2, "0");
}

/** HS 코드 검색 → 국내관세율 상세목록(호) 이동용 메타 */
export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const countryCode = (u.get("countryCode") ?? "KR").trim().toUpperCase();
    const year = Number(u.get("year") ?? "");
    const hsDigits = normalizeHsDigits(u.get("hsCode") ?? "").slice(0, 10);

    if (
      !countryCode ||
      !Number.isFinite(year) ||
      year <= 0 ||
      hsDigits.length < 4
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "countryCode, year, hsCode(4자리 이상)가 필요합니다.",
        },
        { status: 400 },
      );
    }

    type Row = {
      hs_code: string;
      heading_code: string;
      chapter_code: string;
      section_code: string;
      item_name: string;
      item_name_en: string;
    };

    const row = await withTariffScheduleDb(async (db) => {
      const hsNorm = "replace(trim(t.hs_code),' ','')";

      const exact = (await db.get(
        `SELECT IFNULL(hs_code,'') AS hs_code,
                IFNULL(heading_code,'') AS heading_code,
                IFNULL(chapter_code,'') AS chapter_code,
                IFNULL(section_code,'') AS section_code,
                IFNULL(item_name,'') AS item_name,
                IFNULL(item_name_en,'') AS item_name_en
         FROM tariff_item t
         WHERE ${scheduleYearPred("t")}
           AND ${scheduleCountryPred("t")}
           AND ${hsNorm} = ?
         LIMIT 1`,
        [year, countryCode, hsDigits],
      )) as Row | undefined;

      const headingCode = normalizeHeadingCode(hsDigits);
      let found = exact;

      if (!found) {
        const commonPrefixLen = (a: string, b: string) => {
          const n = Math.min(a.length, b.length);
          let i = 0;
          while (i < n && a[i] === b[i]) i += 1;
          return i;
        };
        const hamming = (a: string, b: string) => {
          const n = Math.max(a.length, b.length);
          let d = Math.abs(a.length - b.length);
          const m = Math.min(a.length, b.length);
          for (let i = 0; i < m; i += 1) {
            if (a[i] !== b[i]) d += 1;
          }
          return d;
        };
        for (let len = hsDigits.length; len >= 4; len -= 1) {
          const candidates = (await db.all(
            `SELECT IFNULL(hs_code,'') AS hs_code,
                    IFNULL(heading_code,'') AS heading_code,
                    IFNULL(chapter_code,'') AS chapter_code,
                    IFNULL(section_code,'') AS section_code,
                    IFNULL(item_name,'') AS item_name,
                    IFNULL(item_name_en,'') AS item_name_en
             FROM tariff_item t
             WHERE ${scheduleYearPred("t")}
               AND ${scheduleCountryPred("t")}
               AND ${hsNorm} LIKE ?`,
            [year, countryCode, `${hsDigits.slice(0, len)}%`],
          )) as Row[];
          if (!candidates.length) continue;
          candidates.sort((a, b) => {
            const na = normalizeHsDigits(a.hs_code);
            const nb = normalizeHsDigits(b.hs_code);
            const ca = commonPrefixLen(na, hsDigits);
            const cb = commonPrefixLen(nb, hsDigits);
            if (cb !== ca) return cb - ca;
            const ha = hamming(na, hsDigits);
            const hb = hamming(nb, hsDigits);
            if (ha !== hb) return ha - hb;
            if (nb.length !== na.length) return nb.length - na.length;
            return na.localeCompare(nb);
          });
          found = candidates[0];
          break;
        }
      }

      if (!found) {
        found = (await db.get(
          `SELECT IFNULL(hs_code,'') AS hs_code,
                  IFNULL(heading_code,'') AS heading_code,
                  IFNULL(chapter_code,'') AS chapter_code,
                  IFNULL(section_code,'') AS section_code,
                  IFNULL(item_name,'') AS item_name,
                  IFNULL(item_name_en,'') AS item_name_en
           FROM tariff_item t
           WHERE ${scheduleYearPred("t")}
             AND ${scheduleCountryPred("t")}
             AND (
               TRIM(IFNULL(t.heading_code,'')) = TRIM(?)
               OR CAST(TRIM(IFNULL(t.heading_code,'')) AS INTEGER) = CAST(? AS INTEGER)
             )
           ORDER BY length(${hsNorm}) ASC, ${hsNorm} ASC
           LIMIT 1`,
          [
            year,
            countryCode,
            headingCode,
            parseInt(headingCode, 10),
          ],
        )) as Row | undefined;
      }

      return found ?? null;
    });

    if (!row) {
      return NextResponse.json(
        {
          ok: false,
          error: `해당 HS(${hsDigits}) 품목을 찾을 수 없습니다.`,
        },
        { status: 404 },
      );
    }

    const headingCode = normalizeHeadingCode(hsDigits);
    const chapterFallback = normalizeTwoCode(chapterCodeFromHeading(headingCode));
    const resolvedHeading = normalizeHeadingCode(
      row.heading_code || headingCode,
    );
    const resolvedChapter =
      normalizeTwoCode(row.chapter_code) || chapterFallback;
    const resolvedSection = normalizeTwoCode(row.section_code);

    return NextResponse.json({
      ok: true,
      countryCode,
      year,
      hsCode: hsDigits,
      matchedHsCode: normalizeHsDigits(row.hs_code),
      headingCode: resolvedHeading,
      chapterCode: resolvedChapter,
      sectionCode: resolvedSection,
      itemName: row.item_name,
      itemNameEn: row.item_name_en,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("tariff/schedule/hs-lookup:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
