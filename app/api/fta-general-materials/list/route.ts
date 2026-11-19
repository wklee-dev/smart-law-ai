import {
  ftaGeneralMaterialsReady,
  listFtaGeneralMaterials,
  openFtaGeneralMaterialsDb,
} from "@/app/lib/fta-general-materials-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const page = Number(u.searchParams.get("page") ?? "1");
    const pageSize = Number(u.searchParams.get("pageSize") ?? "10");
    const keyword = u.searchParams.get("keyword") ?? "";
    const db = await openFtaGeneralMaterialsDb();
    try {
      const ready = await ftaGeneralMaterialsReady(db);
      const { rows, total } = await listFtaGeneralMaterials(db, {
        page,
        pageSize,
        keyword,
      });
      return NextResponse.json({ ok: true, ready, rows, total });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
