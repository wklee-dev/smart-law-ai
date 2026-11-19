import { NextRequest, NextResponse } from "next/server";
import {
  CasNcomAuthError,
  requireBearerToken,
} from "@/app/lib/cas-ncom-auth-server";
import { searchRefundImportLedger } from "@/app/lib/cas-ncom-cas-server";
import { casGatewayModeFromRequest } from "@/app/lib/cas-ncom-gateway-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const token = requireBearerToken(request.headers.get("authorization"));
    const gatewayMode = casGatewayModeFromRequest(request.headers);
    const u = request.nextUrl.searchParams;
    const result = await searchRefundImportLedger(
      {
        custCd: u.get("cust_cd") ?? u.get("custCd") ?? "",
        srlNo: u.get("srl_no") ?? u.get("srlNo") ?? "",
        impSingoNo: u.get("imp_singo_no") ?? u.get("impSingoNo") ?? "",
        dateFrom: u.get("from") ?? u.get("fromDt") ?? "",
        dateTo: u.get("to") ?? u.get("toDt") ?? "",
        lcNo: u.get("lc_no") ?? u.get("lcNo") ?? "",
        hsCd: u.get("hs_cd") ?? u.get("hsCd") ?? u.get("hs") ?? "",
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
