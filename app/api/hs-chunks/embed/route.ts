import { NextRequest, NextResponse } from "next/server";
import {
  embedHsChunksBatch,
  isGeminiRateLimitError,
} from "@/app/lib/embed-hs-chunks";
import { normalizeHsDivision } from "@/app/lib/hs-division";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const maxDuration = 300;

type EmbedBody = {
  aplyYear?: string;
  division?: string;
  limit?: number;
};

/**
 * `hs_chunks` 중 embedding 이 null 인 행을 Gemini 로 임베딩합니다.
 * 남은 건이 없을 때까지 반복 호출하세요.
 *
 * POST /api/hs-chunks/embed
 * { "aplyYear": "2022", "division": "wco", "limit": 50 }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as EmbedBody;
    const aplyYear = body.aplyYear?.trim();
    const division = body.division?.trim()
      ? normalizeHsDivision(body.division)
      : undefined;
    const limit = body.limit && body.limit > 0 ? body.limit : 50;

    const supabase = getSupabaseAdmin();
    const result = await embedHsChunksBatch(supabase, {
      aplyYear: aplyYear || undefined,
      division,
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
    console.error("hs-chunks/embed:", error);
    const message = error instanceof Error ? error.message : String(error);
    if (isGeminiRateLimitError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Gemini API 할당량/속도 제한(429)에 걸렸습니다. 몇 분~몇 시간 후 다시 시도하거나 Google AI Studio 요금·한도를 확인하세요.",
          detail: message,
          retryable: true,
        },
        { status: 429 },
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
