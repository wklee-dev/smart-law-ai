import { NextRequest, NextResponse } from "next/server";
import { embedChunkTextsByIds } from "@/app/lib/embed-chunk-text";
import {
  buildEflawJosubSearchParams,
  buildEflawJosubSourceKey,
  extractEflawJosubDisplayParts,
  padSixDigits,
} from "@/app/lib/law-eflaw-josub";
import { fetchLawOpenApiJson } from "@/app/lib/law-open-api-fetch";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { normalizeLawIdForStorage } from "@/app/shared/law-id";

export const maxDuration = 300;

type Body = {
  /** DB·메타데이터용 법령ID (laws.law_id) */
  lawId: string;
  lawApiId?: string;
  mst?: string;
  efYd?: string;
  jo?: string;
  hang?: string;
  ho?: string;
  mok?: string;
  /** true 이면 저장 직후 해당 청크만 임베딩 */
  embed?: boolean;
  /** 이전 fetch 응답을 재사용 (API 재호출 생략) */
  parsedJson?: unknown;
  rawText?: string;
  requestedUrl?: string;
};

/**
 * eflawjosub 조회 → law_chunks 삽입 → (옵션) 임베딩
 * POST JSON: lawId(필수), efYd·jo 등은 선택 / parsedJson 있으면 외부 호출 생략
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const lawId = normalizeLawIdForStorage(body.lawId?.trim() ?? "");
    if (!lawId) {
      return NextResponse.json(
        { ok: false, error: "lawId(저장 법령 ID)가 필요합니다." },
        { status: 400 },
      );
    }

    const efYdRaw = body.efYd?.replace(/\D/g, "") ?? "";
    const jo = body.jo?.trim() ?? "";
    if ((body.efYd ?? "").trim() !== "" && efYdRaw.length !== 8) {
      return NextResponse.json(
        { ok: false, error: "efYd는 YYYYMMDD 8자리여야 합니다." },
        { status: 400 },
      );
    }
    const efYd = efYdRaw;

    const lawApiId = normalizeLawIdForStorage(
      (body.lawApiId?.trim() || lawId).trim(),
    );
    const mst = body.mst?.trim();

    const supabase = getSupabaseAdmin();

    const { data: lawRow, error: lawErr } = await supabase
      .from("laws")
      .select("id, law_id, law_name_kr")
      .eq("law_id", lawId)
      .maybeSingle();

    if (lawErr) throw lawErr;
    if (!lawRow?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: `laws 테이블에 law_id=${lawId} 인 행이 없습니다. 먼저 법령을 저장하세요.`,
        },
        { status: 404 },
      );
    }

    const lawPk = lawRow.id as number;
    const lawNameKr =
      typeof lawRow.law_name_kr === "string" ? lawRow.law_name_kr : null;

    let lawVersionId: number | null = null;
    const { data: verCurrent, error: verErr } = await supabase
      .from("law_versions")
      .select("id")
      .eq("law_id", lawPk)
      .eq("is_current", true)
      .maybeSingle();
    if (verErr) throw verErr;
    if (verCurrent?.id != null) {
      lawVersionId = verCurrent.id as number;
    } else {
      const { data: verAny } = await supabase
        .from("law_versions")
        .select("id")
        .eq("law_id", lawPk)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      lawVersionId = verAny?.id != null ? (verAny.id as number) : null;
    }

    let requestedUrl = body.requestedUrl ?? "";
    let parsed: unknown = body.parsedJson;
    if (parsed === undefined && body.rawText?.trim()) {
      try {
        parsed = JSON.parse(body.rawText);
      } catch {
        parsed = { _unparsed: body.rawText.slice(0, 8000) };
      }
    }

    if (parsed === undefined) {
      const params = buildEflawJosubSearchParams({
        lawApiId,
        mst,
        efYd: efYd || undefined,
        jo: jo || undefined,
        hang: body.hang,
        ho: body.ho,
        mok: body.mok,
      });
      const apiResult = await fetchLawOpenApiJson(params);
      requestedUrl = apiResult.requestedUrl;
      parsed = apiResult.parsedJson ?? JSON.parse(apiResult.rawText || "{}");
      if (!apiResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `Open API 응답 오류: ${apiResult.status} ${apiResult.statusText}`,
            requestedUrl,
            rawTextPreview: apiResult.rawText?.slice(0, 2000),
          },
          { status: 502 },
        );
      }
    }

    const { sourceTitle, chunkText } = extractEflawJosubDisplayParts(parsed);
    const sourceKey = buildEflawJosubSourceKey({
      lawId,
      efYd,
      jo,
      hang: body.hang,
      ho: body.ho,
      mok: body.mok,
    });

    let nextIndex = 0;
    if (lawVersionId != null) {
      const { data: idxRow } = await supabase
        .from("law_chunks")
        .select("chunk_index")
        .eq("law_version_id", lawVersionId)
        .order("chunk_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      const maxIdx =
        idxRow?.chunk_index != null ? Number(idxRow.chunk_index) : -1;
      nextIndex = maxIdx + 1;
    }

    const metadata = {
      law_id: lawId,
      law_name_kr: lawNameKr,
      source: "eflaw_josub",
      ef_yd: efYd || null,
      jo: jo ? padSixDigits(jo) : null,
      hang: body.hang?.trim() ? padSixDigits(body.hang) : null,
      ho: body.ho?.trim() ? padSixDigits(body.ho) : null,
      mok: body.mok?.trim() ?? null,
      mst: mst ?? null,
    };

    const { data: insChunk, error: insErr } = await supabase
      .from("law_chunks")
      .insert({
        law_id: lawPk,
        law_version_id: lawVersionId,
        structure_node_id: null,
        law_article_id: null,
        source_type: "eflaw_josub",
        source_key: sourceKey,
        source_title: sourceTitle.slice(0, 2000),
        chunk_text: chunkText,
        chunk_index: nextIndex,
        metadata,
      })
      .select("id")
      .single();

    if (insErr) throw insErr;
    const chunkId = insChunk?.id as number;

    const rawResponseJson =
      parsed !== null && typeof parsed === "object"
        ? (parsed as object)
        : { _value: parsed };

    const { error: snapErr } = await supabase.from("law_eflaw_josub_snapshots").insert({
      law_pk: lawPk,
      law_id_text: lawId,
      mst: mst ?? null,
      ef_yd: efYd || "",
      jo: jo ? padSixDigits(jo) : "",
      hang: body.hang?.trim() ? padSixDigits(body.hang) : null,
      ho: body.ho?.trim() ? padSixDigits(body.ho) : null,
      mok: body.mok?.trim() ?? null,
      requested_url: requestedUrl || null,
      raw_response: rawResponseJson,
      source_title: sourceTitle.slice(0, 2000),
      chunk_text_preview: chunkText.slice(0, 4000),
      law_chunk_id: chunkId,
    });

    if (snapErr) {
      console.warn("law_eflaw_josub_snapshots insert:", snapErr.message);
    }

    let embeddedCount = 0;
    let embedModel: string | undefined;
    if (body.embed && chunkId) {
      const emb = await embedChunkTextsByIds(supabase, [chunkId]);
      embeddedCount = emb.embeddedCount;
      embedModel = emb.model;
    }

    return NextResponse.json({
      ok: true,
      lawId,
      lawPk,
      lawVersionId,
      chunkId,
      sourceTitle,
      embeddedCount,
      embedModel,
      requestedUrl: requestedUrl || undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("law-eflaw-josub/save:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
