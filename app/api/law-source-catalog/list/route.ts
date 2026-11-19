import { NextRequest, NextResponse } from "next/server";
import { queryLawSourceCatalog } from "@/app/lib/law-source-catalog-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const result = queryLawSourceCatalog({
      classification: u.get("classification") ?? "",
      urlType: u.get("url_type") ?? "",
      keyword: u.get("q") ?? "",
      page: Number(u.get("page") ?? "1"),
      pageSize: Number(u.get("page_size") ?? "50"),
    });
    return NextResponse.json({ ...result, ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
