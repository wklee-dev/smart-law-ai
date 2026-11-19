import {
  openMfdsPressDb,
  queryMfdsPress,
} from "@/app/lib/mfds-press-server";
import type { MfdsPressQueryParams } from "@/app/lib/mfds-press-shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: MfdsPressQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      keyword: u.searchParams.get("keyword") ?? "",
      searchField: u.searchParams.get("field") ?? "",
      dateFrom: u.searchParams.get("dateFrom") ?? "",
      dateTo: u.searchParams.get("dateTo") ?? "",
    };

    const db = await openMfdsPressDb();
    try {
      const { rows, total } = await queryMfdsPress(db, params);
      return NextResponse.json({
        ok: true,
        rows,
        total,
        page: params.page,
        pageSize: Math.min(100, Math.max(5, Math.floor(params.pageSize))),
      });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
