import { NextResponse } from "next/server";
import {
  getClipImexNoticeSummary,
  openClipImexNoticeDb,
} from "@/app/lib/clip-imex-notice-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const noticeKey = new URL(req.url).searchParams.get("noticeKey")?.trim();
    if (!noticeKey) {
      return NextResponse.json(
        { ok: false, error: "noticeKey가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openClipImexNoticeDb();
    try {
      const summary = getClipImexNoticeSummary(db, noticeKey);
      return NextResponse.json({ ok: true, summary });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
