import { NextRequest, NextResponse } from "next/server";
import { formatSupabaseClientError } from "@/app/lib/supabase/format-client-error";
import { getSupabaseAdmin } from "../../../lib/supabase/admin";
import { normalizeLawIdForStorage } from "@/app/shared/law-id";
import {
  itemLevelToDb,
  itemSemanticLevel,
  uniqueArticleNoForDb,
} from "../../../lib/law-article-db";
import { insertLawStructureNodesForArticles } from "../../../lib/law-structure-nodes";
import {
  parseLawDetailJson,
  type ParsedArticleItem,
} from "../../../lib/law-detail-parser";

export const maxDuration = 300;

type SaveLawDetailRequest = {
  rawJson: Record<string, unknown>;
};

const LAW_CHUNKS_INSERT_BATCH_SIZE = 100;

/** YYYYMMDD → YYYY-MM-DD (Postgres date) */
function toIsoDate(value: string): string | null {
  const t = value?.trim() ?? "";
  if (t.length === 8 && /^\d{8}$/.test(t)) {
    return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  }
  return t || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveLawDetailRequest;

    if (!body.rawJson || typeof body.rawJson !== "object") {
      return NextResponse.json(
        { ok: false, error: "rawJson 객체가 필요합니다." },
        { status: 400 },
      );
    }

    const parsed = parseLawDetailJson(body.rawJson);
    const supabase = getSupabaseAdmin();
    const lawIdStored = normalizeLawIdForStorage(parsed.document.lawId);

    const { data: lawRow, error: lawError } = await supabase
      .from("laws")
      .upsert(
        {
          law_id: lawIdStored,
          law_key: parsed.document.lawKey,
          law_name_kr: parsed.document.lawNameKr,
          law_name_hanja: parsed.document.lawNameHanja,
          law_name_short: parsed.document.lawNameShort,
          law_type_name: parsed.document.lawTypeName,
          law_type_code: parsed.document.lawTypeCode,
          ministry_name: parsed.document.ministryName,
          ministry_code: parsed.document.ministryCode,
          language: parsed.document.language,
          raw_json: parsed.document.rawJson,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "law_id" },
      )
      .select("id")
      .single();

    if (lawError) {
      throw lawError;
    }

    const lawPk = lawRow.id as number;

    const versionKey = `${parsed.document.promulgationNo}-${parsed.document.promulgationDate}`;

    const { data: existingByVersionKey } = await supabase
      .from("law_versions")
      .select("id")
      .eq("law_id", lawPk)
      .eq("version_key", versionKey)
      .maybeSingle();

    const { data: currentVer } = await supabase
      .from("law_versions")
      .select("id")
      .eq("law_id", lawPk)
      .eq("is_current", true)
      .maybeSingle();

    const versionPayload = {
      law_id: lawPk,
      version_key: versionKey,
      promulgation_no: parsed.document.promulgationNo,
      promulgation_date: toIsoDate(parsed.document.promulgationDate),
      enforcement_date: toIsoDate(parsed.document.enforcementDate),
      revision_type: parsed.document.revisionType,
      article_effective_text: parsed.document.articleEffectiveText,
      promulgated_law_yn: parsed.document.promulgatedLawYn,
      contact_phone: parsed.document.contactPhone,
      contact_department_name: parsed.document.contactDepartmentName,
      raw_json: parsed.document.rawJson,
      is_current: true,
      updated_at: new Date().toISOString(),
    };

    async function clearOtherCurrentFlags(targetVersionId: number) {
      const { error: demoteErr } = await supabase
        .from("law_versions")
        .update({ is_current: false })
        .eq("law_id", lawPk)
        .neq("id", targetVersionId);
      if (demoteErr) {
        throw demoteErr;
      }
    }

    let lawVersionId: number;

    if (existingByVersionKey?.id != null) {
      lawVersionId = existingByVersionKey.id as number;
      await clearOtherCurrentFlags(lawVersionId);
      const { error: verUpErr } = await supabase
        .from("law_versions")
        .update(versionPayload)
        .eq("id", lawVersionId);
      if (verUpErr) {
        throw verUpErr;
      }
    } else if (currentVer?.id) {
      lawVersionId = currentVer.id as number;
      await clearOtherCurrentFlags(lawVersionId);
      const { error: verUpErr } = await supabase
        .from("law_versions")
        .update(versionPayload)
        .eq("id", lawVersionId);
      if (verUpErr) {
        throw verUpErr;
      }
    } else {
      const { error: demoteAllErr } = await supabase
        .from("law_versions")
        .update({ is_current: false })
        .eq("law_id", lawPk);
      if (demoteAllErr) {
        throw demoteAllErr;
      }
      const { data: inserted, error: verInsErr } = await supabase
        .from("law_versions")
        .insert(versionPayload)
        .select("id")
        .single();
      if (verInsErr) {
        throw verInsErr;
      }
      lawVersionId = inserted.id as number;
    }

    await supabase.from("law_chunks").delete().eq("law_version_id", lawVersionId);

    const { data: existingArticles } = await supabase
      .from("law_articles")
      .select("id")
      .eq("law_version_id", lawVersionId);

    const existingArticleIds = (existingArticles ?? []).map((row) => row.id);

    if (existingArticleIds.length > 0) {
      await supabase
        .from("law_article_items")
        .delete()
        .in("law_article_id", existingArticleIds);
    }

    await supabase.from("law_articles").delete().eq("law_version_id", lawVersionId);

    const { error: structDelErr } = await supabase
      .from("law_structure_nodes")
      .delete()
      .eq("law_version_id", lawVersionId);
    if (structDelErr) {
      throw structDelErr;
    }

    const articleKeyToStructureNodeId =
      await insertLawStructureNodesForArticles(
        supabase,
        lawVersionId,
        parsed.articles,
      );

    const articleIdsByKey = new Map<string, number>();
    const structureNodeIdByArticleId = new Map<number, number | null>();
    const usedArticleNos = new Set<number>();

    for (const article of parsed.articles) {
      const articleNoStored = uniqueArticleNoForDb(
        article.articleNo,
        article.articleKey,
        article.articleOrder,
        usedArticleNos,
      );

      const structureNodeId =
        articleKeyToStructureNodeId.get(article.articleKey) ?? null;

      const { data: articleRow, error: articleError } = await supabase
        .from("law_articles")
        .insert({
          law_version_id: lawVersionId,
          structure_node_id: structureNodeId,
          article_key: article.articleKey,
          article_no: articleNoStored,
          article_title: article.articleTitle,
          article_content: article.articleContent,
          article_type: article.articleType,
          article_revision_type: article.articleRevisionType,
          article_effective_date: toIsoDate(article.articleEffectiveDate),
          article_changed_yn: article.articleChangedYn,
          article_moved_from: article.articleMovedFrom,
          article_moved_to: article.articleMovedTo,
          article_reference: article.articleReference,
          display_order: article.articleOrder,
          raw_json: article.rawJson,
        })
        .select("id")
        .single();

      if (articleError) {
        throw articleError;
      }

      articleIdsByKey.set(article.articleKey, articleRow.id);
      structureNodeIdByArticleId.set(
        articleRow.id as number,
        structureNodeId,
      );

      for (const item of article.items) {
        await insertArticleItemTree(supabase, articleRow.id, item, null);
      }
    }

    if (parsed.chunks.length > 0) {
      const chunkRows = parsed.chunks.map((chunk) => {
        const articleId =
          chunk.sourceType === "article" || chunk.sourceType === "item"
            ? guessArticleIdFromChunkKey(chunk.sourceKey, articleIdsByKey)
            : null;

        const structureNodeIdForChunk =
          articleId != null
            ? structureNodeIdByArticleId.get(articleId) ?? null
            : null;

        return {
          law_id: lawPk,
          law_version_id: lawVersionId,
          structure_node_id: structureNodeIdForChunk,
          law_article_id: articleId,
          source_type: chunk.sourceType,
          source_key: chunk.sourceKey,
          source_title: chunk.sourceTitle,
          chunk_text: chunk.chunkText,
          chunk_index: chunk.chunkIndex,
          metadata: chunk.metadata,
        };
      });

      for (let i = 0; i < chunkRows.length; i += LAW_CHUNKS_INSERT_BATCH_SIZE) {
        const batch = chunkRows.slice(i, i + LAW_CHUNKS_INSERT_BATCH_SIZE);
        const { error: chunkError } = await supabase
          .from("law_chunks")
          .insert(batch);

        if (chunkError) {
          throw chunkError;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      lawId: lawIdStored,
      lawVersionId,
      articleCount: parsed.articles.length,
      chunkCount: parsed.chunks.length,
    });
  } catch (error) {
    console.error("law-detail/save 오류:", error);

    const message = formatSupabaseClientError(error);

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

async function insertArticleItemTree(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  lawArticleId: number,
  item: ParsedArticleItem,
  parentItemId: number | null,
) {
  const { data: itemRow, error: itemError } = await supabase
    .from("law_article_items")
    .insert({
      law_article_id: lawArticleId,
      item_level: itemLevelToDb(item.itemLevel),
      parent_item_id: parentItemId,
      item_no: item.itemNo,
      item_content: item.itemContent,
      display_order: item.itemOrder,
      depth: itemSemanticLevel(item.itemLevel),
      raw_json: item.rawJson,
    })
    .select("id")
    .single();

  if (itemError) {
    throw itemError;
  }

  for (const child of item.children) {
    await insertArticleItemTree(supabase, lawArticleId, child, itemRow.id);
  }
}

function guessArticleIdFromChunkKey(
  sourceKey: string,
  articleIdsByKey: Map<string, number>,
): number | null {
  if (!sourceKey) return null;

  const articleKey = sourceKey.includes(":")
    ? sourceKey.split(":")[0]
    : sourceKey;

  return articleIdsByKey.get(articleKey) ?? null;
}
