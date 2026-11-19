import { NextRequest, NextResponse } from "next/server";
import {
  vectorizeAdminRulesSource,
  vectorizeAllAdminRulesSources,
} from "@/app/lib/admin-rules-chunk-ingest";
import { isSafeRuleConfigParam } from "@/app/lib/admin-rules-server";
import { openAdminRulesSqliteDb } from "@/app/lib/admin-rules-sqlite";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const maxDuration = 300;

type Body = {
  param?: string;
  all?: boolean;
  embed?: boolean;
  replace?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const embed = body.embed !== false;
    const replace = body.replace !== false;
    const supabase = getSupabaseAdmin();
    const openDb = openAdminRulesSqliteDb;

    if (body.all || !body.param?.trim()) {
      const { results, errors } = await vectorizeAllAdminRulesSources(supabase, {
        embed,
        replace,
        openDb,
      });
      const chunkCount = results.reduce((n, r) => n + r.chunkCount, 0);
      const embeddedCount = results.reduce((n, r) => n + r.embeddedCount, 0);
      return NextResponse.json({
        ok: true,
        mode: "all",
        processed: results.length,
        chunkCount,
        embeddedCount,
        results,
        errors,
      });
    }

    const param = body.param.trim();
    if (!isSafeRuleConfigParam(param)) {
      return NextResponse.json(
        { ok: false, error: "유효하지 않은 param 입니다." },
        { status: 400 },
      );
    }

    const result = await vectorizeAdminRulesSource(supabase, param, {
      embed,
      replace,
      openDb,
    });

    return NextResponse.json({
      ok: true,
      mode: "single",
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("admin-rules-sqlite/vectorize:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
