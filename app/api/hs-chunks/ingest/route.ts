import { NextRequest, NextResponse } from "next/server";
import { ingestHsChunksToSupabase } from "@/app/lib/hs-chunk-ingest";
import { normalizeHsDivision } from "@/app/lib/hs-division";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const maxDuration = 300;

type IngestBody = {
  aplyYear?: string;
  division?: string;
  langCode?: string;
  replace?: boolean;
  limit?: number;
};

/**
 * HS 해설 SQLite → 로컬/클라우드 Supabase `hs_chunks`.
 *
 * 예 (dev 서버 실행 중):
 * POST /api/hs-chunks/ingest
 * { "aplyYear": "2022", "division": "wco", "langCode": "kor", "replace": true }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as IngestBody;
    const aplyYear = (body.aplyYear ?? "2022").trim() || "2022";
    const division = normalizeHsDivision(body.division);
    const langCode = (body.langCode ?? "kor").trim() || "kor";
    const replace = body.replace !== false;
    const limit =
      body.limit != null && body.limit > 0 ? Math.floor(body.limit) : undefined;

    const supabase = getSupabaseAdmin();
    const result = await ingestHsChunksToSupabase(supabase, {
      aplyYear,
      division,
      langCode,
      replace,
      limit,
    });

    return NextResponse.json({ ...result, ok: true });
  } catch (error) {
    console.error("hs-chunks/ingest:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
