import { NextRequest, NextResponse } from "next/server";
import {
  fetchGatewayUsageDashboard,
  parseGatewayUsageParams,
} from "@/app/lib/gateway-audit-usage-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = parseGatewayUsageParams(request.nextUrl.searchParams);
    if (!params.dateFrom || !params.dateTo) {
      return NextResponse.json(
        { ok: false, error: "조회 기간(from, to)은 필수입니다." },
        { status: 400 },
      );
    }

    const dashboard = await fetchGatewayUsageDashboard(params);
    return NextResponse.json({ ok: true, ...dashboard });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("기간") || msg.includes("시작일") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
