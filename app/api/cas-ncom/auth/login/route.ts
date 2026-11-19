import { NextRequest, NextResponse } from "next/server";
import { getCasNcomApiBaseUrl } from "@/app/lib/cas-ncom-api-paths";
import { loginCasUser } from "@/app/lib/cas-ncom-auth-server";
import { casGatewayModeFromRequest } from "@/app/lib/cas-ncom-gateway-request";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const gatewayMode = casGatewayModeFromRequest(request.headers);
  const apiBaseUrl = getCasNcomApiBaseUrl(gatewayMode);
  try {
    const body = (await request.json()) as {
      userId?: string;
      password?: string;
    };
    const result = await loginCasUser(
      body.userId ?? "",
      body.password ?? "",
      gatewayMode,
    );
    return NextResponse.json({ ...result, ok: true, gatewayMode });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("로그인에 실패") || msg.includes("입력")
      ? 401
      : 500;
    return NextResponse.json(
      { ok: false, error: msg, gatewayMode, apiBaseUrl },
      { status },
    );
  }
}
