import {
  getClipAdminNoticeDetail,
  openClipAdminNoticeDb,
} from "@/app/lib/clip-admin-notice-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openClipAdminNoticeDb();
    try {
      const post = getClipAdminNoticeDetail(db, id);
      if (!post) {
        return NextResponse.json(
          { ok: false, error: "게시글을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, post });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
