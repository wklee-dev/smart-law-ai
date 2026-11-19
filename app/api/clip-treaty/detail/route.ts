import { NextResponse } from "next/server";
import {
  getClipTreatyDetail,
  openClipTreatyDb,
} from "@/app/lib/clip-treaty-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const u = new URL(req.url);
  const trtySrno = u.searchParams.get("trtySrno")?.trim();
  if (!trtySrno) {
    return NextResponse.json({ error: "trtySrno가 필요합니다." }, { status: 400 });
  }
  try {
    const db = openClipTreatyDb();
    try {
      const detail = getClipTreatyDetail(db, trtySrno);
      if (!detail) {
        return NextResponse.json({ error: "항목을 찾을 수 없습니다." }, { status: 404 });
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
