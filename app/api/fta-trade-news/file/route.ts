import {
  getFtaTradeNewsFile,
  openFtaTradeNewsDb,
} from "@/app/lib/fta-trade-news-server";
import fs from "node:fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const articleId = u.searchParams.get("articleId")?.trim() ?? "";
  const assetKey = u.searchParams.get("assetKey")?.trim() ?? "";
  if (!articleId || !assetKey) {
    return NextResponse.json(
      { ok: false, error: "articleId, assetKey 필요" },
      { status: 400 },
    );
  }

  const db = await openFtaTradeNewsDb();
  try {
    const file = await getFtaTradeNewsFile(db, articleId, assetKey);
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
