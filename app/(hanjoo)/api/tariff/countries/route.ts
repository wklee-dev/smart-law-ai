import { listForeignCountries, openTariffDb } from "@/hanjoo/lib/tariff-db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await openTariffDb();
    try {
      return NextResponse.json({ ok: true, countries: await listForeignCountries(db) });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
