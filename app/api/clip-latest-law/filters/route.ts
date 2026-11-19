import {
  clipLatestLawDistinctFilters,
  clipLatestLawTableReady,
  openClipLatestLawDb,
} from "@/app/lib/clip-latest-law-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipLatestLawDb();
    try {
      return NextResponse.json({
        ok: true,
        ready: clipLatestLawTableReady(db),
        ...clipLatestLawDistinctFilters(db),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
