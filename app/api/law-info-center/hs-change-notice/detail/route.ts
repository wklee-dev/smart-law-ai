import {
  getLlcHsChangeNoticeDetail,
  openLlcHsChangeNoticeDb,
} from "@/app/lib/llc-hs-change-notice-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const id = Number(u.searchParams.get("id") ?? "0");
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openLlcHsChangeNoticeDb();
    try {
      const detail = getLlcHsChangeNoticeDetail(db, id);
      if (!detail) {
        return NextResponse.json(
          { ok: false, error: "해당 고시를 찾을 수 없습니다." },
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
