import { NextResponse } from "next/server";
import {
  CLIP_TARIFF_RATE_SHEET,
  importTariffRateFromFile,
  resolveDefaultTariffRateExcelPath,
} from "@/app/lib/clip-tariff-rate-server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const filePath = resolveDefaultTariffRateExcelPath();
    const { imported, dbPath } = importTariffRateFromFile(
      filePath,
      CLIP_TARIFF_RATE_SHEET,
    );
    return NextResponse.json({
      ok: true,
      imported,
      dbPath,
      filePath,
      sheet: CLIP_TARIFF_RATE_SHEET,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
