import { NextRequest, NextResponse } from "next/server";
import { buildLawArticlePlainText } from "@/app/lib/law-article-fulltext";
import { resolveLawNameKrForLawId } from "@/app/lib/law-name-resolve";
import { resolveArticleNoForDisplay } from "@/app/lib/law-supabase-helpers";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

const ITEM_PAGE_SIZE = 1000;

async function fetchLawArticleItems(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  lawArticleId: number,
): Promise<
  Array<{
    id: unknown;
    law_article_id: unknown;
    item_level: unknown;
    parent_item_id: unknown;
    item_no: unknown;
    item_content: unknown;
    display_order: unknown;
  }>
> {
  const out: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += ITEM_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("law_article_items")
      .select(
        "id, law_article_id, item_level, parent_item_id, item_no, item_content, display_order",
      )
      .eq("law_article_id", lawArticleId)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + ITEM_PAGE_SIZE - 1);

    if (error) throw error;
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < ITEM_PAGE_SIZE) break;
  }
  return out as Array<{
    id: unknown;
    law_article_id: unknown;
    item_level: unknown;
    parent_item_id: unknown;
    item_no: unknown;
    item_content: unknown;
    display_order: unknown;
  }>;
}

/**
 * LangChain·법령 채팅 출처 팝업: 청크 id로 저장된 조문 전체 본문을 조회합니다.
 * GET ?chunkId=123
 */
export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get("chunkId");
    const chunkId = raw ? Number(raw) : NaN;
    if (!Number.isFinite(chunkId) || chunkId <= 0) {
      return NextResponse.json(
        { ok: false, error: "chunkId 쿼리가 필요합니다." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: chunk, error: chunkErr } = await supabase
      .from("law_chunks")
      .select(
        "id, chunk_text, source_title, law_article_id, law_version_id, metadata",
      )
      .eq("id", chunkId)
      .maybeSingle();

    if (chunkErr) {
      throw chunkErr;
    }
    if (!chunk) {
      return NextResponse.json(
        { ok: false, error: "해당 청크를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const meta =
      chunk.metadata && typeof chunk.metadata === "object"
        ? (chunk.metadata as Record<string, unknown>)
        : null;
    const lawNameKrRaw =
      meta && typeof meta.law_name_kr === "string" ? meta.law_name_kr : null;
    const lawIdMeta =
      meta && typeof meta.law_id === "string" ? meta.law_id : null;

    let lawNameKr =
      lawNameKrRaw && lawNameKrRaw.trim() ? lawNameKrRaw.trim() : null;
    if (!lawNameKr && lawIdMeta?.trim()) {
      lawNameKr = await resolveLawNameKrForLawId(lawIdMeta);
    }

    let articleNo: string | null = null;
    let articleTitle: string | null = null;
    let articleContent: string | null = null;

    const lawArticleId =
      typeof chunk.law_article_id === "number" && chunk.law_article_id > 0
        ? chunk.law_article_id
        : null;

    let itemCount = 0;

    if (lawArticleId != null) {
      const { data: art, error: artErr } = await supabase
        .from("law_articles")
        .select("article_no, article_title, article_content, raw_json")
        .eq("id", lawArticleId)
        .maybeSingle();

      if (artErr) {
        throw artErr;
      }
      if (art) {
        articleNo = resolveArticleNoForDisplay(art.article_no, art.raw_json);
        articleTitle =
          typeof art.article_title === "string" ? art.article_title : null;
        articleContent =
          typeof art.article_content === "string" ? art.article_content : null;
      }

      const items = await fetchLawArticleItems(supabase, lawArticleId);
      itemCount = items.length;

      const fromArticle = buildLawArticlePlainText(
        articleNo,
        articleTitle,
        articleContent,
        items.map((row) => ({
          id: row.id,
          parent_item_id: row.parent_item_id,
          item_level: String(row.item_level ?? ""),
          item_no: String(row.item_no ?? ""),
          item_content: String(row.item_content ?? ""),
          item_order: row.display_order ?? 0,
        })),
      );

      const chunkText =
        typeof chunk.chunk_text === "string" ? chunk.chunk_text.trim() : "";
      const fullText =
        fromArticle.trim() ||
        (articleContent ?? "").trim() ||
        chunkText;

      return NextResponse.json({
        ok: true,
        chunkId: chunk.id,
        law_name_kr: lawNameKr,
        law_id: null,
        source_title:
          typeof chunk.source_title === "string" ? chunk.source_title : null,
        article_no: articleNo,
        article_title: articleTitle,
        full_text: fullText,
        resolved_from_article: Boolean(
          fromArticle.trim().length > 0 ||
            (articleContent && articleContent.trim().length > 0) ||
            itemCount > 0,
        ),
        item_count: itemCount,
      });
    }

    const chunkText =
      typeof chunk.chunk_text === "string" ? chunk.chunk_text.trim() : "";
    const fullText = chunkText;

    return NextResponse.json({
      ok: true,
      chunkId: chunk.id,
      law_name_kr: lawNameKr,
      law_id: null,
      source_title:
        typeof chunk.source_title === "string" ? chunk.source_title : null,
      article_no: articleNo,
      article_title: articleTitle,
      full_text: fullText,
      resolved_from_article: false,
      item_count: 0,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("law-chat/source-detail:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
