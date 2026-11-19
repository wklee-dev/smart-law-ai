import { NextRequest, NextResponse } from "next/server";
import { runCrawlerNext } from "@/app/lib/crawler-management-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { crawlerId?: string };
    const crawlerId = body.crawlerId?.trim();
    if (!crawlerId) {
      return NextResponse.json(
        { ok: false, error: "crawlerId가 필요합니다." },
        { status: 400 },
      );
    }
    const result = runCrawlerNext(crawlerId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
