import { NextRequest, NextResponse } from "next/server";
import {
  buildGatewayAuditLogWorkbook,
  exportGatewayAuditLogRows,
  parseGatewayAuditLogSearchParams,
} from "@/app/lib/gateway-audit-log-server";

export const runtime = "nodejs";

function exportFileName(from: string, to: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const range = [from, to].filter(Boolean).join("_") || stamp;
  return `gateway-audit-log_${range}.xlsx`;
}

export async function GET(request: NextRequest) {
  try {
    const params = parseGatewayAuditLogSearchParams(request.nextUrl.searchParams);
    if (!params.dateFrom || !params.dateTo) {
      return NextResponse.json(
        { ok: false, error: "조회 기간(from, to)은 필수입니다." },
        { status: 400 },
      );
    }

    const { rows, truncated, total } = await exportGatewayAuditLogRows(params);
    const buffer = buildGatewayAuditLogWorkbook(rows);
    const filename = exportFileName(params.dateFrom, params.dateTo);

    const headers = new Headers({
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
    if (truncated) {
      headers.set(
        "X-Export-Truncated",
        `true; total=${total}; exported=${rows.length}`,
      );
    }

    return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("기간") || msg.includes("시작일") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
