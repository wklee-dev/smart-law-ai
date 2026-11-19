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

function lawSourcePopupUrl(s: ChatSource, jump?: string | null): string {
  const q = new URLSearchParams();
  const name = s.law_name_kr?.trim() ?? "";
  if (name) q.set("name", name);
  if (s.id) q.set("chunkId", String(s.id));
  q.set("embed", "1");
  const j = jump?.trim();
  if (j) q.set("jump", j);
  return `/law-source-info?${q.toString()}`;
}

function openLawSourceInPopup(s: ChatSource, jump?: string | null): void {
  const url = lawSourcePopupUrl(s, jump);
  window.open(
    url,
    `law-source-${s.law_id ?? s.id}`,
    "popup=yes,width=720,height=680,noopener,noreferrer,scrollbars=yes,resizable=yes",
  );
}

const CITATION_TAIL_TOKEN =
  /제\s*\d+조(?:의\s*\d+)?|제\s*\d+\s*항|\d+\s*항|제\s*\d+\s*호|\d+\s*호|[가-하]목|목[가-하]|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/g;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findExcerptCitationSpan(
  excerpt: string,
  lawName: string | null | undefined,
  sourceTitle: string | null | undefined,
): { start: number; end: number; jump: string } | null {
  const law = lawName?.trim();
  const title = sourceTitle?.trim().replace(/\.+\s*$/, "") ?? "";
  if (!law || !title || !excerpt.trim()) return null;

  const artMatch = title.match(/^(제\s*\d+조(?:의\s*\d+)?)/);
  if (!artMatch) return null;
  const articleNorm = artMatch[1].replace(/\s+/g, " ").trim();
  const tail = title.slice(artMatch[0].length).trim();

  const lawEsc = escapeRegExp(law);
  const artFlex = escapeRegExp(articleNorm).replace(/ /g, "\\s+");
  const headRe = new RegExp(`${lawEsc}\\s+${artFlex}`);
  const headM = headRe.exec(excerpt);
  if (!headM || headM.index === undefined) return null;
  const start = headM.index;
  const afterHead = start + headM[0].length;

  let end = afterHead;

  if (!tail) {
    const slice = excerpt.slice(start);
    const nl = slice.indexOf("\n");
    const dup = slice.search(/\s제\s*\d+조\s*\(/);
    let cut = slice.length;
    if (nl >= 0) cut = Math.min(cut, nl);
    if (dup >= 0) cut = Math.min(cut, dup);
    const headPart = slice.slice(0, cut);
    const dotSp = headPart.search(/\.\s+/);
    if (dotSp >= 0 && dotSp < 160) {
      end = start + dotSp;
    } else {
      end = start + cut;
    }
  } else {
    const isStructuralTail =
      /항|호|목|[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]/.test(tail);
    const rest = excerpt.slice(afterHead);

    if (isStructuralTail) {
      const tailFlex = escapeRegExp(tail.replace(/\s+/g, " ").trim()).replace(
        / /g,
        "\\s*",
      );
      const re = new RegExp(`^\\s*(.+?)?\\s*${tailFlex}(?=\\.|\\s|$|\\n)`);
      const m = re.exec(rest);
      if (m) {
        end = afterHead + m[0].length;
      } else {
        const re2 = new RegExp(`^\\s*${tailFlex}(?=\\.|\\s|$|\\n)`);
        const m2 = re2.exec(rest);
        if (m2) end = afterHead + m2[0].length;
        else end = afterHead;
      }
    } else {
      const tailPhrase = tail
        .split(/\s+/)
        .filter(Boolean)
        .map(escapeRegExp)
        .join("\\s+");
      const re = new RegExp(`^\\s*${tailPhrase}`);
      const m = re.exec(rest);
      if (m) end = afterHead + m[0].length;
      else return null;
    }
  }

  if (end <= start) return null;

  const linked = excerpt.slice(start, end);
  let jump = articleNorm;
  let lastTok: RegExpExecArray | null = null;
  const reTok = new RegExp(CITATION_TAIL_TOKEN.source, "g");
  let tm: RegExpExecArray | null;
  while ((tm = reTok.exec(linked)) !== null) lastTok = tm;
  if (lastTok) jump = lastTok[0].trim();

  return { start, end, jump };
}

const EXCERPT_LINK_CLASS =
  "font-medium text-blue-700 underline decoration-blue-300/80 underline-offset-2 hover:text-blue-900 hover:decoration-blue-600/90";

function ExcerptWithCitationLink(props: {
  source: ChatSource;
  excerpt: string;
  lawName: string;
  density?: "compact" | "panel";
}) {
  const { source, excerpt, lawName, density = "compact" } = props;
  const excerptN = normalizeChatDisplayText(excerpt);
  const lawN = normalizeChatDisplayText(lawName);
  const titleN = normalizeChatDisplayText(source.source_title ?? "");
  const span = findExcerptCitationSpan(excerptN, lawN, titleN);

  const wrapClass =
    density === "panel"
      ? "whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700"
      : "mt-2 line-clamp-5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600";

  if (!span) {
    return (
      <p
        className={
          density === "panel"
            ? `${wrapClass} max-h-56 overflow-y-auto pr-1`
            : wrapClass
        }
      >
        {excerptN}
      </p>
    );
  }

  const { start, end, jump } = span;
  const before = excerptN.slice(0, start);
  const linked = excerptN.slice(start, end);
  const after = excerptN.slice(end);
  const url = lawSourcePopupUrl(source, jump);

  return (
    <p
      className={
        density === "panel"
          ? `${wrapClass} max-h-56 overflow-y-auto pr-1`
          : wrapClass
      }
    >
      {before}
      <a
        href={url}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          openLawSourceInPopup(source, jump);
        }}
        className={EXCERPT_LINK_CLASS}
        title="원문·조문에서 해당 위치로 이동"
      >
        {linked}
      </a>
      {after}
    </p>
  );
}

function retrievalModeLabel(mode: string | undefined): string {
  switch (mode) {
    case "vector":
    case "langchain_vector":
      return "의미 검색";
    case "text_reranked":
      return "키워드·재정렬";
    case "text_fallback":
      return "키워드 검색";
    case "vector_relaxed":
      return "의미 검색(완화)";
    default:
      return "의미 검색";
  }
}

/** LangChain + Supabase 벡터 검색 (`/api/law-langchain-chat`) */
export default function LawLangchainChatPage() {
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
      const res = await fetch("/api/law-langchain-chat", {
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
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <header className="relative z-10 border-b border-slate-200/90 bg-white px-4 py-3 shadow-sm md:px-8">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-md shadow-emerald-500/25">
              <span className="text-lg font-bold text-white" aria-hidden>
                LC
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">
                LangChain 법령 채팅
              </h1>
              <p className="truncate text-xs text-slate-500">
                의미 기반 법령 검색 · 근거 문헌 표시
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
        <p className="mx-auto mt-2 w-full max-w-7xl border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500 md:text-xs">
          검색·생성 결과는 참고용이며{" "}
          <span className="text-amber-800/90">법률 자문을 대체하지 않습니다.</span>
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 pb-4">
            {messages.length === 0 && !loading ? (
              <div className="rounded-3xl border border-dashed border-emerald-200/80 bg-white/60 px-6 py-12 text-center shadow-inner backdrop-blur-sm">
                <p className="text-base font-medium text-slate-700">
                  법령 질의를 입력하면 검색된 근거와 함께 답변을 표시합니다.
                </p>
                <p className="mt-3 text-sm text-slate-500">
                  벡터 검색은{" "}
                  {lawSupabaseBackendLabel(supabaseIsLocal)}의 저장 청크를
                  사용합니다.
                </p>
              </div>
            ) : null}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 md:gap-3 ${
                  msg.role === "user"
                    ? "flex-row-reverse justify-end"
                    : "w-full flex-row"
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-xs font-bold shadow-sm ${
                    msg.role === "user"
                      ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white"
                      : msg.error
                        ? "bg-red-100 text-red-700"
                        : "bg-gradient-to-br from-teal-500 to-cyan-600 text-white"
                  }`}
                  aria-hidden
                >
                  {msg.role === "user" ? "나" : "AI"}
                </div>

                <div
                  className={`min-w-0 flex flex-col ${
                    msg.role === "user"
                      ? "max-w-[min(100%,28rem)] items-end"
                      : "w-full min-w-0 flex-1 items-stretch"
                  }`}
                >
                  <div
                    className={`text-[15px] leading-relaxed shadow-md ${
                      msg.role === "user"
                        ? "rounded-3xl rounded-tr-md px-4 py-3 text-white shadow-emerald-900/10 bg-gradient-to-br from-emerald-600 to-teal-600"
                        : msg.error
                          ? "rounded-2xl border border-red-200/80 bg-red-50 px-4 py-3 text-red-900"
                          : "rounded-2xl border border-slate-200 bg-white px-4 py-4 text-slate-800 shadow-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">
                      {normalizeChatDisplayText(msg.content)}
                    </p>

                    {msg.role === "assistant" &&
                    !msg.error &&
                    msg.sources &&
                    msg.sources.length > 0 ? (
                      <div className="mt-5 border-t border-slate-200 pt-4">
                        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-100/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="text-base font-semibold text-slate-900">
                            법령 근거·검색 결과
                          </h3>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 tabular-nums">
                              {retrievalModeLabel(msg.retrievalMode)}
                            </span>
                            <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 tabular-nums">
                              {msg.sources.length}건
                            </span>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          {msg.sources.map((s, rank) => {
                            const lawLabel = normalizeChatDisplayText(
                              s.law_name_kr?.trim() ?? "",
                            );

                            return (
                              <article
                                key={s.id}
                                className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"
                              >
                                <div className="flex items-start gap-3 bg-slate-50/90 px-3 py-3">
                                  <span
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-200 text-center text-xs font-bold tabular-nums text-slate-700"
                                    aria-hidden
                                  >
                                    {rank + 1}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <ExcerptWithCitationLink
                                      source={s}
                                      excerpt={s.excerpt}
                                      lawName={lawLabel}
                                      density="panel"
                                    />
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            {loading ? (
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-xs font-bold text-white shadow-sm">
                  AI
                </div>
                <div className="flex items-center gap-1 rounded-3xl rounded-tl-md border border-slate-100 bg-white/95 px-4 py-3 shadow-md backdrop-blur-sm">
                  <span className="sr-only">응답 생성 중</span>
                  <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" />
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-3 md:px-8">
          <form
            className="mx-auto flex w-full max-w-7xl items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="law-langchain-input" className="sr-only">
              질문 입력
            </label>
            <div className="relative min-w-0 flex-1">
              <textarea
                id="law-langchain-input"
                value={input}
                {...textareaHandlers}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="법령 질의를 입력하세요."
                disabled={loading}
                className="max-h-32 min-h-[48px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-900 shadow-inner outline-none transition placeholder:text-slate-400 focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
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
