import { NextResponse } from "next/server";
import { syncClipGeneralLawsFromCatalog } from "@/app/lib/clip-general-law-sync-server";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      delayMs?: number;
      fetchBodies?: boolean;
      onlyLawIds?: string[];
    };
    const result = await syncClipGeneralLawsFromCatalog({
      delayMs: body.delayMs,
      fetchBodies: body.fetchBodies,
      onlyLawIds: body.onlyLawIds,
    });
    return NextResponse.json({
      ...result,
      ok: result.ok || result.bodyOk > 0,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "일반법령 동기화 중 오류";
    console.error("sync-from-excel:", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
