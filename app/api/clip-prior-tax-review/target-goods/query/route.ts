import { NextResponse } from "next/server";
import {
  openClipPriorTaxTargetGoodsDb,
  queryClipPriorTaxTargetGoods,
  resolveDefaultClipPriorTaxTargetGoodsBaseDate,
} from "@/app/lib/clip-prior-tax-target-goods-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    let baseDate = u.searchParams.get("baseDate")?.trim() ?? "";
    const db = openClipPriorTaxTargetGoodsDb();
    try {
      if (!baseDate) {
        baseDate = resolveDefaultClipPriorTaxTargetGoodsBaseDate(db);
      }
      const result = queryClipPriorTaxTargetGoods(db, baseDate);
      return NextResponse.json({ ...result, ok: true });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
