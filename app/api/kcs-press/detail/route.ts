import {
  getKcsPressDetail,
  openKcsPressDb,
} from "@/app/lib/kcs-press-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const nttSn = new URL(req.url).searchParams.get("nttSn")?.trim() ?? "";
    if (!nttSn) {
      return NextResponse.json(
        { ok: false, error: "nttSn 필요" },
        { status: 400 },
      );
    }
    const db = await openKcsPressDb();
    try {
      const post = await getKcsPressDetail(db, nttSn);
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
