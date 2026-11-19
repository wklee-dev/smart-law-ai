import { getYcpPostDetail, openYcpDb } from "@/app/lib/yestrade-cp-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const postId = Number(new URL(req.url).searchParams.get("postId") ?? "0");
    if (!postId) {
      return NextResponse.json(
        { ok: false, error: "postId가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openYcpDb();
    try {
      const post = getYcpPostDetail(db, postId);
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
