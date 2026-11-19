import { NextRequest, NextResponse } from "next/server";
import {
  CasNcomAuthError,
  requireBearerToken,
} from "@/app/lib/cas-ncom-auth-server";
import { searchExportPerformance } from "@/app/lib/cas-ncom-ncom-server";
import { casGatewayModeFromRequest } from "@/app/lib/cas-ncom-gateway-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const token = requireBearerToken(request.headers.get("authorization"));
    const gatewayMode = casGatewayModeFromRequest(request.headers);
    const u = request.nextUrl.searchParams;
    const result = await searchExportPerformance(
      {
        trustTong: u.get("trust_tong") ?? "",
        dateFrom: u.get("from") ?? "",
        dateTo: u.get("to") ?? "",
        exportDeclNo: u.get("singono") ?? "",
        lanNo: u.get("lanno") ?? "",
        rowNo: u.get("heangno") ?? "",
        year: u.get("year") ?? "",
        invNo: u.get("inv_no") ?? "",
        productCode: u.get("product_code") ?? u.get("jepum_code") ?? "",
        hsCode: u.get("hs_code") ?? "",
      },
      token,
      gatewayMode,
    );
    return NextResponse.json({ ...result, ok: true });
  } catch (e) {
    if (e instanceof CasNcomAuthError) {
      return NextResponse.json(
        { ok: false, error: e.message, authRequired: true },
        { status: 401 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
