import { NextResponse } from "next/server";
import {
  listClipOriginGeneralSections,
  openClipOriginGeneralDb,
} from "@/app/lib/clip-origin-general-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipOriginGeneralDb();
    try {
      return NextResponse.json({
        ok: true,
        sections: listClipOriginGeneralSections(db),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
