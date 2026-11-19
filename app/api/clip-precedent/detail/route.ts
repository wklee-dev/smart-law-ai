import { NextResponse } from "next/server";
import {
  getClipPrecedentDetail,
  openClipPrecedentDb,
} from "@/app/lib/clip-precedent-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const u = new URL(req.url);
  const dsbdIncdNo = u.searchParams.get("dsbdIncdNo")?.trim();
  if (!dsbdIncdNo) {
    return NextResponse.json(
      { error: "dsbdIncdNo가 필요합니다." },
      { status: 400 },
    );
  }
  try {
    const db = openClipPrecedentDb();
    try {
      const detail = getClipPrecedentDetail(db, dsbdIncdNo);
      if (!detail) {
        return NextResponse.json(
          { error: "항목을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json(detail);
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
