import {
  getKotraTradeDetail,
  openKotraTradeDb,
} from "@/app/lib/kotra-trade-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sourceId =
      new URL(req.url).searchParams.get("sourceId")?.trim() ?? "";
    if (!sourceId) {
      return NextResponse.json(
        { ok: false, error: "sourceId 필요" },
        { status: 400 },
      );
    }
    const db = await openKotraTradeDb();
    try {
      const post = await getKotraTradeDetail(db, sourceId);
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
