import { NextResponse } from "next/server";
import { getWeeklyBatchState, runPgSyncStep } from "@/app/lib/weekly-crawlers-server";

export const runtime = "nodejs";

const g = globalThis as typeof globalThis & { __pgSyncRunning?: boolean };

/** 주간 크롤과 별도로 SQLite → Postgres 반영만 실행 (백그라운드) */
export async function POST() {
  if (getWeeklyBatchState()) {
    return NextResponse.json(
      { ok: false, error: "주간 크롤 실행 중입니다. 끝나면 자동으로 반영됩니다." },
      { status: 409 },
    );
  }
  if (g.__pgSyncRunning) {
    return NextResponse.json({ ok: false, error: "이미 반영 중입니다." }, { status: 409 });
  }
  g.__pgSyncRunning = true;
  void runPgSyncStep().finally(() => {
    g.__pgSyncRunning = false;
  });
  return NextResponse.json({ ok: true, started: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, running: Boolean(g.__pgSyncRunning) });
}
