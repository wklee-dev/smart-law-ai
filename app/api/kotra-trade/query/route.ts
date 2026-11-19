import {
  listKotraTradeCountries,
  openKotraTradeDb,
  queryKotraTrade,
} from "@/app/lib/kotra-trade-server";
import type { KotraTradeQueryParams } from "@/app/lib/kotra-trade-shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: KotraTradeQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      keyword: u.searchParams.get("keyword") ?? "",
      dateFrom: u.searchParams.get("dateFrom") ?? "",
      dateTo: u.searchParams.get("dateTo") ?? "",
      country: u.searchParams.get("country") ?? "",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = await openKotraTradeDb();
    try {
      const { rows, total } = await queryKotraTrade(db, params);
      return NextResponse.json({
        ok: true,
        rows,
        total,
        countries: await listKotraTradeCountries(db),
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
