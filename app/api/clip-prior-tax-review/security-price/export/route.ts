import { NextResponse } from "next/server";
import {
  ensureDefaultPriorTaxSecurityPriceImported,
  exportPriorTaxSecurityPriceExcel,
  openClipPriorTaxSecurityPriceDb,
} from "@/app/lib/clip-prior-tax-security-price-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const db = openClipPriorTaxSecurityPriceDb();
    try {
      ensureDefaultPriorTaxSecurityPriceImported(db);
      const buffer = exportPriorTaxSecurityPriceExcel(db, {
        baseDate: u.searchParams.get("baseDate") ?? "",
        hsCode: u.searchParams.get("hsCode") ?? "",
        itemName: u.searchParams.get("itemName") ?? "",
      });
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="prior-tax-security-price_${stamp}.xlsx"`,
        },
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
