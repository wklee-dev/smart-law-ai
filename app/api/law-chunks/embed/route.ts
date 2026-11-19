import {
  GoogleGenerativeAI,
  TaskType,
  type EmbedContentRequest,
} from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabase/admin";
import { normalizeLawIdForStorage } from "@/app/shared/law-id";

export const maxDuration = 300;

type EmbedRequestBody = {
  lawId?: string;
  limit?: number;
};

/** DB pgvector 컬럼 차원과 맞춤 (gemini-embedding-001 기본 3072 → API에서 축소). */
type GeminiEmbedRequest = EmbedContentRequest & {
  outputDimensionality?: number;
};

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableSupabaseError(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as { message?: string; code?: string };
  const msg = String(e.message ?? "").toLowerCase();
  if (
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("bad gateway") ||
    msg.includes("gateway timeout") ||
    msg.includes("service unavailable") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout")
  ) {
    return true;
  }
  /** PostgREST 일부 버전에서 HTML 본문이 message로 올 수 있음 */
  if (msg.includes("<html") || msg.includes("cloudflare")) {
    return true;
  }
  return false;
}

function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error) {
    const m = error.message;
    if (
      m.includes("<html") ||
      /\b502\b/i.test(m) ||
      m.toLowerCase().includes("bad gateway")
    ) {
      return "Supabase 연결 오류(502 등). 잠시 후 다시 시도하거나, 로컬이면 `supabase:start`와 NEXT_PUBLIC_SUPABASE_URL(API 포트)을 확인하고, 클라우드면 Supabase 상태 페이지를 확인하세요.";
    }
    return m;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) {
      return errorMessageFromUnknown(new Error(m));
    }
  }
  if (typeof error === "string") {
    return errorMessageFromUnknown(new Error(error));
  }
  try {
    const s = JSON.stringify(error);
    if (s.length > 500) return `${s.slice(0, 500)}…`;
    return s;
  } catch {
    return String(error);
  }
}

function parseOutputDimensionality(): number {
  const raw = process.env.EMBEDDING_OUTPUT_DIMENSIONALITY?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 768;
  if (!Number.isFinite(n) || n < 1) {
    return 768;
  }
  return n;
}

/** Google AI Studio API embed 모델 ID (models/ 접두어 제거). */
function normalizeEmbeddingModelId(raw: string | undefined): string {
  const fallback = "gemini-embedding-001";
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("models/")) return trimmed.slice("models/".length);
  return trimmed;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as EmbedRequestBody;

    const lawId = normalizeLawIdForStorage(body.lawId?.trim() ?? "");
    const limit = body.limit && body.limit > 0 ? body.limit : 50;

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const embeddingModel = normalizeEmbeddingModelId(
      process.env.EMBEDDING_MODEL,
    );
    const outputDimensionality = parseOutputDimensionality();

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "GEMINI_API_KEY가 설정되어 있지 않습니다." },
        { status: 500 },
      );
    }

    const supabase = getSupabaseAdmin();
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: embeddingModel });

    let lawPk: number | null = null;
    if (lawId) {
      for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
        const { data: lawRow, error: lawErr } = await supabase
          .from("laws")
          .select("id")
          .eq("law_id", lawId)
          .maybeSingle();
        if (!lawErr) {
          lawPk = lawRow?.id != null ? (lawRow.id as number) : null;
          break;
        }
        if (!isRetryableSupabaseError(lawErr) || attempt === RETRY_ATTEMPTS - 1) {
          throw lawErr;
        }
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
      }
    }

    const buildChunksQuery = () => {
      let q = supabase
        .from("law_chunks")
        .select("id, chunk_text, metadata")
        .is("embedding", null)
        .order("id", { ascending: true })
        .limit(limit);

      if (lawId) {
        if (lawPk != null) {
          q = q.eq("law_id", lawPk);
        } else {
          q = q.eq("metadata->>law_id", lawId);
        }
      }
      return q;
    };

    let rows: Awaited<ReturnType<typeof buildChunksQuery>> extends {
      data: infer D;
    }
      ? D
      : never = null;
    let selectError: { message: string } | null = null;

    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      const result = await buildChunksQuery();
      selectError = result.error;
      rows = result.data;
      if (!selectError) break;
      if (!isRetryableSupabaseError(selectError) || attempt === RETRY_ATTEMPTS - 1) {
        break;
      }
      await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
    }

    if (selectError) {
      throw selectError;
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        ok: true,
        embeddedCount: 0,
        message: "임베딩할 청크가 없습니다.",
      });
    }

    const inputs = rows.map((row) => row.chunk_text);

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

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const embedding = embeddings[i]?.values;

      if (!embedding) continue;

      let updateError: { message: string } | null = null;
      for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
        const { error } = await supabase
          .from("law_chunks")
          .update({
            embedding,
          })
          .eq("id", row.id);
        updateError = error;
        if (!updateError) break;
        if (!isRetryableSupabaseError(updateError) || attempt === RETRY_ATTEMPTS - 1) {
          break;
        }
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
      }

      if (updateError) {
        throw updateError;
      }
    }

    return NextResponse.json({
      ok: true,
      embeddedCount: rows.length,
      model: embeddingModel,
      outputDimensionality,
    });
  } catch (error) {
    console.error("law-chunks/embed 오류:", error);

    const message = errorMessageFromUnknown(error);

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
