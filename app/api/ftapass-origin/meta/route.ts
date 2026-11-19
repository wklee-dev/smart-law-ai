import { NextResponse } from "next/server";
import {
  getFtaPassDbPath,
  listFtaPassAgreements,
  listFtaPassStdYears,
} from "@/app/lib/ftapass-origin-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({
      ok: true,
      dbPath: getFtaPassDbPath(),
      stdYears: listFtaPassStdYears(),
      agreements: listFtaPassAgreements(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
