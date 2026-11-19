import {
  getMfdsPressDetail,
  openMfdsPressDb,
} from "@/app/lib/mfds-press-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const seq = Number(new URL(req.url).searchParams.get("seq") ?? "");
    if (!Number.isFinite(seq) || seq <= 0) {
      return NextResponse.json({ ok: false, error: "seq 필요" }, { status: 400 });
    }
    const db = await openMfdsPressDb();
    try {
      const post = await getMfdsPressDetail(db, seq);
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
