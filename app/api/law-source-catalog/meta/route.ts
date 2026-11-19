import { NextResponse } from "next/server";
import { getLawSourceCatalogMeta } from "@/app/lib/law-source-catalog-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, ...getLawSourceCatalogMeta() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
