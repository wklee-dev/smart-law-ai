import {
  getYtgPageDetail,
  openYtgDb,
} from "@/app/lib/yestrade-guideline-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const pageId = Number(new URL(req.url).searchParams.get("pageId") ?? "0");
    if (!pageId) {
      return NextResponse.json(
        { ok: false, error: "pageId가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openYtgDb();
    try {
      const page = getYtgPageDetail(db, pageId);
      if (!page) {
        return NextResponse.json(
          { ok: false, error: "화면을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, page });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
