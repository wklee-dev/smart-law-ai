import { NextResponse } from "next/server";
import {
  listClipCustomsChiefIntegrated,
  openClipCustomsChiefDb,
} from "@/app/lib/clip-customs-chief-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipCustomsChiefDb();
    try {
      const sections = listClipCustomsChiefIntegrated(db);
      return NextResponse.json({ sections });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
