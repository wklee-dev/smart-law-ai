import { NextResponse } from "next/server";
import {
  getWeeklyBatchState,
  listWeeklyCrawlers,
  previousIsoWeek,
  startWeeklyCrawlers,
} from "@/app/lib/weekly-crawlers-server";
import { getWeeklyCrawlersRoot } from "@/app/lib/weekly-crawlers-registry";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { year, week } = previousIsoWeek();
    return NextResponse.json({
      ok: true,
      root: getWeeklyCrawlersRoot(),
      period: `${year}-${String(week).padStart(2, "0")}`,
      batch: getWeeklyBatchState(),
      items: listWeeklyCrawlers(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** body: { keys?: string[] } — 생략 시 로그인 불필요 항목 전체 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { keys?: string[] };
    const batch = startWeeklyCrawlers(body.keys);
    return NextResponse.json({ ok: true, batch });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
