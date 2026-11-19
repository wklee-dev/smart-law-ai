import { NextResponse } from "next/server";
import { listOpenlawLawsWithCrawlTargets } from "@/app/lib/openlaw-sqlite-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { laws, crawlTargets } = listOpenlawLawsWithCrawlTargets();
    return NextResponse.json({ ok: true, laws, crawlTargets });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "openlaw 법령 목록 조회 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
