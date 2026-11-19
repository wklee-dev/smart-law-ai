import {
  GoogleGenerativeAI,
  TaskType,
  type EmbedContentRequest,
} from "@google/generative-ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isGeminiRateLimitError,
  withGeminiEmbedRetry,
} from "@/app/lib/gemini-embed-retry";
import { normalizeTariffCountryCode } from "@/app/lib/tariff-country-code";

type GeminiEmbedRequest = EmbedContentRequest & {
  outputDimensionality?: number;
};

function parseOutputDimensionality(): number {
  const raw = process.env.EMBEDDING_OUTPUT_DIMENSIONALITY?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 768;
  if (!Number.isFinite(n) || n < 1) return 768;
  return n;
}

function normalizeEmbeddingModelId(raw: string | undefined): string {
  const fallback = "gemini-embedding-001";
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("models/")) return trimmed.slice("models/".length);
  return trimmed;
}

export type EmbedTariffChunksFilter = {
  year?: number;
  countryCode?: string;
  sourceLevel?: string;
  limit?: number;
};

export async function embedTariffChunksBatch(
  supabase: SupabaseClient,
  filter: EmbedTariffChunksFilter = {},
): Promise<{ embeddedCount: number; model: string; outputDimensionality: number }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다.");
  }

  const embeddingModel = normalizeEmbeddingModelId(process.env.EMBEDDING_MODEL);
  const outputDimensionality = parseOutputDimensionality();
  const envLimit = Number.parseInt(
    process.env.TARIFF_EMBED_BATCH_LIMIT?.trim() ??
      process.env.HS_EMBED_BATCH_LIMIT?.trim() ??
      "",
    10,
  );
  const defaultLimit =
    Number.isFinite(envLimit) && envLimit > 0 ? envLimit : 20;
  const limit =
    filter.limit && filter.limit > 0 ? filter.limit : defaultLimit;

  let q = supabase
    .from("tariff_chunks")
    .select("id, chunk_text")
    .is("embedding", null)
    .order("id", { ascending: true })
    .limit(limit);

  if (filter.year != null) q = q.eq("year", filter.year);
  if (filter.countryCode) {
    q = q.eq("country_code", normalizeTariffCountryCode(filter.countryCode));
  }
  if (filter.sourceLevel) q = q.eq("source_level", filter.sourceLevel);

  const { data: rows, error } = await q;
  if (error) throw error;
  const list = rows ?? [];
  if (list.length === 0) {
    return { embeddedCount: 0, model: embeddingModel, outputDimensionality };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: embeddingModel });
  const inputs = list.map((r) => String(r.chunk_text ?? ""));

  const embeddingResponse = await withGeminiEmbedRetry(() =>
    model.batchEmbedContents({
      requests: inputs.map(
        (text): GeminiEmbedRequest => ({
          content: { role: "user", parts: [{ text }] },
          taskType: TaskType.RETRIEVAL_DOCUMENT,
          outputDimensionality,
        }),
      ),
    }),
  );

  const embeddings = embeddingResponse.embeddings;
  let n = 0;
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    const embedding = embeddings[i]?.values;
    if (!embedding || !row?.id) continue;
    const { error: upErr } = await supabase
      .from("tariff_chunks")
      .update({ embedding })
      .eq("id", row.id);
    if (upErr) throw upErr;
    n += 1;
  }

  return { embeddedCount: n, model: embeddingModel, outputDimensionality };
}

export { isGeminiRateLimitError };
