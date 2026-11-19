"use client";

import { useEffect, useRef } from "react";
import {
  AnswerWithCitations,
  CitedSourcesPanel,
} from "@/app/components/rag-chat/citation-view";
import { normalizeChatDisplayText } from "@/app/shared/chat-display-text";
import { useChatTextareaState } from "@/app/shared/use-chat-textarea-state";
import { useRagChat } from "@/lib/rag/use-rag-chat";

export default function RagChatPage() {
  const {
    messages,
    loading,
    error,
    lastRequestId,
    streamingSupported,
    sendMessage,
    clearHistory,
    cancel,
  } = useRagChat({
    defaultRequest: {
      match_count: 10,
      candidate_multiplier: 3,
      max_results: 5,
      temperature: 0.2,
      max_output_tokens: 2048,
      document_category: "ADMIN_RULE",
      source_table: "admin_rule",
    },
  });

  const { input, setInput, textareaHandlers } = useChatTextareaState();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const onSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    await sendMessage(text);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-slate-100 via-slate-50 to-teal-50/30">
      <header className="relative z-10 border-b border-white/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-md md:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">
              관세 RAG 채팅
            </h1>
            <p className="truncate text-xs text-slate-500">
              Next.js Proxy → Python RAG · Citation 기반 답변
              {streamingSupported ? " · Streaming 가능" : " · Streaming 준비 중"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {loading ? (
              <button
                type="button"
                onClick={cancel}
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 shadow-sm"
              >
                취소
              </button>
            ) : null}
            <button
              type="button"
              onClick={clearHistory}
              disabled={loading || messages.length === 0}
              className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
            >
              대화 초기화
            </button>
          </div>
        </div>
        <p className="mx-auto mt-2 max-w-3xl border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500 md:text-xs">
          행정규칙(ADMIN_RULE) 검색 결과를 근거로 답변합니다.{" "}
          <span className="text-amber-800/90">법률 자문이 아닌 참고용입니다.</span>
          {lastRequestId ? (
            <span className="ml-2 text-slate-400">
              최근 request_id: {lastRequestId.slice(0, 8)}…
            </span>
          ) : null}
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-4">
            {messages.length === 0 && !loading ? (
              <div className="rounded-3xl border border-dashed border-slate-200/80 bg-white/60 px-6 py-12 text-center shadow-inner backdrop-blur-sm">
                <p className="text-base font-medium text-slate-700">
                  사후관리·용도 외 사용 등 관세 행정규칙을 질문해 보세요
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  예: &quot;사후관리 대상 물품의 용도 외 사용 승인은 어떻게
                  하나요?&quot;
                </p>
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
                  className={`max-w-[95%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-slate-800 text-white"
                      : msg.error
                        ? "border border-rose-200 bg-rose-50 text-rose-900"
                        : "border border-slate-200/80 bg-white text-slate-800"
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                      {normalizeChatDisplayText(msg.content)}
                    </p>
                  ) : msg.error ? (
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                      {normalizeChatDisplayText(msg.content)}
                      {msg.errorCode ? (
                        <span className="mt-1 block text-xs text-rose-600">
                          {msg.errorCode}
                        </span>
                      ) : null}
                    </p>
                  ) : (
                    <>
                      <AnswerWithCitations answerText={msg.content} />
                      <CitedSourcesPanel
                        sources={msg.citedSources ?? []}
                        validationStatus={msg.citationValidationStatus}
                      />
                      {msg.model ? (
                        <p className="mt-2 text-[11px] text-slate-400">
                          {msg.provider}/{msg.model}
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ))}

            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                  답변 생성 중…
                </div>
              </div>
            ) : null}

            {error && !loading ? (
              <p className="text-center text-xs text-rose-600">
                {error.message}
              </p>
            ) : null}

            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-slate-200/80 bg-white/90 px-3 py-3 backdrop-blur md:px-6">
          <div className="mx-auto flex max-w-3xl gap-2">
            <textarea
              value={input}
              {...textareaHandlers}
              rows={2}
              placeholder="관세·행정규칙 관련 질문을 입력하세요"
              className="min-h-[52px] flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none ring-teal-600/30 placeholder:text-slate-400 focus:ring-2"
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
              전송
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
