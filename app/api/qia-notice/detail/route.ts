import {
  getQiaNoticeDetail,
  openQiaNoticeDb,
} from "@/app/lib/qia-notice-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const postId = new URL(req.url).searchParams.get("postId")?.trim() ?? "";
    if (!postId) {
      return NextResponse.json(
        { ok: false, error: "postId 필요" },
        { status: 400 },
      );
    }
    const db = openQiaNoticeDb();
    try {
      const post = getQiaNoticeDetail(db, postId);
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
