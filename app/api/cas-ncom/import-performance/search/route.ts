import { NextRequest, NextResponse } from "next/server";
import {
  CasNcomAuthError,
  requireBearerToken,
} from "@/app/lib/cas-ncom-auth-server";
import { searchImportPerformance } from "@/app/lib/cas-ncom-ncom-server";
import { casGatewayModeFromRequest } from "@/app/lib/cas-ncom-gateway-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const token = requireBearerToken(request.headers.get("authorization"));
    const gatewayMode = casGatewayModeFromRequest(request.headers);
    const u = request.nextUrl.searchParams;
    const result = await searchImportPerformance(
      {
        customsId: u.get("customs_id") ?? "",
        dateFrom: u.get("from") ?? "",
        dateTo: u.get("to") ?? "",
        importDeclNo: u.get("singono") ?? "",
        lanNo: u.get("lanno") ?? "",
        rowNo: u.get("heangno") ?? "",
        year: u.get("year") ?? "",
        blNo: u.get("bl_no") ?? "",
        materialCode: u.get("material_code") ?? u.get("jajae_code") ?? "",
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
