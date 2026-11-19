import { NextRequest, NextResponse } from "next/server";
import {
  embedTariffChunksBatch,
  isGeminiRateLimitError,
} from "@/app/lib/embed-tariff-chunks";
import {
  normalizeTariffCountryCode,
  parseTariffYear,
} from "@/app/lib/tariff-country-code";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const maxDuration = 300;

type EmbedBody = {
  year?: number | string;
  countryCode?: string;
  sourceLevel?: string;
  limit?: number;
};

/**
 * `tariff_chunks` 중 embedding 이 null 인 행을 Gemini 로 임베딩합니다.
 *
 * POST /api/tariff-chunks/embed
 * { "year": 2026, "countryCode": "KR", "limit": 20 }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as EmbedBody;
    const year =
      body.year != null && String(body.year).trim() !== ""
        ? parseTariffYear(body.year)
        : undefined;
    const countryCode = body.countryCode?.trim()
      ? normalizeTariffCountryCode(body.countryCode)
      : undefined;
    const sourceLevel = body.sourceLevel?.trim() || undefined;
    const limit = body.limit && body.limit > 0 ? body.limit : 50;

    const supabase = getSupabaseAdmin();
    const result = await embedTariffChunksBatch(supabase, {
      year,
      countryCode,
      sourceLevel,
      limit,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      message:
        result.embeddedCount === 0
          ? "임베딩할 청크가 없습니다."
          : undefined,
    });
  } catch (error) {
    console.error("tariff-chunks/embed:", error);
    const message = error instanceof Error ? error.message : String(error);
    if (isGeminiRateLimitError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Gemini API 할당량/속도 제한(429)에 걸렸습니다. 몇 분 후 다시 시도하세요.",
          detail: message,
          retryable: true,
        },
        { status: 429 },
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
