import fs from "node:fs";
import { NextResponse } from "next/server";
import {
  getClipHsImportGuidePdfPath,
  openClipHsImportGuideDb,
} from "@/app/lib/clip-hs-import-guide-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipHsImportGuideDb();
    try {
      const file = getClipHsImportGuidePdfPath(db);
      if (!file) {
        return NextResponse.json(
          { ok: false, error: "전체 PDF 파일이 없습니다." },
          { status: 404 },
        );
      }
      const buf = fs.readFileSync(file.absolutePath);
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(file.fileName)}"`,
          "Content-Length": String(buf.byteLength),
          "Cache-Control": "public, max-age=86400",
        },
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
