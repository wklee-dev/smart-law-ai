import { resolveCielMenuContent, searchCielContent } from "@/app/lib/ciel-db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const title = url.searchParams.get("title")?.trim() ?? "";

    if (q) {
      const items = searchCielContent(q);
      return NextResponse.json({ ok: true, mode: "search", items });
    }

    if (!title) {
      return NextResponse.json(
        { ok: false, error: "title 또는 q 파라미터가 필요합니다." },
        { status: 400 },
      );
    }

    const result = resolveCielMenuContent(title);
    return NextResponse.json({ ...result, ok: true, title });
  } catch (e) {
    const message = e instanceof Error ? e.message : "콘텐츠 조회 실패";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
