import { NextResponse } from "next/server";
import {
  getFtaPsrDbPath,
  listFtaAgreements,
} from "@/app/lib/fta-psr-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const items = await listFtaAgreements();
    return NextResponse.json({
      ok: true,
      dbPath: getFtaPsrDbPath(),
      items,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
