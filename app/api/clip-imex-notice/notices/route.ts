import { NextResponse } from "next/server";
import {
  listClipImexNoticeMasters,
  openClipImexNoticeDb,
} from "@/app/lib/clip-imex-notice-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipImexNoticeDb();
    try {
      return NextResponse.json({
        ok: true,
        notices: listClipImexNoticeMasters(db),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
