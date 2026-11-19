import { NextResponse } from "next/server";
import {
  CRAWLER_LIST_XLSX_PATH,
  getCrawlerTargetDb,
  listCrawlersFromExcel,
} from "@/app/lib/crawler-management-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const items = listCrawlersFromExcel();
    return NextResponse.json({
      ok: true,
      excelPath: CRAWLER_LIST_XLSX_PATH,
      targetDb: getCrawlerTargetDb(),
      total: items.length,
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
