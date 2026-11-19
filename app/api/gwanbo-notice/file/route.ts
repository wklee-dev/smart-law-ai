import { getGwanboPdf, openGwanboDb } from "@/app/lib/gwanbo-notice-server";
import fs from "node:fs";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
  }
  const disposition = u.searchParams.get("download") === "1" ? "attachment" : "inline";

  const db = await openGwanboDb();
  try {
    const file = await getGwanboPdf(db, id);
    if (!file) {
      return NextResponse.json(
        { ok: false, error: "PDF 파일을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    const buf = fs.readFileSync(file.absolutePath);
    const encoded = encodeURIComponent(file.fileName).replace(/['()]/g, escape);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(buf.length),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } finally {
    await db.close();
  }
}
