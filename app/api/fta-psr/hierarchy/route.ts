import { NextRequest, NextResponse } from "next/server";
import { getFtaHsHierarchy } from "@/app/lib/fta-psr-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const agreementKey = (u.get("agreement_key") ?? "").trim();
    const hsCode = (u.get("hs_code") ?? "").trim();
    if (!hsCode.replace(/\D/g, "")) {
      return NextResponse.json(
        { ok: false, error: "hs_code 가 필요합니다." },
        { status: 400 },
      );
    }
    const levels = await getFtaHsHierarchy(agreementKey, hsCode);
    return NextResponse.json({ ok: true, levels });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
