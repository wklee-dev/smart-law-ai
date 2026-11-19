import {
  getKctdiTradeDetail,
  openKctdiTradeDb,
} from "@/app/lib/kctdi-trade-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const articleNo =
      new URL(req.url).searchParams.get("articleNo")?.trim() ?? "";
    if (!articleNo) {
      return NextResponse.json(
        { ok: false, error: "articleNo 필요" },
        { status: 400 },
      );
    }
    const db = await openKctdiTradeDb();
    try {
      const post = await getKctdiTradeDetail(db, articleNo);
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
