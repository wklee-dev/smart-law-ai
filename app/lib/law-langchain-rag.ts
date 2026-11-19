import { Document } from "@langchain/core/documents";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { RunnableLambda } from "@langchain/core/runnables";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  formatLawSourceLine,
  parseChunkMaxChars,
  parseExcerptMaxChars,
  truncateChunkAtLawBoundary,
} from "@/app/lib/law-chat-context";
import {
  buildContextBlock,
  retrieveLawChatChunks,
  type LawChatMatchRow,
  type LawChatRetrievalMode,
} from "@/app/lib/law-chat-retrieval";

/** `law-chat`(GEMINI_CHAT_MODEL)과 맞춤. 구버전 `gemini-2.0-flash` 는 신규 키에서 404가 날 수 있음. */
export function getLangchainChatModelId(): string {
  return (
    process.env.LAW_LANGCHAIN_MODEL?.trim() ||
    process.env.GEMINI_CHAT_MODEL?.trim() ||
    "gemini-2.5-flash"
  );
}

const MAX_HISTORY_MESSAGES = 16;
const MAX_HISTORY_CHARS_PER_MESSAGE = 6000;

function geminiApiKey(): string {
  const k =
    process.env.GEMINI_API_KEY?.trim() ??
    process.env.GOOGLE_API_KEY?.trim() ??
    "";
  if (!k) {
    throw new Error("GEMINI_API_KEY(또는 GOOGLE_API_KEY)가 없습니다.");
  }
  return k;
}

function trimHistory(
  history: Array<{ role: "user" | "assistant"; content: string }> | undefined,
): Array<{ role: "user" | "assistant"; content: string }> {
  if (!history?.length) return [];
  const sliced = history.slice(-MAX_HISTORY_MESSAGES);
  return sliced.map((h) => ({
    role: h.role === "assistant" ? "assistant" : "user",
    content: (h.content ?? "").slice(0, MAX_HISTORY_CHARS_PER_MESSAGE),
  }));
}

/** 벡터 검색은 현재 질문만 사용·LLM에는 이전 대화 포함 */
function buildUserTurn(
  message: string,
  history?: Array<{ role: "user" | "assistant"; content: string }>,
): string {
  const h = trimHistory(history);
  if (h.length === 0) return message;
  const lines = h.map((x) => {
    const label = x.role === "user" ? "사용자" : "어시스턴트";
    return `${label}: ${x.content.trim()}`;
  });
  return `[이전 대화]\n${lines.join("\n\n")}\n\n[현재 질문]\n${message}`;
}

function messageContentToString(
  content:
    | string
    | (Record<string, unknown> | { type?: string; text?: string })[],
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === "string") return c;
        if (
          c &&
          typeof c === "object" &&
          "text" in c &&
          typeof (c as { text: string }).text === "string"
        ) {
          return (c as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

export type ChatSourcePayload = {
  id: number;
  source_title: string | null;
  source_label: string;
  law_name_kr: string | null;
  law_id: string | null;
  similarity: number | null;
  excerpt: string;
};

export function langchainDocumentsToChatSources(
  docs: Document[],
): ChatSourcePayload[] {
  const excerptMaxChars = parseExcerptMaxChars();
  return docs.map((d) => {
    const raw = (d.metadata?.raw_metadata ?? null) as Record<
      string,
      unknown
    > | null;
    const id =
      typeof d.metadata?.id === "number"
        ? d.metadata.id
        : Number(d.id) || 0;
    const sourceTitle =
      typeof d.metadata?.source_title === "string"
        ? d.metadata.source_title
        : null;
    return {
      id,
      source_title: sourceTitle,
      source_label: formatLawSourceLine(raw, sourceTitle),
      law_name_kr:
        raw && typeof raw.law_name_kr === "string" ? raw.law_name_kr : null,
      law_id:
        (raw && typeof raw.law_id === "string" ? raw.law_id : null) ??
        (typeof d.metadata?.law_id === "string" ? d.metadata.law_id : null),
      similarity:
        typeof d.metadata?.similarity === "number"
          ? d.metadata.similarity
          : null,
      excerpt: truncateChunkAtLawBoundary(
        d.pageContent.trim(),
        excerptMaxChars,
      ),
    };
  });
}

export type LawVectorRetrieverOptions = {
  matchCount?: number;
  minSimilarity?: number;
};

export type RunLawVectorRagOptions = {
  lawId?: string | null;
  retrieverOptions?: LawVectorRetrieverOptions;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

function matchRowsToDocuments(rows: LawChatMatchRow[]): Document[] {
  return rows.map(
    (r) =>
      new Document({
        id: String(r.id),
        pageContent: (r.chunk_text ?? "").trim(),
        metadata: {
          id: r.id,
          source_title: r.source_title,
          similarity: r.similarity,
          law_id:
            r.metadata && typeof (r.metadata as { law_id?: string }).law_id === "string"
              ? (r.metadata as { law_id: string }).law_id
              : null,
          raw_metadata: r.metadata,
        },
      }),
  );
}

/**
 * 임베딩 검색은 `message`만 사용하고, 답변 생성 시 `history`를 반영합니다.
 * 검색은 `/api/law-chat`과 동일한 `retrieveLawChatChunks`(벡터·완화·텍스트 재정렬)를 사용합니다.
 */
export async function runLawVectorRagWithSources(
  message: string,
  options?: RunLawVectorRagOptions,
): Promise<{
  answer: string;
  documents: Document[];
  retrievalMode: LawChatRetrievalMode;
  matchCount: number;
  minSimilarityUsed: number;
}> {
  const { rows, retrievalMode, minSimilarityUsed, matchCount } =
    await retrieveLawChatChunks({
      message,
      lawId: options?.lawId ?? null,
      matchCount: options?.retrieverOptions?.matchCount,
      minSimilarity: options?.retrieverOptions?.minSimilarity,
    });

  const maxChunkChars = parseChunkMaxChars();
  const context = buildContextBlock(rows, maxChunkChars);
  const docs = matchRowsToDocuments(rows);

  const llm = new ChatGoogleGenerativeAI({
    model: getLangchainChatModelId(),
    apiKey: geminiApiKey(),
    temperature: 0,
  });

  // ChatPromptTemplate + {context} 는 조문 본문에 { } 가 있으면 f-string으로 파싱 오류가 납니다.
  // 본문은 문자열 연결로만 시스템 메시지에 넣습니다. 규칙 문구는 `/api/law-chat` systemInstruction 과 동일 계열로 맞춥니다.
  const systemText = `당신은 한국 법령 조문을 참고하여 질문에 답하는 보조 도구입니다.
규칙:
- 검색 시스템은 DB에 저장된 법령 청크(조·항·호 단위로 나뉜 본문과 동일 원문) 중, 질문과 유사한 일부를 [참고 조문]으로 보여 줍니다. 일반법령조회 화면의 조문 목록과 다른 법이 아니라, 같은 법령 본문을 잘게 나눈 것입니다.
- [참고 조문]은 목록 앞쪽일수록 질문과의 관련도가 높습니다. **[1]번이 가장 우선입니다.** 앞쪽 조문을 먼저 근거로 삼고, 뒤쪽만 인용해 앞쪽을 건너뛰지 마세요. 답변 서술 순서도 [1]·[2]·… 번호 순을 따르세요(앞 번호 조문을 먼저 설명한 뒤 보완 조문을 인용).
- 질문 핵심어와 출처 제목이 맞는 앞쪽 조문이 있는데 뒤쪽만 보고 「확인 불가」라고 하지 마세요.
- 답변은 오직 아래 [참고 조문]에 적힌 문장·표현에만 근거하세요. 일반 상식이나 다른 법령 지식으로 숫자·일수·기한·금액을 보태거나 추측하지 마세요.
- 일수·날짜·"N일 이내" 등 구체적 수치는 [참고 조문] 본문에 있는 경우에만 그대로 인용하세요. 본문에 없으면 "참고 조문 본문에는 구체적 일수가 적혀 있지 않습니다."라고 하세요.
- [참고 조문] 전반이 질문과 무관할 때에만 "제공된 참고 조문만으로는 확인할 수 없습니다."라고 하세요.
- [이전 대화]가 있으면 맥락만 반영하되, 사실·수치는 [참고 조문]에 맞추세요.
- 법률 자문이나 확정적 법적 판단을 대신하지 마세요.
- 답변은 한국어로 간결하게 작성하세요.
- 필요하면 참고한 조문 번호나 제목을 괄호로 짧게 언급하세요.

[참고 조문]
${context}`;

  const h = trimHistory(options?.history);
  const userInput =
    h.length === 0
      ? `[현재 사용자 질문]\n${message}`
      : `${buildUserTurn(message, options?.history)}`;
  const res = await llm.invoke([
    new SystemMessage(systemText),
    new HumanMessage(userInput),
  ]);
  const answer = messageContentToString(res.content).trim() || "응답을 생성하지 못했습니다.";
  return {
    answer,
    documents: docs,
    retrievalMode,
    matchCount,
    minSimilarityUsed,
  };
}

/**
 * @deprecated 내부·테스트용. UI는 `runLawVectorRagWithSources` + API를 사용합니다.
 */
export function createLawVectorRagChain(options?: {
  lawId?: string | null;
  retrieverOptions?: LawVectorRetrieverOptions;
}) {
  return RunnableLambda.from(async (input: { input: string }) => {
    const { answer } = await runLawVectorRagWithSources(input.input, options);
    return answer;
  });
}

export type RagInput = { input: string };
