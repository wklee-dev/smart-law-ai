import { listTreeByPrefix, openTariffDb } from "@/hanjoo/lib/tariff-db";
import { defaultCountry, defaultYear } from "@/hanjoo/lib/paths";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const hs = u.searchParams.get("hs")?.trim() ?? "";
    if (!hs) {
      return NextResponse.json({ ok: false, error: "hs가 필요합니다." }, { status: 400 });
    }
    const year = Number(u.searchParams.get("year") ?? defaultYear());
    const country = (u.searchParams.get("country") ?? defaultCountry()).toUpperCase();
    const db = await openTariffDb();
    try {
      return NextResponse.json({
        ok: true,
        year,
        country,
        hs,
        nodes: await listTreeByPrefix(db, hs, year, country),
      });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
