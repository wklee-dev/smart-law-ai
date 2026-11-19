import { listClFtaPsr, openClFtaRateDb } from "@/app/lib/cl-fta-rate-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const ftaCd = u.searchParams.get("ftaCd")?.trim() ?? "";
    const preferCl = u.searchParams.get("source") === "cl";
    if (!ftaCd) {
      return NextResponse.json(
        { ok: false, error: "ftaCd가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openClFtaRateDb();
    try {
      const rows = listClFtaPsr(
        db,
        ftaCd,
        u.searchParams.get("hs2") ?? "",
        preferCl ? { preferCl: true } : undefined,
      );
      return NextResponse.json({ ok: true, rows });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
