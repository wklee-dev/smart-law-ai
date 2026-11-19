import {
  dualUseHskTablesReady,
  listDualUseHskDetailByHs,
  openDualUseHskDb,
} from "@/app/lib/dual-use-hsk-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const hsCode = new URL(req.url).searchParams.get("hsCode")?.trim() ?? "";
    if (!hsCode) {
      return NextResponse.json(
        { ok: false, error: "hsCode가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openDualUseHskDb();
    try {
      const ready = dualUseHskTablesReady(db);
      return NextResponse.json({
        ok: true,
        ready,
        rows: ready ? listDualUseHskDetailByHs(db, hsCode) : [],
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
