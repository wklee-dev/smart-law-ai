import { NextResponse } from "next/server";
import {
  getClipQuestionDetail,
  openClipQuestionDb,
} from "@/app/lib/clip-question-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const u = new URL(req.url);
  const seqId = u.searchParams.get("seqId")?.trim();
  if (!seqId) {
    return NextResponse.json(
      { error: "seqId가 필요합니다." },
      { status: 400 },
    );
  }
  try {
    const db = openClipQuestionDb();
    try {
      const detail = getClipQuestionDetail(db, seqId);
      if (!detail) {
        return NextResponse.json(
          { error: "항목을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json(detail);
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
