import { NextRequest, NextResponse } from "next/server";
import { fetchLawIdForApiName } from "@/app/lib/law-eflaw-fetch-one";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 제공API명(법령명)으로 국가법령정보 eflaw 검색 → 법령약칭명·법령ID
 * GET /api/api-management/fetch-law-id?apiName=...
 */
export async function GET(request: NextRequest) {
  try {
    const apiName = request.nextUrl.searchParams.get("apiName")?.trim() ?? "";
    if (!apiName) {
      return NextResponse.json(
        { ok: false, error: "apiName(제공API명)이 필요합니다." },
        { status: 400 },
      );
    }

    const r = await fetchLawIdForApiName(apiName);
    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        error: r.error,
        requestUrl: r.requestUrl,
      });
    }

    return NextResponse.json({
      ok: true,
      apiName,
      lawShortName: r.hit.lawShortName,
      lawId: r.hit.lawId,
      lawNameKo: r.hit.lawNameKo,
      historyCode: r.hit.historyCode,
      requestUrl: r.requestUrl,
    });
  } catch (error) {
    console.error("fetch-law-id:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
