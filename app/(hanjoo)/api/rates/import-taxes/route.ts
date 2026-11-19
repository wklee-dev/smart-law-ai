import { listImportTaxes } from "@/hanjoo/lib/import-taxes";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    return NextResponse.json({
      ok: true,
      ...(await listImportTaxes({
        asOf: sp.get("asOf") ?? "",
        tax: sp.get("tax") ?? "",
        law: sp.get("law") ?? "",
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
