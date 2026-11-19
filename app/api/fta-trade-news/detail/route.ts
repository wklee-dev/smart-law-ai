import {
  getFtaTradeNewsDetail,
  openFtaTradeNewsDb,
} from "@/app/lib/fta-trade-news-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const articleId =
      new URL(req.url).searchParams.get("articleId")?.trim() ?? "";
    if (!articleId) {
      return NextResponse.json(
        { ok: false, error: "articleId 필요" },
        { status: 400 },
      );
    }
    const db = await openFtaTradeNewsDb();
    try {
      const post = await getFtaTradeNewsDetail(db, articleId);
      if (!post) {
        return NextResponse.json(
          { ok: false, error: "게시글을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, post });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
