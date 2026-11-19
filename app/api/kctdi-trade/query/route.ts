import {
  openKctdiTradeDb,
  queryKctdiTrade,
} from "@/app/lib/kctdi-trade-server";
import type { KctdiTradeQueryParams } from "@/app/lib/kctdi-trade-shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: KctdiTradeQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      keyword: u.searchParams.get("keyword") ?? "",
      searchField: u.searchParams.get("field") ?? "",
      dateFrom: u.searchParams.get("dateFrom") ?? "",
      dateTo: u.searchParams.get("dateTo") ?? "",
    };

    const db = await openKctdiTradeDb();
    try {
      const { rows, total } = await queryKctdiTrade(db, params);
      return NextResponse.json({ ok: true, rows, total });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
