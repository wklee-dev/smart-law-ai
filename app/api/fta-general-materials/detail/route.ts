import {
  getFtaGeneralMaterialDetail,
  openFtaGeneralMaterialsDb,
} from "@/app/lib/fta-general-materials-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? "0");
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "id가 필요합니다." },
        { status: 400 },
      );
    }
    const db = await openFtaGeneralMaterialsDb();
    try {
      const post = await getFtaGeneralMaterialDetail(db, id);
      if (!post) {
        return NextResponse.json(
          { ok: false, error: "게시물을 찾을 수 없습니다." },
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
