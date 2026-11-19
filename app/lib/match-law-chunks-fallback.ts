import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { cosineSimilarity, parseVector } from "@/app/lib/law-embedding-sim";

/**
 * `match_law_chunks` RPC가 DB에 없거나 실패할 때, 동일한 논리를
 * Node에서 근사 수행합니다. (최근 N행만 스캔—대용량이면 Supabase에 RPC 설치 권장)
 */
const FALLBACK_SCAN_CAP = 5000;

export type MatchLawChunkRow = {
  id: number;
  chunk_text: string;
  source_title: string | null;
  metadata: Record<string, unknown> | null;
  similarity: number;
};

export async function matchLawChunksClientFallback(
  queryEmbedding: number[],
  opts: {
    lawId: string | null;
    matchCount: number;
    minSimilarity: number;
  },
): Promise<MatchLawChunkRow[]> {
  const { lawId, matchCount, minSimilarity } = opts;
  const k = Math.min(32, Math.max(1, matchCount));
  const supabase = getSupabaseAdmin();

  let q = supabase
    .from("law_chunks")
    .select("id, chunk_text, source_title, metadata, embedding")
    .not("embedding", "is", null)
    .order("id", { ascending: false })
    .limit(FALLBACK_SCAN_CAP);

  if (lawId?.trim()) {
    q = q.eq("metadata->>law_id", lawId.trim());
  }

  const { data, error } = await q;
  if (error) {
    throw new Error(`law_chunks 조회 실패: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    id: number;
    chunk_text: string;
    source_title: string | null;
    metadata: Record<string, unknown> | null;
    embedding: unknown;
  }>;

  const out: MatchLawChunkRow[] = [];
  for (const r of rows) {
    const v = parseVector(r.embedding);
    if (!v || v.length !== queryEmbedding.length) continue;
    const sim = cosineSimilarity(queryEmbedding, v);
    if (sim < 0) continue;
    if (minSimilarity >= 0 && sim <= minSimilarity) continue;
    out.push({
      id: r.id,
      chunk_text: r.chunk_text,
      source_title: r.source_title,
      metadata: r.metadata,
      similarity: sim,
    });
  }
  out.sort((a, b) => b.similarity - a.similarity);
  return out.slice(0, k);
}

/** RPC 미배포·스키마 캐시에 없음 등 → 앱단 폴백 시도 */
export function shouldUseClientFallbackForMatchLawChunks(message: string): boolean {
  const t = message.toLowerCase();
  if (!t.includes("match_law_chunks") && !t.includes("schema cache")) {
    return false;
  }
  return (
    t.includes("could not find") ||
    t.includes("schema cache") ||
    t.includes("does not exist") ||
    (t.includes("function") && t.includes("not found"))
  );
}
