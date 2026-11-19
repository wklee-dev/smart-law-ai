import { NextResponse } from "next/server";
import {
  listClipCustomsChiefGuideDocuments,
  listClipCustomsChiefGuideSections,
  openClipCustomsChiefDb,
} from "@/app/lib/clip-customs-chief-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipCustomsChiefDb();
    try {
      const sections = listClipCustomsChiefGuideSections(db);
      const documents = listClipCustomsChiefGuideDocuments(db);
      return NextResponse.json({ sections, documents });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
