/**
 * admrul_list_items.embed_text 에 대한 Gemini 임베딩
 */
import {
  GoogleGenerativeAI,
  TaskType,
  type EmbedContentRequest,
} from "@google/generative-ai";
import type { SupabaseClient } from "@supabase/supabase-js";

type GeminiEmbedRequest = EmbedContentRequest & {
  outputDimensionality?: number;
};

const BATCH_SIZE = 24;

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

export async function embedAdmrulListItemIds(
  supabase: SupabaseClient,
  itemIds: number[],
): Promise<{ embeddedCount: number; model: string; outputDimensionality: number }> {
  if (itemIds.length === 0) {
    return { embeddedCount: 0, model: "", outputDimensionality: 0 };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다.");
  }

  const embeddingModel = normalizeEmbeddingModelId(process.env.EMBEDDING_MODEL);
  const outputDimensionality = parseOutputDimensionality();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: embeddingModel });

  let total = 0;

  for (let off = 0; off < itemIds.length; off += BATCH_SIZE) {
    const slice = itemIds.slice(off, off + BATCH_SIZE);
    const { data: rows, error } = await supabase
      .from("admrul_list_items")
      .select("id, embed_text")
      .in("id", slice);

    if (error) throw error;
    const list = rows ?? [];
    if (list.length === 0) continue;

    const inputs = list.map((r) => String(r.embed_text ?? ""));
    const embeddingResponse = await model.batchEmbedContents({
      requests: inputs.map(
        (text): GeminiEmbedRequest => ({
          content: { role: "user", parts: [{ text }] },
          taskType: TaskType.RETRIEVAL_DOCUMENT,
          outputDimensionality,
        }),
      ),
    });

    const embeddings = embeddingResponse.embeddings;
    for (let i = 0; i < list.length; i += 1) {
      const row = list[i];
      const embedding = embeddings[i]?.values;
      if (!embedding || !row?.id) continue;
      const { error: upErr } = await supabase
        .from("admrul_list_items")
        .update({ embedding })
        .eq("id", row.id);
      if (upErr) throw upErr;
      total += 1;
    }
  }

  return { embeddedCount: total, model: embeddingModel, outputDimensionality };
}
