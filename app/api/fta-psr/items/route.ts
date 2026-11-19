import { NextRequest, NextResponse } from "next/server";
import { queryFtaPsrItems } from "@/app/lib/fta-psr-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const result = await queryFtaPsrItems({
      agreementKey: u.get("agreement_key") ?? "",
      hsCode: u.get("hs_code") ?? "",
      itemNameKo: u.get("item_name_ko") ?? "",
      itemNameEn: u.get("item_name_en") ?? "",
      itemName: u.get("item_name") ?? "",
      criterion: u.get("criterion") ?? "",
      categoryCode: u.get("category_code") ?? "",
      page: Number(u.get("page") ?? "1"),
      pageSize: Number(u.get("page_size") ?? "50"),
    });
    return NextResponse.json({ ...result, ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const bad = msg.includes("검색조건") || msg.includes("전체 협정");
    return NextResponse.json(
      { ok: false, error: msg },
      { status: bad ? 400 : 500 },
    );
  }
}
