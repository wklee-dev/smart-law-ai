import { NextRequest, NextResponse } from "next/server";
import {
  fetchGatewayUsageUserDetail,
  parseGatewayUsageParams,
} from "@/app/lib/gateway-audit-usage-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const params = parseGatewayUsageParams(u);
    const userId = u.get("user_id")?.trim() ?? "";

    if (!params.dateFrom || !params.dateTo) {
      return NextResponse.json(
        { ok: false, error: "조회 기간(from, to)은 필수입니다." },
        { status: 400 },
      );
    }
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "user_id가 필요합니다." },
        { status: 400 },
      );
    }

    const detail = await fetchGatewayUsageUserDetail({ ...params, userId });
    return NextResponse.json({ ok: true, detail });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status =
      msg.includes("기간") || msg.includes("시작일") || msg.includes("user_id")
        ? 400
        : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
