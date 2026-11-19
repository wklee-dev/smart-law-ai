import { readForeignCaseImage } from "@/hanjoo/lib/case-catalog";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? "");
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: "id가 필요합니다." }, { status: 400 });
    }
    const img = await readForeignCaseImage(id);
    if (!img) {
      return NextResponse.json({ ok: false, error: "이미지가 없습니다." }, { status: 404 });
    }
    return new NextResponse(Buffer.from(img.data), {
      headers: {
        "Content-Type": img.contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
