import { NextRequest, NextResponse } from "next/server";
import {
  buildAdmrulChunksFromParsed,
  extractAdmrulBasicFields,
} from "@/app/lib/admrul-chunks";
import { embedAdmrulChunkTextsByIds } from "@/app/lib/embed-admrul-chunks";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const maxDuration = 300;

type Body = {
  parsedJson?: unknown;
  rawText?: string;
  requestedUrl?: string;
  /** 응답에 일련번호가 없을 때 폼의 ID(행정규칙일련번호) */
  fallbackSerialId?: string;
  embed?: boolean;
};

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

    const fallback = body.fallbackSerialId?.trim() ?? "";
    const basic = extractAdmrulBasicFields(parsed);
    const admSerial = basic.adm_serial_id || fallback;
    if (!admSerial) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "행정규칙일련번호를 알 수 없습니다. 응답을 확인하거나 fallbackSerialId(ID)를 넣어 주세요.",
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const rawResponseJson =
      parsed !== null && typeof parsed === "object"
        ? (parsed as object)
        : { _value: parsed };

    const { data: snap, error: snapErr } = await supabase
      .from("admrul_snapshots")
      .insert({
        adm_serial_id: admSerial,
        adm_lid: basic.adm_lid || null,
        rule_name_kr: basic.rule_name_kr || null,
        ministry_name: basic.ministry_name || null,
        enforcement_date: basic.enforcement_date || null,
        promulgation_date: basic.promulgation_date || null,
        requested_url: body.requestedUrl ?? null,
        raw_response: rawResponseJson,
      })
      .select("id")
      .single();

    if (snapErr) throw snapErr;
    const snapshotId = snap?.id as number;

    const chunkDefs = buildAdmrulChunksFromParsed(parsed, fallback || admSerial);
    const chunkRows = chunkDefs.map((c) => ({
      admrul_snapshot_id: snapshotId,
      source_type: c.source_type,
      source_key: c.source_key,
      source_title: c.source_title,
      chunk_text: c.chunk_text,
      chunk_index: c.chunk_index,
      metadata: c.metadata,
    }));

    const { data: insertedChunks, error: insErr } = await supabase
      .from("admrul_chunks")
      .insert(chunkRows)
      .select("id");

    if (insErr) throw insErr;
    const chunkIds = (insertedChunks ?? []).map((r) => r.id as number);

    let embeddedCount = 0;
    let embedModel: string | undefined;
    if (body.embed && chunkIds.length > 0) {
      const emb = await embedAdmrulChunkTextsByIds(supabase, chunkIds);
      embeddedCount = emb.embeddedCount;
      embedModel = emb.model;
    }

    return NextResponse.json({
      ok: true,
      snapshotId,
      chunkCount: chunkIds.length,
      embeddedCount,
      embedModel,
      adm_serial_id: admSerial,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("law-admrul/save:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
