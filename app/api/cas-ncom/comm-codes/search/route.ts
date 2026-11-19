import { NextRequest, NextResponse } from "next/server";
import { searchCasCommCodes } from "@/app/lib/cas-ncom-comm-code-server";
import { casGatewayModeFromRequest } from "@/app/lib/cas-ncom-gateway-request";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const gatewayMode = casGatewayModeFromRequest(request.headers);
    const result = await searchCasCommCodes(
      {
        codeGroup: u.get("code_group") ?? "",
        searchWord: u.get("q") ?? "",
        searchMode: u.get("search_mode") ?? "",
      },
      gatewayMode,
    );
    return NextResponse.json({ ...result, ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
