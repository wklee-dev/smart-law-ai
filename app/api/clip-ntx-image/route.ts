import fs from "node:fs";
import { NextResponse } from "next/server";
import { resolveClipNtxImagePath } from "@/app/lib/clip-ntx-content-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const u = new URL(req.url);
  const imageId = u.searchParams.get("imageId")?.trim();
  if (!imageId) {
    return NextResponse.json({ error: "imageId가 필요합니다." }, { status: 400 });
  }

  try {
    const resolved = resolveClipNtxImagePath(imageId);
    if (!resolved) {
      return NextResponse.json(
        { error: "표시 가능한 이미지가 없습니다." },
        { status: 404 },
      );
    }
    const buf = fs.readFileSync(resolved.absolutePath);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": resolved.contentType,
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
