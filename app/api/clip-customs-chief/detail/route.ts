import { NextResponse } from "next/server";
import {
  getClipCustomsChiefDetail,
  openClipCustomsChiefDb,
} from "@/app/lib/clip-customs-chief-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
    }

    const db = openClipCustomsChiefDb();
    try {
      const detail = getClipCustomsChiefDetail(db, id);
      if (!detail) {
        return NextResponse.json({ error: "데이터 없음" }, { status: 404 });
      }
      return NextResponse.json({ detail });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
