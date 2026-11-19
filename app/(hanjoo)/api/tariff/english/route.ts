import {
  getEnManualChapter,
  listEnManualChapters,
  listEnManualYears,
  resolveEnManualYear,
} from "@/hanjoo/lib/hs-manual-en";
import { ENGLISH_SECTION_LABEL } from "@/hanjoo/lib/english-hsk-labels";
import { listChapters, openTariffDb } from "@/hanjoo/lib/tariff-db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tariffChaptersForYear(year: string) {
  const db = await openTariffDb();
  try {
    return await listChapters(db, Number(year), "KR");
  } finally {
    await db.close();
  }
}

/**
 * English HSK / WCO Explanatory Notes
 * - no hs: index (years + chapters with English titles from hs_manual_*)
 * - hs=21: chapter detail (section/chapter notes + heading notes)
 */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const years = await listEnManualYears();
    const year = await resolveEnManualYear(
      u.searchParams.get("year") ?? years[0] ?? "",
    );
    const hsRaw = (u.searchParams.get("hs") ?? "").replace(/\D/g, "");
    const tariff = await tariffChaptersForYear(year);
    const tariffByCode = new Map(tariff.map((c) => [c.chapter_code, c]));

    if (hsRaw) {
      const hs = hsRaw.slice(0, 2).padStart(2, "0");
      const detail = await getEnManualChapter(year, hs);
      const all = await listEnManualChapters(year);
      const hit = tariffByCode.get(hs);
      const section_code = hit?.section_code ?? "";
      const section_name =
        ENGLISH_SECTION_LABEL[section_code] || hit?.section_name || "";

      return NextResponse.json({
        ok: true,
        years,
        year,
        sourceLabel: detail.sourceLabel,
        chapter: detail.chapter
          ? {
              ...detail.chapter,
              section_code,
              section_name,
            }
          : null,
        chapters: all.map((c) => {
          const tar = tariffByCode.get(c.chapter_code);
          return {
            chapter_code: c.chapter_code,
            chapter_name_en: c.chapter_name_en,
            section_code: tar?.section_code ?? "",
            section_name:
              ENGLISH_SECTION_LABEL[tar?.section_code ?? ""] ||
              tar?.section_name ||
              "",
          };
        }),
        headings: detail.headings.map((h) => ({
          heading_code: h.heading_code,
          heading_name_en: h.heading_name_en,
          note: h.note,
        })),
      });
    }

    const enChapters = await listEnManualChapters(year);
    const enByCode = new Map(enChapters.map((c) => [c.chapter_code, c]));

    let chapters = tariff.map((c) => {
      const en = enByCode.get(c.chapter_code);
      return {
        section_code: c.section_code,
        section_name: ENGLISH_SECTION_LABEL[c.section_code] || c.section_name,
        chapter_code: c.chapter_code,
        chapter_name: c.chapter_name,
        chapter_name_en: en?.chapter_name_en || c.chapter_name_en || c.chapter_name,
      };
    });

    if (!chapters.length) {
      chapters = enChapters.map((c) => ({
        section_code: "",
        section_name: "",
        chapter_code: c.chapter_code,
        chapter_name: c.chapter_name_en,
        chapter_name_en: c.chapter_name_en,
      }));
    }

    return NextResponse.json({
      ok: true,
      years,
      year,
      sourceLabel: `${year} WCO Explanatory Notes`,
      chapters,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
