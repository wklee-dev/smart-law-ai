import { NextRequest, NextResponse } from "next/server";
import {
  parseGatewayAuditLogSearchParams,
  searchGatewayAuditLog,
} from "@/app/lib/gateway-audit-log-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = parseGatewayAuditLogSearchParams(request.nextUrl.searchParams);
    if (!params.dateFrom || !params.dateTo) {
      return NextResponse.json(
        { ok: false, error: "조회 기간(from, to)은 필수입니다." },
        { status: 400 },
      );
    }

    const result = await searchGatewayAuditLog(params);
    return NextResponse.json({ ...result, ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("기간") || msg.includes("시작일") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
