import { openClFtaRateDb } from "@/app/lib/cl-fta-rate-server";
import { listPortalYearRates } from "@/app/lib/fta-portal-rate-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const ftaCd = u.searchParams.get("ftaCd")?.trim() ?? "";
    const hs = (u.searchParams.get("hs") ?? "").replace(/\D/g, "");
    if (!ftaCd || !hs) {
      return NextResponse.json(
        { ok: false, error: "ftaCd, hs가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openClFtaRateDb();
    try {
      return NextResponse.json({
        ok: true,
        rows: listPortalYearRates(db, ftaCd, hs),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
