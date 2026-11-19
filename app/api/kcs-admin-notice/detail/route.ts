import {
  getKcsAdminNoticeDetail,
  openKcsAdminNoticeDb,
} from "@/app/lib/kcs-admin-notice-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? "");
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
    }
    const db = openKcsAdminNoticeDb();
    try {
      const post = getKcsAdminNoticeDetail(db, id);
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
