import { NextRequest, NextResponse } from "next/server";
import {
  getAdmrulListItemArray,
  getAdmRulSearchRoot,
  listItemToRow,
  parseAdmrulListMeta,
} from "@/app/lib/admrul-list-search";
import { embedAdmrulListItemIds } from "@/app/lib/embed-admrul-list-items";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const maxDuration = 300;

type SearchContext = {
  query?: string;
  date?: string;
  page?: string;
  display?: string;
  nw?: string;
  search?: string;
  org?: string;
  knd?: string;
  sort?: string;
  prmlYd?: string;
  modYd?: string;
  nb?: string;
};

type Body = {
  parsedJson?: unknown;
  rawText?: string;
  requestedUrl?: string;
  embed?: boolean;
  searchContext?: SearchContext;
};

function parseIntOrNull(s: string | undefined): number | null {
  if (s == null || !String(s).trim()) return null;
  const n = Number.parseInt(String(s).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    let parsed: unknown = body.parsedJson;
    if (parsed === undefined && body.rawText?.trim()) {
      try {
        parsed = JSON.parse(body.rawText);
      } catch {
        return NextResponse.json(
          { ok: false, error: "rawText JSON 파싱에 실패했습니다." },
          { status: 400 },
        );
      }
    }
    if (parsed === undefined || parsed === null) {
      return NextResponse.json(
        { ok: false, error: "parsedJson 또는 rawText가 필요합니다." },
        { status: 400 },
      );
    }

    const root = getAdmRulSearchRoot(parsed);
    if (!root) {
      return NextResponse.json(
        { ok: false, error: "AdmRulSearch 형식이 아닙니다." },
        { status: 400 },
      );
    }

    const meta = parseAdmrulListMeta(root);
    const ctx = body.searchContext ?? {};
    const totalCnt = parseIntOrNull(meta.totalCnt) ?? 0;

    const rawResponseJson =
      parsed !== null && typeof parsed === "object"
        ? (parsed as object)
        : { _value: parsed };

    const supabase = getSupabaseAdmin();

    const { data: runRow, error: runErr } = await supabase
      .from("admrul_search_runs")
      .insert({
        requested_url: body.requestedUrl ?? null,
        target: meta.target || "admrul",
        query: ctx.query?.trim() || null,
        date_single: ctx.date?.trim() || meta.발령일자 || null,
        page: parseIntOrNull(ctx.page),
        display: parseIntOrNull(ctx.display),
        nw: parseIntOrNull(ctx.nw),
        search_scope: parseIntOrNull(ctx.search),
        org: ctx.org?.trim() || null,
        knd: ctx.knd?.trim() || null,
        sort: ctx.sort?.trim() || null,
        prml_yd: ctx.prmlYd?.trim() || null,
        mod_yd: ctx.modYd?.trim() || null,
        nb: ctx.nb?.trim() || null,
        total_cnt: totalCnt,
        result_code: meta.resultCode || null,
        result_msg: meta.resultMsg || null,
        section: meta.section || null,
        num_of_rows: meta.numOfRows || null,
        raw_response: rawResponseJson,
      })
      .select("id")
      .single();

    if (runErr) throw runErr;
    const searchRunId = runRow?.id as number;

    const items = getAdmrulListItemArray(root);
    const rows = items
      .map((it: Record<string, unknown>) => listItemToRow(it, searchRunId))
      .filter(
        (r): r is NonNullable<ReturnType<typeof listItemToRow>> => r != null,
      );

    let itemIds: number[] = [];
    if (rows.length > 0) {
      const { data: inserted, error: insErr } = await supabase
        .from("admrul_list_items")
        .insert(rows)
        .select("id");
      if (insErr) throw insErr;
      itemIds = (inserted ?? []).map((r) => r.id as number);
    }

    let embeddedCount = 0;
    let embedModel: string | undefined;
    if (body.embed && itemIds.length > 0) {
      const emb = await embedAdmrulListItemIds(supabase, itemIds);
      embeddedCount = emb.embeddedCount;
      embedModel = emb.model;
    }

    return NextResponse.json({
      ok: true,
      searchRunId,
      itemCount: itemIds.length,
      embeddedCount,
      embedModel,
      totalCnt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("law-admrul-search/save:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
