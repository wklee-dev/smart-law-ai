import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export const dynamic = "force-dynamic";

type SourceDetailOk = {
  ok: true;
  chunkId: number;
  source_pk: number;
  law_name: string | null;
  document_type: string | null;
  article_no: string | null;
  title: string | null;
  header: string | null;
  full_text: string;
  resolved_from_admin_rule: boolean;
};

type SourceDetailErr = {
  ok: false;
  error: string;
};

/**
 * 행정규칙 RAG 출처 팝업용.
 * GET ?chunkId=123  (smartlaw_chunk.id)
 */
export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get("chunkId");
    const chunkId = raw ? Number(raw) : NaN;
    if (!Number.isFinite(chunkId) || chunkId <= 0) {
      return NextResponse.json(
        { ok: false, error: "chunkId 쿼리가 필요합니다." } satisfies SourceDetailErr,
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: chunk, error: chunkErr } = await supabase
      .from("smartlaw_chunk")
      .select(
        "id, source_pk, source_table, document_type, law_name, article_no, title, header, body, chunk_text",
      )
      .eq("id", chunkId)
      .maybeSingle();

    if (chunkErr) {
      throw chunkErr;
    }
    if (!chunk) {
      return NextResponse.json(
        { ok: false, error: "해당 청크를 찾을 수 없습니다." } satisfies SourceDetailErr,
        { status: 404 },
      );
    }

    const sourcePk =
      typeof chunk.source_pk === "number"
        ? chunk.source_pk
        : Number(chunk.source_pk);

    let fullText = "";
    let resolvedFromAdminRule = false;

    if (Number.isFinite(sourcePk) && sourcePk > 0) {
      const { data: rule, error: ruleErr } = await supabase
        .from("admin_rule")
        .select(
          "id, law_name, document_type, article_no, article_title, article_content",
        )
        .eq("id", sourcePk)
        .maybeSingle();

      if (ruleErr) {
        throw ruleErr;
      }

      const articleContent =
        typeof rule?.article_content === "string"
          ? rule.article_content.trim()
          : "";
      if (articleContent) {
        fullText = articleContent;
        resolvedFromAdminRule = true;
      }
    }

    if (!fullText) {
      const body =
        typeof chunk.body === "string" ? chunk.body.trim() : "";
      const chunkText =
        typeof chunk.chunk_text === "string"
          ? chunk.chunk_text.trim()
          : "";
      fullText = body || chunkText;
    }

    const payload: SourceDetailOk = {
      ok: true,
      chunkId,
      source_pk: Number.isFinite(sourcePk) ? sourcePk : 0,
      law_name:
        typeof chunk.law_name === "string" ? chunk.law_name : null,
      document_type:
        typeof chunk.document_type === "string"
          ? chunk.document_type
          : null,
      article_no:
        typeof chunk.article_no === "string" ? chunk.article_no : null,
      title: typeof chunk.title === "string" ? chunk.title : null,
      header: typeof chunk.header === "string" ? chunk.header : null,
      full_text: fullText,
      resolved_from_admin_rule: resolvedFromAdminRule,
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "조회에 실패했습니다.";
    return NextResponse.json(
      { ok: false, error: message } satisfies SourceDetailErr,
      { status: 500 },
    );
  }
}
