import { NextResponse } from "next/server";
import {
  listClipIntegratedNoticeIssues,
  openClipIntegratedNoticeDb,
} from "@/app/lib/clip-integrated-notice-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = openClipIntegratedNoticeDb();
    try {
      return NextResponse.json({
        ok: true,
        issues: await listClipIntegratedNoticeIssues(db),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
