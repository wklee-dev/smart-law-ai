import { NextRequest, NextResponse } from "next/server";
import {
  CasNcomAuthError,
  requireBearerToken,
} from "@/app/lib/cas-ncom-auth-server";
import { casGatewayModeFromRequest } from "@/app/lib/cas-ncom-gateway-request";
import {
  getUserFieldProfile,
  saveUserFieldProfile,
  type NcomFieldProfileApi,
  type SaveUserFieldProfileBody,
} from "@/app/lib/cas-ncom-user-field-profile-server";

export const runtime = "nodejs";

const ALLOWED_APIS = new Set<NcomFieldProfileApi>([
  "ncomSearchQry",
  "ncomSearchExpoQry",
]);

function parseApi(value: string | null): NcomFieldProfileApi | null {
  const api = (value ?? "").trim() as NcomFieldProfileApi;
  return ALLOWED_APIS.has(api) ? api : null;
}

export async function GET(request: NextRequest) {
  try {
    const token = requireBearerToken(request.headers.get("authorization"));
    const gatewayMode = casGatewayModeFromRequest(request.headers);
    const api = parseApi(request.nextUrl.searchParams.get("api"));
    if (!api) {
      return NextResponse.json(
        { ok: false, error: "api 파라미터가 필요합니다." },
        { status: 400 },
      );
    }

    const profile = await getUserFieldProfile(api, token, gatewayMode);
    return NextResponse.json({ ok: true, ...profile });
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

export async function POST(request: NextRequest) {
  try {
    const token = requireBearerToken(request.headers.get("authorization"));
    const gatewayMode = casGatewayModeFromRequest(request.headers);
    const body = (await request.json()) as SaveUserFieldProfileBody;

    if (!body.apiNm || !ALLOWED_APIS.has(body.apiNm)) {
      return NextResponse.json(
        { ok: false, error: "apiNm이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const profile = await saveUserFieldProfile(body, token, gatewayMode);
    return NextResponse.json({ ok: true, ...profile });
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
