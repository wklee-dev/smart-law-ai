import { NextRequest, NextResponse } from "next/server";
import { getProcessingStatusData } from "@/app/lib/data-processing-status-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const force =
      request.nextUrl.searchParams.get("force") === "1" ||
      request.nextUrl.searchParams.has("refresh");
    const data = getProcessingStatusData(force);
    return NextResponse.json(
      { ok: true, refreshed: force, ...data },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[processing-status] API error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** Excel 강제 재읽기 (REFRESH) */
export async function POST() {
  try {
    const data = getProcessingStatusData(true);
    return NextResponse.json(
      { ok: true, refreshed: true, ...data },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[processing-status] refresh error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
