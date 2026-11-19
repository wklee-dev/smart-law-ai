import { NextRequest, NextResponse } from "next/server";
import {
  buildGatewayUsageWorkbook,
  fetchGatewayUsageAllUsers,
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

    const rows = await fetchGatewayUsageAllUsers(params);
    const buffer = buildGatewayUsageWorkbook(rows);
    const filename = `gateway-usage_${params.dateFrom}_${params.dateTo}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("기간") || msg.includes("시작일") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
