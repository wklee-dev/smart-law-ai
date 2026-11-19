import { NextResponse } from "next/server";
import {
  getClipHsImportGuidePdfInfo,
  openClipHsImportGuideDb,
} from "@/app/lib/clip-hs-import-guide-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipHsImportGuideDb();
    try {
      const pdf = getClipHsImportGuidePdfInfo(db);
      return NextResponse.json({ ok: true, pdf });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, pdf: null }, { status: 500 });
  }
}
