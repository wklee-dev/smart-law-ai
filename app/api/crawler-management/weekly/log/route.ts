import { NextResponse } from "next/server";
import { readWeeklyRunLog } from "@/app/lib/weekly-crawlers-server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const runId = Number(new URL(req.url).searchParams.get("runId"));
  if (!Number.isFinite(runId) || runId <= 0) {
    return NextResponse.json({ ok: false, error: "runId 필요" }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, log: readWeeklyRunLog(runId) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
