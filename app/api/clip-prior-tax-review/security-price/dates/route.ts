import { NextResponse } from "next/server";
import {
  ensureDefaultPriorTaxSecurityPriceImported,
  listClipPriorTaxSecurityPriceBaseDates,
  openClipPriorTaxSecurityPriceDb,
  resolveDefaultClipPriorTaxSecurityPriceBaseDate,
} from "@/app/lib/clip-prior-tax-security-price-server";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const db = openClipPriorTaxSecurityPriceDb();
    try {
      ensureDefaultPriorTaxSecurityPriceImported(db);
      const dates = listClipPriorTaxSecurityPriceBaseDates(db);
      return NextResponse.json({
        ok: true,
        dates,
        defaultDate: resolveDefaultClipPriorTaxSecurityPriceBaseDate(db),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
