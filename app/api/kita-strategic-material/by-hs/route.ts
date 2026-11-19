import {
  kitaStrategicMaterialTablesReady,
  listKitaStrategicMaterialByHs,
  openKitaStrategicMaterialDb,
} from "@/app/lib/kita-strategic-material-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const hsCode = u.searchParams.get("hsCode")?.trim() ?? "";
    if (!hsCode) {
      return NextResponse.json(
        { ok: false, error: "hsCode가 필요합니다." },
        { status: 400 },
      );
    }

    const db = openKitaStrategicMaterialDb();
    try {
      const ready = kitaStrategicMaterialTablesReady(db);
      const items = ready ? listKitaStrategicMaterialByHs(db, hsCode) : [];
      return NextResponse.json({ ok: true, ready, hsCode, items });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
