import {
  openKotraUsTradeDb,
  queryKotraUsTrade,
} from "@/app/lib/kotra-us-trade-server";
import type { KotraUsTradeQueryParams } from "@/app/lib/kotra-us-trade-shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: KotraUsTradeQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      keyword: u.searchParams.get("keyword") ?? "",
      dateFrom: u.searchParams.get("dateFrom") ?? "",
      dateTo: u.searchParams.get("dateTo") ?? "",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = await openKotraUsTradeDb();
    try {
      const { rows, total, ready } = await queryKotraUsTrade(db, params);
      return NextResponse.json({
        ok: true,
        rows,
        total,
        ready,
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
