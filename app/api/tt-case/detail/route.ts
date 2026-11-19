import { NextResponse } from "next/server";
import { getTtCaseDetail, openTtCaseDb } from "@/app/lib/tt-case-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const demNo = Number(u.searchParams.get("demNo"));
    if (!Number.isFinite(demNo) || demNo <= 0) {
      return NextResponse.json(
        { error: "demNo 파라미터가 필요합니다." },
        { status: 400 },
      );
    }

    const db = await openTtCaseDb();
    try {
      const detail = await getTtCaseDetail(db, demNo);
      if (!detail) {
        return NextResponse.json(
          { error: "해당 결정문을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json({ detail });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
