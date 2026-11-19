import { NextRequest, NextResponse } from "next/server";
import { searchCasCustomers } from "@/app/lib/cas-ncom-customer-server";
import { casGatewayModeFromRequest } from "@/app/lib/cas-ncom-gateway-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const gatewayMode = casGatewayModeFromRequest(request.headers);
    const result = await searchCasCustomers(
      {
        field: u.get("field") ?? "all",
        keyword: u.get("q") ?? "",
        page: Number(u.get("page") ?? "1"),
        pageSize: Number(u.get("page_size") ?? "50"),
      },
      gatewayMode,
    );
    return NextResponse.json({ ...result, ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
