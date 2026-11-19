import {
  breadcrumbMeta,
  formatHsDisp,
  getItem,
  listHeadingNodes,
  listDomesticTax,
  listRates,
  listReqs,
  listStrategic,
  openTariffDb,
} from "@/hanjoo/lib/tariff-db";
import { defaultCountry, defaultYear } from "@/hanjoo/lib/paths";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const hs = u.searchParams.get("hs")?.trim() ?? "";
    if (!hs) {
      return NextResponse.json({ ok: false, error: "hs가 필요합니다." }, { status: 400 });
    }
    const year = Number(u.searchParams.get("year") ?? defaultYear());
    const country = (u.searchParams.get("country") ?? defaultCountry()).toUpperCase();
    const db = await openTariffDb();
    try {
      const item = await getItem(db, hs, year, country);
      if (!item) {
        return NextResponse.json({ ok: false, error: "해당 HSK를 찾을 수 없습니다." }, { status: 404 });
      }
      const rates = await listRates(db, item.hs_code, year, country);
      const domesticTax = await listDomesticTax(db, item.hs_code, year, country);
      const reqs = await listReqs(db, item.hs_code, year, country);
      const strategic = await listStrategic(db, item.hs_code, year, country);
      const crumb = await breadcrumbMeta(db, item);
      const tree = await listHeadingNodes(
        db,
        item.heading_code || item.hs_code.slice(0, 4),
        year,
        country,
      );
      return NextResponse.json({
        ok: true,
        year,
        country,
        hsDisp: formatHsDisp(item.hs_code),
        item,
        rates,
        domesticTax,
        reqs,
        strategic,
        crumb,
        tree,
      });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
