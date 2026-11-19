import { NextResponse } from "next/server";
import {
  getClipIntegratedNoticeSummary,
  openClipIntegratedNoticeDb,
} from "@/app/lib/clip-integrated-notice-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipIntegratedNoticeDb();
    try {
      const summary = getClipIntegratedNoticeSummary(db);
      return NextResponse.json({ ok: true, summary });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
