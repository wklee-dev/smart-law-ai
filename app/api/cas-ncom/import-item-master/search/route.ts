import { NextRequest, NextResponse } from "next/server";
import {
  CasNcomAuthError,
  requireBearerToken,
} from "@/app/lib/cas-ncom-auth-server";
import {
  loadImportItemMasterSample,
  searchImportItemMaster,
} from "@/app/lib/cas-ncom-cas-server";
import { casGatewayModeFromRequest } from "@/app/lib/cas-ncom-gateway-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    if (u.get("sample") === "1") {
      const result = loadImportItemMasterSample();
      return NextResponse.json({ ...result, ok: true, sample: true });
    }

    const token = requireBearerToken(request.headers.get("authorization"));
    const gatewayMode = casGatewayModeFromRequest(request.headers);
    const result = await searchImportItemMaster(
      {
        custCd: u.get("cust_cd") ?? u.get("custCd") ?? "",
        mstCd: u.get("mst_cd") ?? u.get("mstCd") ?? "",
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
