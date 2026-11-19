import { NextResponse } from "next/server";
import {
  getClipWorldHsClassificationCaseDetail,
  openClipWorldHsClassificationCasesDb,
} from "@/app/lib/clip-world-hs-classification-cases-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const caseId = new URL(req.url).searchParams.get("caseId") ?? "";
    const db = openClipWorldHsClassificationCasesDb();
    try {
      const detail = getClipWorldHsClassificationCaseDetail(db, caseId);
      if (!detail) {
        return NextResponse.json(
          { ok: false, error: "사례를 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, detail });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
