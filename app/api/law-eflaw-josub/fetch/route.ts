import { NextRequest, NextResponse } from "next/server";
import {
  buildEflawJosubSearchParams,
  type EflawJosubFetchParams,
} from "@/app/lib/law-eflaw-josub";
import { fetchLawOpenApiJson } from "@/app/lib/law-open-api-fetch";

export const maxDuration = 60;

type Body = Partial<EflawJosubFetchParams> & {
  lawApiId?: string;
};

/**
 * POST JSON: { lawApiId?, mst?, efYd?, jo?, hang?, ho?, mok? }
 * 법령ID(ID) 또는 MST 중 하나만 필수. efYd·JO 등은 선택.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const lawApiId = body.lawApiId?.trim();
    const mst = body.mst?.trim();
    const efYd = body.efYd?.trim() ?? "";
    const jo = body.jo?.trim() ?? "";

    if (!lawApiId && !mst) {
      return NextResponse.json(
        { ok: false, error: "법령 ID(ID) 또는 MST가 필요합니다." },
        { status: 400 },
      );
    }

    const params = buildEflawJosubSearchParams({
      lawApiId,
      mst,
      efYd: efYd || undefined,
      jo: jo || undefined,
      hang: body.hang,
      ho: body.ho,
      mok: body.mok,
    });

    const result = await fetchLawOpenApiJson(params);

    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      statusText: result.statusText,
      contentType: result.contentType,
      requestedUrl: result.requestedUrl,
      rawText: result.rawText,
      parsedJson: result.parsedJson,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("law-eflaw-josub/fetch:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
