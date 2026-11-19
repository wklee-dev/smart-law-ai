import {
  countKitaStrategicMaterialMappings,
  kitaStrategicMaterialTablesReady,
  openKitaStrategicMaterialDb,
  queryKitaStrategicMaterialList,
} from "@/app/lib/kita-strategic-material-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const page = Number(u.searchParams.get("page") ?? "1");
    const pageSize = Number(u.searchParams.get("pageSize") ?? "10");
    const keyword = u.searchParams.get("keyword") ?? "";

    const db = openKitaStrategicMaterialDb();
    try {
      const ready = kitaStrategicMaterialTablesReady(db);
      const { rows, total } = queryKitaStrategicMaterialList(db, {
        page,
        pageSize,
        keyword,
      });
      return NextResponse.json({
        ok: true,
        ready,
        rows,
        total,
        mappingCount: ready ? countKitaStrategicMaterialMappings(db) : 0,
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
