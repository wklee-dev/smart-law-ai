import {
  listYtgPages,
  openYtgDb,
  ytgTablesReady,
} from "@/app/lib/yestrade-guideline-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openYtgDb();
    try {
      const ready = ytgTablesReady(db);
      const pages = ready ? listYtgPages(db) : [];
      return NextResponse.json({ ok: true, ready, pages });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
