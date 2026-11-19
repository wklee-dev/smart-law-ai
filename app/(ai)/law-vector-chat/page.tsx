"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeChatDisplayText } from "@/app/shared/chat-display-text";
import { useChatTextareaState } from "@/app/shared/use-chat-textarea-state";
import {
  lawSupabaseBackendLabel,
  useLawSupabaseConfig,
} from "@/app/shared/use-law-supabase-config";

type ChatSource = {
  id: number;
  source_title: string | null;
  source_label?: string | null;
  law_name_kr?: string | null;
  law_id?: string | null;
  similarity: number | null;
  excerpt: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  retrievalMode?: string;
  error?: boolean;
};

function formatSourceHeading(s: ChatSource): string {
  const raw =
    s.source_label ||
    s.source_title ||
    s.law_name_kr?.trim() ||
    `청크 #${s.id}`;
  return normalizeChatDisplayText(raw);
}

export default function LawVectorChatPage() {
  const { supabaseIsLocal } = useLawSupabaseConfig();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const { input, setInput, textareaHandlers } = useChatTextareaState();
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const history = messages
      .filter((m) => !m.error)
      .slice(-24)
      .map((m) => ({ role: m.role, content: m.content }));

    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await fetch("/api/law-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        answer?: string;
        sources?: ChatSource[];
        retrievalMode?: string;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: data.error || "요청에 실패했습니다.",
            error: true,
          },
        ]);
        return;
      }

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: data.answer ?? "",
          sources: data.sources,
          retrievalMode: data.retrievalMode,
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "네트워크 오류가 발생했습니다.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-slate-100 via-slate-50 to-indigo-50/40">
      {/* 상단 바 */}
      <header className="relative z-10 border-b border-white/60 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-md md:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-500/25">
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.75}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">
                법령 벡터 채팅
              </h1>
              <p className="truncate text-xs text-slate-500">
                임베딩 전체 검색 · 답변에 출처 표시
                <span className="mx-1 text-slate-300" aria-hidden>
                  ·
                </span>
                <span className="text-slate-500">
                  {lawSupabaseBackendLabel(supabaseIsLocal)}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMessages([])}
            disabled={loading || messages.length === 0}
            className="shrink-0 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
          >
            대화 초기화
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500 md:text-xs">
          벡터 검색은 저장된 청크 전체를 대상으로 하며, 답변은 유사도가 높은 일부만 근거로 합니다.{" "}
          <span className="text-amber-800/90">법률 자문이 아닌 참고용입니다.</span>
        </p>
      </header>

      {/* 메시지 영역 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-4">
            {messages.length === 0 && !loading ? (
              <div className="rounded-3xl border border-dashed border-slate-200/80 bg-white/60 px-6 py-12 text-center shadow-inner backdrop-blur-sm">
                <p className="text-base font-medium text-slate-700">
                  법령 내용에 대해 질문해 보세요
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  예: &quot;관세의 과세물품은?&quot;
                </p>
                <p className="mx-auto mt-6 max-w-md text-xs text-slate-400">
                  {lawSupabaseBackendLabel(supabaseIsLocal)}에{" "}
                  <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">
                    match_law_chunks
                  </code>{" "}
                  가 필요합니다 —{" "}
                  <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">
                    sql/match_law_chunks.sql
                  </code>
                </p>
              </div>
            ) : null}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 md:gap-3 ${
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                }`}
              >
                {/* 아바타 */}
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-xs font-bold shadow-sm ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-indigo-500 to-blue-600 text-white"
                      : msg.error
                        ? "bg-red-100 text-red-700"
                        : "bg-gradient-to-br from-violet-500 to-purple-600 text-white"
                  }`}
                  aria-hidden
                >
                  {msg.role === "user" ? "나" : "AI"}
                </div>

                <div
                  className={`min-w-0 max-w-[calc(100%-3rem)] md:max-w-[min(100%,32rem)] ${
                    msg.role === "user" ? "items-end" : "items-start"
                  } flex flex-col`}
                >
                  <div
                    className={`rounded-3xl px-4 py-3 text-[15px] leading-relaxed shadow-md ${
                      msg.role === "user"
                        ? "rounded-tr-md bg-gradient-to-br from-indigo-600 to-blue-600 text-white"
                        : msg.error
                          ? "border border-red-200/80 bg-red-50 text-red-900"
                          : "rounded-tl-md border border-slate-100/90 bg-white/95 text-slate-800 shadow-slate-200/50 backdrop-blur-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">
                      {normalizeChatDisplayText(msg.content)}
                    </p>

                    {/* 답변 직후: 법령 출처 (항상 표시) */}
                    {msg.role === "assistant" &&
                    !msg.error &&
                    msg.sources &&
                    msg.sources.length > 0 ? (
                      <div className="mt-4 border-t border-slate-100 pt-3">
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <span className="inline-block h-1 w-1 rounded-full bg-violet-500" />
                          참고 법령 출처
                          <span className="font-normal normal-case text-slate-400">
                            (
                            {msg.retrievalMode === "text_reranked"
                              ? "키워드 후보 · 임베딩 재정렬"
                              : msg.retrievalMode === "text_fallback"
                                ? "키워드 검색"
                                : msg.retrievalMode === "vector_relaxed"
                                  ? "벡터 검색 · 상위만(유사도 필터 완화)"
                                  : "벡터 검색"}
                            )
                          </span>
                        </p>
                        <ul className="flex flex-col gap-2">
                          {msg.sources.map((s) => (
                            <li
                              key={s.id}
                              className="rounded-2xl border border-slate-100 bg-slate-50/90 px-3 py-2.5 text-left"
                            >
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <span className="text-sm font-medium text-slate-800">
                                  {formatSourceHeading(s)}
                                </span>
                                {s.similarity != null ? (
                                  <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-violet-800">
                                    유사도 {(s.similarity * 100).toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400">
                                    유사도 —
                                  </span>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                        <details className="group mt-3">
                          <summary className="cursor-pointer list-none text-xs font-medium text-indigo-600 transition hover:text-indigo-800 [&::-webkit-details-marker]:hidden">
                            <span className="inline-flex items-center gap-1">
                              청크 원문 보기
                              <svg
                                className="h-3.5 w-3.5 transition group-open:rotate-180"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </span>
                          </summary>
                          <ul className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                            {msg.sources.map((s) => (
                              <li
                                key={`ex-${s.id}`}
                                className="rounded-xl bg-white/80 p-2.5 text-xs text-slate-600 ring-1 ring-slate-100"
                              >
                                <div className="font-medium text-slate-700">
                                  {formatSourceHeading(s)}
                                </div>
                                <p className="mt-1 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed text-slate-600">
                                  {normalizeChatDisplayText(s.excerpt)}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            {loading ? (
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-xs font-bold text-white shadow-sm">
                  AI
                </div>
                <div className="flex items-center gap-1 rounded-3xl rounded-tl-md border border-slate-100 bg-white/95 px-4 py-3 shadow-md backdrop-blur-sm">
                  <span className="sr-only">응답 생성 중</span>
                  <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400" />
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* 입력창 */}
        <div className="border-t border-slate-200/80 bg-white/90 px-3 py-3 backdrop-blur-md md:px-6">
          <form
            className="mx-auto flex max-w-3xl items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="law-chat-input" className="sr-only">
              질문 입력
            </label>
            <div className="relative min-w-0 flex-1">
              <textarea
                id="law-chat-input"
                value={input}
                {...textareaHandlers}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="법령 내용에 대해 질문하세요…"
                disabled={loading}
                className="max-h-32 min-h-[48px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1e2f4f] text-white shadow-lg shadow-[#1e2f4f]/30 transition hover:bg-[#162438] disabled:opacity-45"
              aria-label="보내기"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.446-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
