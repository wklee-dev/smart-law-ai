import {
  GoogleGenerativeAI,
  TaskType,
  type EmbedContentRequest,
} from "@google/generative-ai";

type GeminiEmbedRequest = EmbedContentRequest & {
  outputDimensionality?: number;
};

export function parseOutputDimensionality(): number {
  const raw = process.env.EMBEDDING_OUTPUT_DIMENSIONALITY?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 768;
  if (!Number.isFinite(n) || n < 1) {
    return 768;
  }
  return n;
}

export function normalizeEmbeddingModelId(raw: string | undefined): string {
  const fallback = "gemini-embedding-001";
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("models/")) return trimmed.slice("models/".length);
  return trimmed;
}

/** 질의 임베딩 (RAG 검색용, RETRIEVAL_QUERY) */
export async function embedQueryText(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다.");
  }

  const embeddingModel = normalizeEmbeddingModelId(process.env.EMBEDDING_MODEL);
  const outputDimensionality = parseOutputDimensionality();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: embeddingModel });

  const res = await model.embedContent({
    content: { role: "user", parts: [{ text }] },
    taskType: TaskType.RETRIEVAL_QUERY,
    outputDimensionality,
  } as GeminiEmbedRequest);

  const values = res.embedding?.values;
  if (!values?.length) {
    throw new Error("질의 임베딩을 생성하지 못했습니다.");
  }
  return values;
}
