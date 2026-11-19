import {
  listLawInfoCenterFilters,
  openLawInfoCenterDb,
} from "@/app/lib/law-info-center-latest-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openLawInfoCenterDb();
    try {
      return NextResponse.json({
        ok: true,
        ...listLawInfoCenterFilters(db),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
