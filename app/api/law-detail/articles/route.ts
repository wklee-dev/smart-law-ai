import { NextRequest, NextResponse } from "next/server";
import {
  resolveArticleNoForDisplay,
} from "@/app/lib/law-supabase-helpers";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

const PAGE_SIZE = 1000;

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

    const supabase = getSupabaseAdmin();

    const articleSelect = `
          id,
          law_version_id,
          structure_node_id,
          article_key,
          article_no,
          article_title,
          article_content,
          article_type,
          article_revision_type,
          article_effective_date,
          display_order,
          raw_json
        `;

    const rows: Record<string, unknown>[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("law_articles")
        .select(articleSelect)
        .eq("law_version_id", lawVersionId)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        throw error;
      }
      const chunk = data ?? [];
      rows.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
    }

    const articles = rows.map((row) => ({
      ...row,
      article_no: resolveArticleNoForDisplay(row.article_no, row.raw_json),
      law_document_id: row.law_version_id,
      article_order: row.display_order,
    }));

    return NextResponse.json({
      ok: true,
      articles,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "저장된 조문 JSON 목록 조회 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
