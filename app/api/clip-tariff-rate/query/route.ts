import { NextResponse } from "next/server";
import {
  openClipTariffRateQueryDb,
  queryClipTariffRates,
  type ClipTariffRateQueryParams,
} from "@/app/lib/clip-tariff-rate-server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: ClipTariffRateQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      hsCode: u.searchParams.get("hsCode") ?? "",
      itemName: u.searchParams.get("itemName") ?? "",
      hsSection: u.searchParams.get("hsSection") ?? "",
      includeHistory: u.searchParams.get("includeHistory") === "1",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = await openClipTariffRateQueryDb();
    try {
      const { rows, total } = await queryClipTariffRates(db, params);
      return NextResponse.json({
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
