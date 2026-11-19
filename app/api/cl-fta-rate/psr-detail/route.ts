import {
  getClFtaPsrDetail,
  openClFtaRateDb,
} from "@/app/lib/cl-fta-rate-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const refFta = u.searchParams.get("refFta")?.trim() ?? "";
    const psrId = u.searchParams.get("psrId")?.trim() ?? "";
    if (!refFta || !psrId) {
      return NextResponse.json(
        { ok: false, error: "refFta, psrId가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openClFtaRateDb();
    try {
      const detail = getClFtaPsrDetail(db, refFta, psrId);
      if (!detail) {
        return NextResponse.json(
          { ok: false, error: "상세 정보가 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, detail });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
