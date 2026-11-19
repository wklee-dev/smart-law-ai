import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import {
  formatLawSourceLine,
  parseChunkMaxChars,
  parseExcerptMaxChars,
  truncateChunkAtLawBoundary,
} from "@/app/lib/law-chat-context";
import {
  buildContextBlock,
  retrieveLawChatChunks,
} from "@/app/lib/law-chat-retrieval";
import { enrichChatSourcesWithLawNames } from "@/app/lib/law-name-resolve";

export const maxDuration = 120;

type LawChatRequest = {
  message?: string;
  /** 기본정보 법령ID 문자열. 비우면 전체 청크에서 검색 */
  lawId?: string | null;
  /** 직전까지의 대화 (현재 사용자 메시지는 `message`로만 전달) */
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

const MAX_HISTORY_MESSAGES = 16;
const MAX_HISTORY_CHARS_PER_MESSAGE = 6000;

function trimHistory(
  history: LawChatRequest["history"],
): Array<{ role: "user" | "assistant"; content: string }> {
  if (!history?.length) return [];
  const sliced = history.slice(-MAX_HISTORY_MESSAGES);
  return sliced.map((h) => ({
    role: h.role === "assistant" ? "assistant" : "user",
    content: (h.content ?? "").slice(0, MAX_HISTORY_CHARS_PER_MESSAGE),
  }));
}

function buildHistoryBlock(
  history: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  if (history.length === 0) return "";
  const lines = history.map((h) => {
    const label = h.role === "user" ? "사용자" : "어시스턴트";
    return `${label}: ${h.content.trim()}`;
  });
  return `[이전 대화]\n${lines.join("\n\n")}\n\n`;
}

const DEFAULT_CHAT_MODEL = "gemini-2.5-flash";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as LawChatRequest;
    const message = body.message?.trim() ?? "";
    const lawId = body.lawId?.trim() ? body.lawId.trim() : null;
    const history = trimHistory(body.history);

    if (!message) {
      return NextResponse.json(
        { ok: false, error: "message가 필요합니다." },
        { status: 400 },
      );
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "GEMINI_API_KEY가 설정되어 있지 않습니다." },
        { status: 500 },
      );
    }

    const chatModel =
      process.env.GEMINI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL;

    const maxChunkChars = parseChunkMaxChars();
    const excerptMaxChars = parseExcerptMaxChars();

    const { rows, retrievalMode, minSimilarityUsed, matchCount } =
      await retrieveLawChatChunks({ message, lawId });

    const context = buildContextBlock(rows, maxChunkChars);

    const systemInstruction = `당신은 한국 법령 조문을 참고하여 질문에 답하는 보조 도구입니다.
규칙:
- 검색 시스템은 DB에 저장된 법령 청크(조·항·호 단위로 나뉜 본문과 동일 원문) 중, 질문과 유사한 일부를 [참고 조문]으로 보여 줍니다. 일반법령조회 화면의 조문 목록과 다른 법이 아니라, 같은 법령 본문을 잘게 나눈 것입니다.
- [참고 조문]은 목록 앞쪽일수록 질문과의 관련도가 높습니다. **앞쪽 조문을 먼저 근거로 삼고**, 뒤쪽만 인용해 앞쪽을 건너뛰지 마세요. 질문 핵심어와 출처 제목이 맞는 앞쪽 조문이 있는데 뒤쪽만 보고 「확인 불가」라고 하지 마세요.
- 답변은 오직 아래 [참고 조문]에 적힌 문장·표현에만 근거하세요. 일반 상식이나 다른 법령 지식으로 숫자·일수·기한·금액을 보태거나 추측하지 마세요.
- 일수·날짜·"N일 이내" 등 구체적 수치는 [참고 조문] 본문에 있는 경우에만 그대로 인용하세요. 본문에 없으면 "참고 조문 본문에는 구체적 일수가 적혀 있지 않습니다."라고 하세요.
- [참고 조문] 전반이 질문과 무관할 때에만 "제공된 참고 조문만으로는 확인할 수 없습니다."라고 하세요.
- [이전 대화]가 있으면 맥락만 반영하되, 사실·수치는 [참고 조문]에 맞추세요.
- 법률 자문이나 확정적 법적 판단을 대신하지 마세요.
- 답변은 한국어로 간결하게 작성하세요.
- 필요하면 참고한 조문 번호나 제목을 괄호로 짧게 언급하세요.`;

    const historyBlock = buildHistoryBlock(history);
    const userBlock = `${historyBlock}[참고 조문]\n${context}\n\n[현재 사용자 질문]\n${message}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: chatModel,
      systemInstruction,
    });

    const result = await model.generateContent(userBlock);
    const answer =
      result.response.text()?.trim() || "응답을 생성하지 못했습니다.";

    const sources = await enrichChatSourcesWithLawNames(
      rows.map((r) => {
        const meta = r.metadata;
        const lawName =
          meta && typeof meta.law_name_kr === "string" ? meta.law_name_kr : null;
        const lawIdVal =
          meta && typeof meta.law_id === "string" ? meta.law_id : null;
        return {
          id: r.id,
          source_title: r.source_title,
          source_label: formatLawSourceLine(meta, r.source_title),
          law_name_kr: lawName,
          law_id: lawIdVal,
          similarity: r.similarity,
          excerpt: truncateChunkAtLawBoundary(
            (r.chunk_text ?? "").trim(),
            excerptMaxChars,
          ),
        };
      }),
    );

    return NextResponse.json({
      ok: true,
      answer,
      sources,
      retrievalMode,
      model: chatModel,
      /** lawId 없음: match_law_chunks에서 filter_law_id IS NULL로 전체 청크 테이블 대상 */
      vectorSearchScope: lawId ? "single_law" : "all_chunks",
      matchCount,
      minSimilarity: minSimilarityUsed,
      chunkContextMaxChars: maxChunkChars,
    });
  } catch (error) {
    console.error("law-chat 오류:", error);
    const msg =
      error instanceof Error ? error.message : "채팅 처리 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
