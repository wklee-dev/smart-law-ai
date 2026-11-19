import { NextRequest, NextResponse } from "next/server";
import { ingestTariffChunksToSupabase } from "@/app/lib/tariff-chunk-ingest";
import type { TariffSourceLevel } from "@/app/lib/tariff-chunk-text";
import {
  normalizeTariffCountryCode,
  parseTariffYear,
} from "@/app/lib/tariff-country-code";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const maxDuration = 300;

type IngestBody = {
  year?: number | string;
  countryCode?: string;
  replace?: boolean;
  limit?: number;
  levels?: string[];
};

const VALID_LEVELS = new Set<TariffSourceLevel>([
  "section",
  "chapter",
  "heading",
  "item",
]);

/**
 * tariff.db → Supabase `tariff_chunks`
 *
 * POST /api/tariff-chunks/ingest
 * { "year": 2026, "countryCode": "KR", "replace": true }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as IngestBody;
    const year = parseTariffYear(body.year ?? 2026);
    const countryCode = normalizeTariffCountryCode(body.countryCode);
    const replace = body.replace !== false;
    const limit =
      body.limit != null && body.limit > 0 ? Math.floor(body.limit) : undefined;
    const levels = body.levels
      ?.map((l) => l.trim().toLowerCase())
      .filter((l): l is TariffSourceLevel =>
        VALID_LEVELS.has(l as TariffSourceLevel),
      );

    const supabase = getSupabaseAdmin();
    const result = await ingestTariffChunksToSupabase(supabase, {
      year,
      countryCode,
      replace,
      limit,
      levels: levels?.length ? levels : undefined,
    });

    return NextResponse.json({ ...result, ok: true });
  } catch (error) {
    console.error("tariff-chunks/ingest:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
