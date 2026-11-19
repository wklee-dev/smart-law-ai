import { listChapters, listHeadingNodes, listHeadings, openTariffDb } from "@/hanjoo/lib/tariff-db";
import { defaultCountry, defaultYear } from "@/hanjoo/lib/paths";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const hs = (u.searchParams.get("hs") ?? "").replace(/\D/g, "");
    if (hs.length < 4) {
      return NextResponse.json({ ok: false, error: "호(HS4)가 필요합니다." }, { status: 400 });
    }
    const year = Number(u.searchParams.get("year") ?? defaultYear());
    const country = (u.searchParams.get("country") ?? defaultCountry()).toUpperCase();
    const headingCode = hs.slice(0, 4);
    const chapterCode = headingCode.slice(0, 2);
    const db = await openTariffDb();
    try {
      const chapters = await listChapters(db, year, country);
      const chapter = chapters.find((c) => c.chapter_code === chapterCode) ?? null;
      const headings = await listHeadings(db, chapterCode, year, country);
      const heading = headings.find((h) => h.heading_code === headingCode) ?? null;
      const nodes = await listHeadingNodes(db, headingCode, year, country);
      if (!heading && nodes.length === 0) {
        return NextResponse.json({ ok: false, error: "해당 호를 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json({
        ok: true,
        year,
        country,
        step: 3,
        chapter,
        heading: heading ?? {
          heading_code: headingCode,
          heading_name: "",
          heading_name_en: "",
        },
        headings,
        nodes,
      });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
