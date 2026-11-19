import { NextResponse } from "next/server";
import {
  getFtaAgreementDoc,
  openClipTreatyDb,
} from "@/app/lib/clip-treaty-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const u = new URL(req.url);
  const docId = Number(u.searchParams.get("docId") ?? "");
  if (!Number.isFinite(docId) || docId <= 0) {
    return NextResponse.json({ error: "docId가 필요합니다." }, { status: 400 });
  }
  try {
    const db = openClipTreatyDb();
    try {
      const doc = getFtaAgreementDoc(db, docId);
      if (!doc) {
        return NextResponse.json({ error: "협정서를 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, doc });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
