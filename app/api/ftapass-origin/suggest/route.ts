import { NextRequest, NextResponse } from "next/server";
import { suggestFtaPassHs6 } from "@/app/lib/ftapass-origin-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
    const items = suggestFtaPassHs6(q, 30);
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
