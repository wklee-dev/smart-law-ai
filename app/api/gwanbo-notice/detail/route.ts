import {
  getGwanboNoticeDetail,
  openGwanboDb,
} from "@/app/lib/gwanbo-notice-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
    }
    const db = await openGwanboDb();
    try {
      const post = await getGwanboNoticeDetail(db, id);
      if (!post) {
        return NextResponse.json(
          { ok: false, error: "고시를 찾을 수 없습니다." },
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
