import fs from "node:fs";
import { NextResponse } from "next/server";
import {
  getClipCustomsChiefGuideFilePath,
  openClipCustomsChiefDb,
} from "@/app/lib/clip-customs-chief-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "id가 필요합니다." }, { status: 400 });
    }

    const db = openClipCustomsChiefDb();
    try {
      const file = getClipCustomsChiefGuideFilePath(db, id);
      if (!file) {
        return NextResponse.json({ error: "파일 없음" }, { status: 404 });
      }
      const buffer = fs.readFileSync(file.filePath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": file.contentType,
          "Content-Disposition": `attachment; filename="${encodeURIComponent(file.fileName)}"`,
        },
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
