import { NextResponse } from "next/server";
import {
  clipPrecedentDistinctFilters,
  openClipPrecedentDb,
} from "@/app/lib/clip-precedent-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipPrecedentDb();
    try {
      const filters = clipPrecedentDistinctFilters(db);
      return NextResponse.json(filters);
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
