import { NextRequest, NextResponse } from "next/server";
import { listFtaHsGuide } from "@/app/lib/fta-psr-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const agreementKey = (
      request.nextUrl.searchParams.get("agreement_key") ?? ""
    ).trim();
    const items = await listFtaHsGuide(agreementKey || undefined);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
