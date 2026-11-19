import { listChapters, listHeadings, openTariffDb } from "@/hanjoo/lib/tariff-db";
import { defaultCountry, defaultYear } from "@/hanjoo/lib/paths";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const hs = (u.searchParams.get("hs") ?? "").replace(/\D/g, "").slice(0, 2);
    if (!hs) {
      return NextResponse.json({ ok: false, error: "류(HS2)가 필요합니다." }, { status: 400 });
    }
    const year = Number(u.searchParams.get("year") ?? defaultYear());
    const country = (u.searchParams.get("country") ?? defaultCountry()).toUpperCase();
    const code = hs.padStart(2, "0");
    const db = await openTariffDb();
    try {
      const chapters = await listChapters(db, year, country);
      const chapter = chapters.find((c) => c.chapter_code === code) ?? null;
      if (!chapter) {
        return NextResponse.json({ ok: false, error: "해당 류를 찾을 수 없습니다." }, { status: 404 });
      }
      const headings = await listHeadings(db, code, year, country);
      return NextResponse.json({
        ok: true,
        year,
        country,
        step: 2,
        chapter,
        chapters: chapters.map((c) => ({
          chapter_code: c.chapter_code,
          chapter_name: c.chapter_name,
          chapter_name_en: c.chapter_name_en,
          section_code: c.section_code,
          section_name: c.section_name,
        })),
        headings,
      });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
