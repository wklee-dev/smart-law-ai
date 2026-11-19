import { NextResponse } from "next/server";
import { getLatestNtxPageContent } from "@/app/lib/clip-ntx-content-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const section = (u.searchParams.get("section") ?? "").trim();
    if (!section) {
      return NextResponse.json(
        { ok: false, error: "section 파라미터가 필요합니다." },
        { status: 400 },
      );
    }
    const content = getLatestNtxPageContent(section);
    if (!content) {
      return NextResponse.json({
        ok: true,
        content: null,
        message: `ntx_page에 ${section} 데이터가 없습니다.`,
      });
    }
    return NextResponse.json({ ok: true, content });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
