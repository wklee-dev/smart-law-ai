import { BaseRetriever, type BaseRetrieverInput } from "@langchain/core/retrievers";
import type { CallbackManagerForRetrieverRun } from "@langchain/core/callbacks/manager";
import { Document } from "@langchain/core/documents";
import { embedQueryText } from "@/app/lib/gemini-embed";
import {
  matchLawChunksClientFallback,
  shouldUseClientFallbackForMatchLawChunks,
} from "@/app/lib/match-law-chunks-fallback";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

type LawChunkRow = {
  id: number;
  chunk_text: string;
  source_title: string | null;
  metadata: Record<string, unknown> | null;
  similarity: number | null;
};

export type LawSupabaseRetrieverFields = {
  /** 비우면 전 법령 청크에서 검색 (match_law_chunks와 동일) */
  lawId?: string | null;
  matchCount?: number;
  minSimilarity?: number;
} & BaseRetrieverInput;

function rowsToDocuments(rows: LawChunkRow[]): Document[] {
  return rows.map(
    (row) =>
      new Document({
        pageContent: row.chunk_text,
        id: String(row.id),
        metadata: {
          id: row.id,
          source_title: row.source_title,
          law_id:
            row.metadata && typeof (row.metadata as { law_id?: string }).law_id === "string"
              ? (row.metadata as { law_id: string }).law_id
              : undefined,
          similarity: row.similarity,
          raw_metadata: row.metadata,
        },
      }),
  );
}

/**
 * Supabase `match_law_chunks` RPC + Gemini 임베딩.
 * RPC가 없으면 `matchLawChunksClientFallback`으로 대체(최근 청크 상한 스캔).
 */
export class LawSupabaseVectorRetriever extends BaseRetriever {
  lc_namespace = ["smart-law-ai", "law_supabase_vector"];

  lawId: string | null;
  matchCount: number;
  minSimilarity: number;

  constructor(fields: LawSupabaseRetrieverFields = {}) {
    super(fields);
    this.lawId =
      fields.lawId != null && String(fields.lawId).trim()
        ? String(fields.lawId).trim()
        : null;
    this.matchCount = fields.matchCount ?? 8;
    this.minSimilarity = fields.minSimilarity ?? 0.45;
  }

  async _getRelevantDocuments(
    query: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _runManager?: CallbackManagerForRetrieverRun,
  ): Promise<Document[]> {
    const supabase = getSupabaseAdmin();
    const embedding = await embedQueryText(query);
    const matchCount = Math.min(32, Math.max(1, this.matchCount));

    const { data, error } = await supabase.rpc("match_law_chunks", {
      query_embedding: embedding,
      match_count: matchCount,
      filter_law_id: this.lawId,
      min_similarity: this.minSimilarity,
    });

    if (!error) {
      const rows = (data ?? []) as LawChunkRow[];
      return rowsToDocuments(rows);
    }

    if (shouldUseClientFallbackForMatchLawChunks(error.message)) {
      console.warn(
        "[LawSupabaseVectorRetriever] match_law_chunks RPC 사용 불가, 앱단 유사도 검색으로 대체합니다.",
        error.message,
      );
      const fallbackRows = await matchLawChunksClientFallback(embedding, {
        lawId: this.lawId,
        matchCount,
        minSimilarity: this.minSimilarity,
      });
      return rowsToDocuments(fallbackRows);
    }

    throw new Error(
      `match_law_chunks RPC 실패: ${error.message}. sql/match_law_chunks.sql을 Supabase에 적용하거나(차원 768) 연결·권한을 확인하세요.`,
    );
  }
}
