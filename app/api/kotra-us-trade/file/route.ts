import {
  getKotraUsTradeFile,
  openKotraUsTradeDb,
} from "@/app/lib/kotra-us-trade-server";
import fs from "node:fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const articleId = u.searchParams.get("articleId")?.trim() ?? "";
  const fileId = u.searchParams.get("fileId")?.trim() ?? "";
  if (!articleId || !fileId) {
    return NextResponse.json(
      { ok: false, error: "articleId, fileId 필요" },
      { status: 400 },
    );
  }

  const db = await openKotraUsTradeDb();
  try {
    const file = await getKotraUsTradeFile(db, articleId, fileId);
    if (!file) {
      return NextResponse.json(
        { ok: false, error: "파일을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    const buf = fs.readFileSync(file.absolutePath);
    const encoded = encodeURIComponent(file.fileName).replace(
      /['()]/g,
      escape,
    );
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(buf.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } finally {
    await db.close();
  }
}
