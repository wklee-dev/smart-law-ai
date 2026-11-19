import { getYcpIntro, openYcpDb, ycpTablesReady } from "@/app/lib/yestrade-cp-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openYcpDb();
    try {
      const ready = ycpTablesReady(db);
      const intro = ready ? getYcpIntro(db) : null;
      return NextResponse.json({ ok: true, ready, intro });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
