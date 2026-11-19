import { openClFtaRateDb } from "@/app/lib/cl-fta-rate-server";
import { listPortalChapters } from "@/app/lib/fta-portal-rate-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const ftaCd = new URL(req.url).searchParams.get("ftaCd")?.trim() ?? "";
    if (!ftaCd) {
      return NextResponse.json(
        { ok: false, error: "ftaCd가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openClFtaRateDb();
    try {
      return NextResponse.json({
        ok: true,
        chapters: listPortalChapters(db, ftaCd),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
