import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

function parseLawVersionId(request: NextRequest): number | null {
  const u = request.nextUrl;
  const v =
    u.searchParams.get("lawVersionId") ?? u.searchParams.get("lawDocumentId");
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(request: NextRequest) {
  try {
    const lawVersionId = parseLawVersionId(request);
    const lawArticleIdRaw = request.nextUrl.searchParams.get("lawArticleId");
    const lawArticleId = lawArticleIdRaw ? Number(lawArticleIdRaw) : null;
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const page = Math.max(
      1,
      Number(request.nextUrl.searchParams.get("page") ?? "1") || 1,
    );
    const pageSize = Math.min(
      200,
      Math.max(10, Number(request.nextUrl.searchParams.get("pageSize") ?? "30") || 30),
    );

    if (!lawVersionId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "lawVersionId(또는 하위 호환 lawDocumentId) 쿼리 파라미터가 필요합니다.",
        },
        { status: 400 },
      );
    }

    if (lawArticleIdRaw && (!Number.isFinite(lawArticleId) || (lawArticleId ?? 0) <= 0)) {
      return NextResponse.json(
        { ok: false, error: "lawArticleId 값이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("law_chunks")
      .select(
        `
          id,
          law_id,
          law_version_id,
          structure_node_id,
          law_article_id,
          source_type,
          source_key,
          source_title,
          chunk_text,
          chunk_index,
          metadata
        `,
        { count: "exact" },
      )
      .eq("law_version_id", lawVersionId);

    if (lawArticleId) {
      query = query.eq("law_article_id", lawArticleId);
    }

    if (q) {
      query = query.ilike("chunk_text", `%${q}%`);
    }

    const { data, error, count } = await query
      .order("chunk_index", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw error;
    }

    const chunks = (data ?? []).map((row) => ({
      ...row,
      law_document_id: row.law_version_id,
    }));

    return NextResponse.json({
      ok: true,
      chunks,
      totalCount: count ?? 0,
      page,
      pageSize,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "청크 목록 조회 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
