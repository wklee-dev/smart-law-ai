import { NextResponse } from "next/server";
import {
  listClipPriorTaxTargetGoodsBaseDates,
  openClipPriorTaxTargetGoodsDb,
  resolveDefaultClipPriorTaxTargetGoodsBaseDate,
} from "@/app/lib/clip-prior-tax-target-goods-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipPriorTaxTargetGoodsDb();
    try {
      const dates = listClipPriorTaxTargetGoodsBaseDates(db);
      return NextResponse.json({
        ok: true,
        dates,
        defaultDate: resolveDefaultClipPriorTaxTargetGoodsBaseDate(db),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
