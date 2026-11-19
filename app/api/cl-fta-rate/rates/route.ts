import { openClFtaRateDb, queryClFtaRates } from "@/app/lib/cl-fta-rate-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const ftaCd = u.searchParams.get("ftaCd")?.trim() ?? "";
    const hs = (u.searchParams.get("hs") ?? "").replace(/\D/g, "");
    const preferCl = u.searchParams.get("source") === "cl";
    if (!ftaCd && !hs) {
      return NextResponse.json(
        { ok: false, error: "ftaCd 또는 hs가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openClFtaRateDb();
    try {
      const { rows, total } = queryClFtaRates(db, {
        ftaCd,
        hs,
        hs2: u.searchParams.get("hs2") ?? "",
        page: Number(u.searchParams.get("page") ?? "1"),
        pageSize: Number(u.searchParams.get("pageSize") ?? "50"),
        preferCl,
      });
      return NextResponse.json({ ok: true, rows, total });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
