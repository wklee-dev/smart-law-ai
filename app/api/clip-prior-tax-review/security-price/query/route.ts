import { NextResponse } from "next/server";
import {
  ensureDefaultPriorTaxSecurityPriceImported,
  openClipPriorTaxSecurityPriceDb,
  queryClipPriorTaxSecurityPrices,
  type ClipPriorTaxSecurityPriceQueryParams,
} from "@/app/lib/clip-prior-tax-security-price-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: ClipPriorTaxSecurityPriceQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      baseDate: u.searchParams.get("baseDate") ?? "",
      hsCode: u.searchParams.get("hsCode") ?? "",
      itemName: u.searchParams.get("itemName") ?? "",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = openClipPriorTaxSecurityPriceDb();
    try {
      ensureDefaultPriorTaxSecurityPriceImported(db);
      const { rows, total } = queryClipPriorTaxSecurityPrices(db, params);
      return NextResponse.json({
        ok: true,
        rows,
        total,
        page: params.page,
        pageSize: Math.min(100, Math.max(5, Math.floor(params.pageSize))),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
