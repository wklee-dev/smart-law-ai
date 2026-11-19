import {
  getFtaExecutionGuidanceDetail,
  openFtaExecutionGuidanceDb,
} from "@/app/lib/fta-execution-guidance-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? "0");
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openFtaExecutionGuidanceDb();
    try {
      const post = getFtaExecutionGuidanceDetail(db, id);
      if (!post) {
        return NextResponse.json(
          { ok: false, error: "게시물을 찾을 수 없습니다." },
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
