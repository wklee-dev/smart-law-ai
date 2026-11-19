import { parseChunkMaxChars } from "@/app/lib/law-chat-context";
import { enrichChatSourcesWithLawNames } from "@/app/lib/law-name-resolve";
import { NextRequest, NextResponse } from "next/server";
import {
  getLangchainChatModelId,
  langchainDocumentsToChatSources,
  runLawVectorRagWithSources,
} from "@/app/lib/law-langchain-rag";

export const maxDuration = 120;

type Body = {
  message?: string;
  lawId?: string | null;
  matchCount?: number;
  minSimilarity?: number;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

/**
 * LangChain RAG: Supabase match_law_chunks + Gemini
 * POST JSON: { "message", "history"?, "lawId"?, "matchCount"?, "minSimilarity"? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const message = body.message?.trim() ?? "";
    if (!message) {
      return NextResponse.json(
        { ok: false, error: "message가 비어 있습니다." },
        { status: 400 },
      );
    }

    const lawId =
      body.lawId != null && String(body.lawId).trim()
        ? String(body.lawId).trim()
        : null;

    const {
      answer,
      documents,
      retrievalMode,
      matchCount,
      minSimilarityUsed,
    } = await runLawVectorRagWithSources(message, {
      lawId,
      retrieverOptions: {
        matchCount: body.matchCount,
        minSimilarity: body.minSimilarity,
      },
      history: body.history,
    });

    const sources = await enrichChatSourcesWithLawNames(
      langchainDocumentsToChatSources(documents),
    );
    const model = getLangchainChatModelId();

    return NextResponse.json({
      ok: true,
      answer,
      sources,
      retrievalMode,
      model,
      vectorSearchScope: lawId ? "single_law" : "all_chunks",
      matchCount,
      minSimilarity: minSimilarityUsed,
      chunkContextMaxChars: parseChunkMaxChars(),
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error("law-langchain-chat:", e);
    return NextResponse.json({ ok: false, error: err }, { status: 500 });
  }
}
