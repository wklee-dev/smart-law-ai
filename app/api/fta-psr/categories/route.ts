import { NextRequest, NextResponse } from "next/server";
import { listFtaCategories } from "@/app/lib/fta-psr-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const agreementKey = (
      request.nextUrl.searchParams.get("agreement_key") ?? ""
    ).trim();
    if (!agreementKey) {
      return NextResponse.json(
        { ok: false, error: "agreement_key 가 필요합니다." },
        { status: 400 },
      );
    }
    const items = await listFtaCategories(agreementKey);
    return NextResponse.json({ ok: true, agreementKey, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
