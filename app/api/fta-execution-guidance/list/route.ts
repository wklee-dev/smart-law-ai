import {
  ftaExecutionGuidanceReady,
  listFtaExecutionGuidance,
  openFtaExecutionGuidanceDb,
} from "@/app/lib/fta-execution-guidance-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const page = Number(u.searchParams.get("page") ?? "1");
    const pageSize = Number(u.searchParams.get("pageSize") ?? "10");
    const keyword = u.searchParams.get("keyword") ?? "";
    const db = openFtaExecutionGuidanceDb();
    try {
      const ready = ftaExecutionGuidanceReady(db);
      const { rows, total } = listFtaExecutionGuidance(db, {
        page,
        pageSize,
        keyword,
      });
      return NextResponse.json({ ok: true, ready, rows, total });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
