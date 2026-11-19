import { listChapters, openTariffDb } from "@/hanjoo/lib/tariff-db";
import { defaultCountry, defaultYear } from "@/hanjoo/lib/paths";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const year = Number(u.searchParams.get("year") ?? defaultYear());
    const country = (u.searchParams.get("country") ?? defaultCountry()).toUpperCase();
    const db = await openTariffDb();
    try {
      return NextResponse.json({
        ok: true,
        year,
        country,
        chapters: await listChapters(db, year, country),
      });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
