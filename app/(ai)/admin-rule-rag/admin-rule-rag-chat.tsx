"use client";

import { useEffect, useId, useRef, useState } from "react";

import { AnswerWithCitations } from "@/app/components/rag-chat/citation-view";
import { normalizeChatDisplayText } from "@/app/shared/chat-display-text";
import { useChatTextareaState } from "@/app/shared/use-chat-textarea-state";
import { requestRagChat } from "@/lib/rag/rag-client";
import type {
  CitationValidationStatus,
  RAGChatRequest,
  RAGChatResponse,
  RAGSource,
} from "@/types/rag-api";

const MAX_QUERY_LENGTH = 2000;

const FIXED_REQUEST: Omit<RAGChatRequest, "query"> = {
  match_count: 10,
  candidate_multiplier: 3,
  max_results: 5,
  temperature: 0.2,
  max_output_tokens: 2048,
  document_category: "ADMIN_RULE",
  source_table: "admin_rule",
};

const EXAMPLE_QUESTIONS = [
  "사후관리 대상 물품의 용도 외 사용 승인은 어떻게 하나요?",
  "사후관리에 관한 고시 제29조는 어떤 내용을 규정하나요?",
  "위탁사후관리물품 승인신청 절차를 알려주세요.",
  "용도 외 사용",
  "용도 외 사용 승인과 위탁사후관리물품 승인 절차의 차이를 설명해주세요.",
  "현재 적재된 자료에 없는 가상의 관세 자동승인제도를 설명해주세요.",
] as const;

type ChatMessage =
  | {
      id: string;
      role: "user";
      text: string;
      createdAt: string;
    }
  | {
      id: string;
      role: "assistant";
      text: string;
      createdAt: string;
      response: RAGChatResponse;
    }
  | {
      id: string;
      role: "error";
      text: string;
      createdAt: string;
      requestId: string | null;
    };

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapUserFacingError(code: string): string {
  switch (code) {
    case "RAG_API_UNAVAILABLE":
    case "NETWORK_ERROR":
      return "현재 행정규칙 답변 서비스에 연결할 수 없습니다.";
    case "RAG_API_TIMEOUT":
      return "답변 생성 시간이 초과되었습니다.";
    case "VALIDATION_ERROR":
    case "INVALID_REQUEST":
    case "INVALID_QUERY":
      return "질문 내용을 확인해주세요.";
    default:
      return "답변을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }
}

function citationStatusLabel(status: CitationValidationStatus): string {
  switch (status) {
    case "VALID":
      return "출처 확인 완료";
    case "NO_CITATIONS":
      return "답변에 출처 표시가 없습니다.";
    case "INVALID_CITATIONS":
      return "확인할 수 없는 출처번호가 포함되었습니다.";
    case "MIXED_CITATIONS":
      return "일부 출처번호를 확인할 수 없습니다.";
    default:
      return "출처 상태를 확인할 수 없습니다.";
  }
}

function sourceTitleText(source: RAGSource): string {
  const title =
    (source.title && source.title.trim()) ||
    (source.header && source.header.trim()) ||
    "";
  return normalizeChatDisplayText(title);
}

function adminRuleSourcePopupUrl(source: RAGSource): string {
  const params = new URLSearchParams();
  params.set("chunkId", String(source.id));
  params.set("embed", "1");
  const name = source.law_name?.trim();
  if (name) {
    params.set("name", name);
  }
  return `/admin-rule-source-info?${params.toString()}`;
}

function openAdminRuleSourcePopup(source: RAGSource): void {
  window.open(
    adminRuleSourcePopupUrl(source),
    `admin-rule-source-${source.id}`,
    "popup=yes,width=720,height=680,noopener,noreferrer,scrollbars=yes,resizable=yes",
  );
}

function sortSources(sources: RAGSource[]): RAGSource[] {
  return [...sources].sort((a, b) => {
    const rankA = a.ranking_rank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.ranking_rank ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    return a.citation_id.localeCompare(b.citation_id, "ko");
  });
}

function formatIdList(values: string[]): string {
  if (values.length === 0) {
    return "없음";
  }
  return values.join(", ");
}

function CitationStatusBanner({
  response,
}: {
  response: RAGChatResponse;
}) {
  const status = response.citation_validation.status;
  const isWarning = status !== "VALID";
  const validation = response.citation_validation;

  return (
    <div className="mb-3 space-y-2">
      <div
        className={`rounded-xl border px-3 py-2 text-sm font-medium ${
          isWarning
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-teal-200 bg-teal-50 text-teal-900"
        }`}
      >
        {citationStatusLabel(status)}
        <span className="ml-2 text-[11px] font-normal opacity-80">
          ({status})
        </span>
      </div>

      <details className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
        <summary className="cursor-pointer select-none font-medium text-slate-700">
          검증 정보
        </summary>
        <dl className="mt-2 grid gap-1 sm:grid-cols-2">
          <div>
            <dt className="text-slate-400">유효 출처번호</dt>
            <dd className="break-words">
              {formatIdList(validation.valid_citation_ids)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">확인 불가 출처번호</dt>
            <dd className="break-words">
              {formatIdList(validation.invalid_citation_ids)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">사용된 출처 수</dt>
            <dd>{response.cited_source_count}</dd>
          </div>
          <div>
            <dt className="text-slate-400">미사용 출처 수</dt>
            <dd>{response.unused_source_count}</dd>
          </div>
        </dl>
      </details>
    </div>
  );
}

function SourceCard({ source }: { source: RAGSource }) {
  const title = sourceTitleText(source);
  const url = adminRuleSourcePopupUrl(source);

  return (
    <article className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-md bg-teal-700 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            [{source.citation_id}]
          </span>
          <span className="min-w-0 break-words text-sm font-semibold text-slate-900">
            {normalizeChatDisplayText(source.law_name)}
          </span>
          {source.document_type ? (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
              {source.document_type}
            </span>
          ) : null}
        </div>

        {source.article_no ? (
          <p className="break-words text-sm text-slate-700">
            {normalizeChatDisplayText(source.article_no)}
          </p>
        ) : null}

        {title ? (
          <p className="break-words text-sm leading-relaxed text-slate-600">
            {title}
          </p>
        ) : null}

        <div className="mt-1 space-y-0.5 text-[12px] text-slate-500">
          <p>
            검색 순위:{" "}
            {source.ranking_rank != null ? source.ranking_rank : "-"}
          </p>
          <p>검색 점수: {source.ranking_score.toFixed(4)}</p>
          <p>
            {source.cited ? "답변에서 사용됨" : "검색됐지만 답변에 미사용"}
          </p>
          <p>
            {source.citation_count > 0
              ? `${source.citation_count}회 인용`
              : "인용 없음"}
          </p>
        </div>

        <div className="pt-1">
          <a
            href={url}
            onClick={(event) => {
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.button !== 0
              ) {
                return;
              }
              event.preventDefault();
              openAdminRuleSourcePopup(source);
            }}
            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-[#1e2f4f]/30 hover:bg-[#1e2f4f]/5 hover:text-[#1e2f4f]"
          >
            원문 보기
          </a>
        </div>
      </div>
    </article>
  );
}

function SearchResultsPanel({
  response,
}: {
  response: RAGChatResponse;
}) {
  const cited = sortSources(response.cited_sources);
  const unused = sortSources(response.unused_sources);
  const total = cited.length + unused.length;

  return (
    <div className="mt-5 border-t border-slate-200 pt-4">
      <div className="mb-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-100/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            검색된 행정규칙
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            Context에 포함된 cited/unused 출처입니다. 검색·정렬 품질 확인용입니다.
          </p>
        </div>
        <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 tabular-nums">
          {total}건
        </span>
      </div>

      <p className="mb-3 text-[10px] leading-relaxed text-slate-400">
        검색 점수는 검색·정렬을 위한 참고값이며, 법적 정확도나 신뢰도를
        의미하지 않습니다.
      </p>

      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-800">
          답변에 사용된 출처
          <span className="ml-2 text-xs font-normal text-slate-500">
            {cited.length}건
          </span>
        </h4>
        {cited.length === 0 ? (
          <p className="text-sm text-slate-500">
            답변에 사용된 출처가 없습니다.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {cited.map((source) => (
              <SourceCard
                key={`cited-${source.citation_id}-${source.id}`}
                source={source}
              />
            ))}
          </div>
        )}
      </section>

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
        <summary className="cursor-pointer select-none text-sm font-semibold text-slate-800">
          검색된 추가 자료
          <span className="ml-2 text-xs font-normal text-slate-500">
            {unused.length}건 · 검색됐지만 답변에 사용되지 않음
          </span>
        </summary>
        <div className="mt-3">
          {unused.length === 0 ? (
            <p className="text-sm text-slate-500">추가 검색 자료가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {unused.map((source) => (
                <SourceCard
                  key={`unused-${source.citation_id}-${source.id}`}
                  source={source}
                />
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

function RagVerificationPanel({
  response,
}: {
  response: RAGChatResponse;
}) {
  const validation = response.citation_validation;

  return (
    <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600">
      <summary className="cursor-pointer select-none font-medium text-slate-700">
        RAG 검증 정보
      </summary>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-slate-400">Request ID</dt>
          <dd className="break-all">{response.request_id}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Provider</dt>
          <dd>{response.provider}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Model</dt>
          <dd className="break-words">{response.model}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Context Count</dt>
          <dd>{response.context_count}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Cited Source Count</dt>
          <dd>{response.cited_source_count}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Unused Source Count</dt>
          <dd>{response.unused_source_count}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Citation Status</dt>
          <dd>{validation.status}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Answer Characters</dt>
          <dd>{response.answer_chars}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Valid Citation IDs</dt>
          <dd className="break-words">
            {formatIdList(validation.valid_citation_ids)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Invalid Citation IDs</dt>
          <dd className="break-words">
            {formatIdList(validation.invalid_citation_ids)}
          </dd>
        </div>
        {response.prompt_token_count != null ? (
          <div>
            <dt className="text-slate-400">Prompt Token</dt>
            <dd>{response.prompt_token_count}</dd>
          </div>
        ) : null}
        {response.candidate_token_count != null ? (
          <div>
            <dt className="text-slate-400">Answer Token</dt>
            <dd>{response.candidate_token_count}</dd>
          </div>
        ) : null}
        {response.total_token_count != null ? (
          <div>
            <dt className="text-slate-400">Total Token</dt>
            <dd>{response.total_token_count}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

export function AdminRuleRagChat() {
  const textareaId = useId();
  const { input, setInput, textareaHandlers } = useChatTextareaState();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, errorText]);

  const clearConversation = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setErrorText(null);
    setErrorRequestId(null);
    setLoading(false);
  };

  const onSend = async () => {
    const text = input.trim();
    if (!text || loading) {
      return;
    }
    if (text.length > MAX_QUERY_LENGTH) {
      setErrorText("질문 내용을 확인해주세요.");
      setErrorRequestId(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      text,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setErrorText(null);
    setErrorRequestId(null);

    const payload: RAGChatRequest = {
      ...FIXED_REQUEST,
      query: text,
    };

    try {
      const result = await requestRagChat(payload, {
        signal: controller.signal,
      });

      if (!result.ok) {
        if (result.error.kind === "aborted") {
          return;
        }
        const message = mapUserFacingError(result.error.code);
        setErrorText(message);
        setErrorRequestId(result.error.requestId);
        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: "error",
            text: message,
            createdAt: new Date().toISOString(),
            requestId: result.error.requestId,
          },
        ]);
        return;
      }

      const response = result.data;
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: "assistant",
          text: response.answer_text,
          createdAt: new Date().toISOString(),
          response,
        },
      ]);
    } catch {
      const message =
        "답변을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.";
      setErrorText(message);
      setErrorRequestId(null);
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: "error",
          text: message,
          createdAt: new Date().toISOString(),
          requestId: null,
        },
      ]);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 pb-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={clearConversation}
              disabled={loading || messages.length === 0}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
            >
              대화 지우기
            </button>
          </div>

          {messages.length === 0 && !loading ? (
            <div className="rounded-3xl border border-dashed border-slate-200/80 bg-white/70 px-5 py-8 shadow-inner backdrop-blur-sm">
              <p className="text-center text-base font-medium text-slate-700">
                빠른 검증 질문
              </p>
              <p className="mt-2 text-center text-sm text-slate-500">
                버튼을 누르면 입력창에만 채워집니다. 자동 전송하지 않습니다.
              </p>
              <ul className="mt-5 space-y-2">
                {EXAMPLE_QUESTIONS.map((question) => (
                  <li key={question}>
                    <button
                      type="button"
                      className="w-full break-words rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-700 shadow-sm transition hover:border-teal-300 hover:bg-teal-50/50"
                      onClick={() =>
                        setInput(question.slice(0, MAX_QUERY_LENGTH))
                      }
                    >
                      {question}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`overflow-hidden rounded-2xl px-4 py-3 shadow-sm ${
                  msg.role === "user"
                    ? "max-w-[95%] bg-slate-800 text-white sm:max-w-[85%]"
                    : msg.role === "error"
                      ? "max-w-[95%] border border-rose-200 bg-rose-50 text-rose-900 sm:max-w-[85%]"
                      : "w-full max-w-full border border-slate-200/80 bg-white text-slate-800"
                }`}
              >
                {msg.role === "user" ? (
                  <>
                    <p className="mb-1 text-[11px] font-medium text-slate-300">
                      질문
                    </p>
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                      {normalizeChatDisplayText(msg.text)}
                    </p>
                  </>
                ) : null}

                {msg.role === "error" ? (
                  <div role="alert">
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                      {msg.text}
                    </p>
                    {msg.requestId ? (
                      <p className="mt-2 text-xs text-rose-700">
                        문의 번호: {msg.requestId}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {msg.role === "assistant" ? (
                  <>
                    <p className="mb-2 text-[11px] font-medium text-slate-500">
                      AI 답변
                    </p>
                    <CitationStatusBanner response={msg.response} />
                    <AnswerWithCitations answerText={msg.text} />
                    <SearchResultsPanel response={msg.response} />
                    <RagVerificationPanel response={msg.response} />
                    <p className="mt-3 break-all text-[11px] text-slate-400">
                      문의 번호: {msg.response.request_id}
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          ))}

          {loading ? (
            <div
              className="flex justify-start"
              aria-live="polite"
              aria-busy="true"
            >
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                행정규칙을 검색하고 답변을 생성하고 있습니다.
              </div>
            </div>
          ) : null}

          {errorText && !loading ? (
            <p className="text-center text-xs text-rose-600" role="alert">
              {errorText}
              {errorRequestId ? (
                <span className="mt-1 block text-rose-500">
                  문의 번호: {errorRequestId}
                </span>
              ) : null}
            </p>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-slate-200/80 bg-white/90 px-3 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-7xl gap-2">
          <label htmlFor={textareaId} className="sr-only">
            행정규칙 질문 입력
          </label>
          <textarea
            id={textareaId}
            aria-label="행정규칙 질문 입력"
            value={input}
            {...textareaHandlers}
            maxLength={MAX_QUERY_LENGTH}
            rows={2}
            placeholder="행정규칙 검증용 질문을 입력하세요"
            className="min-h-[52px] min-w-0 flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none ring-teal-600/30 placeholder:text-slate-400 focus:ring-2"
            disabled={loading}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void onSend();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={loading || input.trim() === ""}
            className="self-end rounded-2xl bg-[#1e2f4f] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#162438] disabled:pointer-events-none disabled:opacity-40"
          >
            {loading ? "검색 중..." : "질문하기"}
          </button>
        </div>
        <p className="mx-auto mt-1.5 max-w-7xl text-right text-[11px] text-slate-400">
          {input.length}/{MAX_QUERY_LENGTH}
        </p>
      </div>
    </div>
  );
}
