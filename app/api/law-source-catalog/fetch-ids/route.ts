import { NextRequest, NextResponse } from "next/server";
import {
  countMissingLawSourceCatalogIds,
  fetchAndSaveLawSourceCatalogIds,
} from "@/app/lib/law-source-catalog-fetch-ids-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    const urlType = request.nextUrl.searchParams.get("url_type")?.trim() || "";
    const missing = countMissingLawSourceCatalogIds(urlType || undefined);
    return NextResponse.json({
      ok: true,
      missingLawIdCount: missing,
      urlType: urlType || null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "조회 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      gubuns?: number[];
      onlyMissing?: boolean;
      urlType?: string;
      limit?: number;
      delayMs?: number;
    };

    const gubuns = Array.isArray(body.gubuns)
      ? body.gubuns.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : [];

    if (gubuns.length === 0 && body.onlyMissing === false) {
      return NextResponse.json(
        { ok: false, error: "gubuns 또는 onlyMissing 이 필요합니다." },
        { status: 400 },
      );
    }

    const result = await fetchAndSaveLawSourceCatalogIds({
      gubuns: gubuns.length ? gubuns : undefined,
      onlyMissing: gubuns.length > 0 ? false : body.onlyMissing !== false,
      urlType: body.urlType?.trim() || undefined,
      limit: body.limit,
      delayMs: body.delayMs,
    });

    return NextResponse.json({ ...result, ok: true });
  } catch (error) {
    console.error("law-source-catalog/fetch-ids 오류:", error);
    const message =
      error instanceof Error ? error.message : "API 호출 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
