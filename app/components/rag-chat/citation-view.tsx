"use client";

import type { RAGSource } from "@/types/rag-api";
import { normalizeChatDisplayText } from "@/app/shared/chat-display-text";

const CITATION_PATTERN = /\[S([1-9]\d*)\]/g;

export function formatSourceLabel(source: RAGSource): string {
  const parts = [
    source.citation_id,
    source.law_name,
    source.article_no,
    source.title,
  ].filter((part): part is string => Boolean(part && String(part).trim()));
  return normalizeChatDisplayText(parts.join(" · "));
}

/**
 * 답변 텍스트의 [S1] 형식을 시각적으로 강조할 세그먼트로 분리한다.
 */
export function splitAnswerWithCitations(
  answerText: string,
): Array<{ type: "text" | "citation"; value: string }> {
  const text = normalizeChatDisplayText(answerText);
  const segments: Array<{ type: "text" | "citation"; value: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(CITATION_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({
        type: "text",
        value: text.slice(lastIndex, index),
      });
    }
    segments.push({
      type: "citation",
      value: match[0],
    });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      value: text.slice(lastIndex),
    });
  }

  if (segments.length === 0) {
    segments.push({ type: "text", value: text });
  }

  return segments;
}

export function AnswerWithCitations({
  answerText,
}: {
  answerText: string;
}) {
  const segments = splitAnswerWithCitations(answerText);

  return (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
      {segments.map((segment, index) =>
        segment.type === "citation" ? (
          <span
            key={`${segment.value}-${index}`}
            className="mx-0.5 inline-flex rounded-md bg-teal-50 px-1.5 py-0.5 text-xs font-semibold text-teal-800 ring-1 ring-teal-200/80"
          >
            {segment.value}
          </span>
        ) : (
          <span key={`text-${index}`}>{segment.value}</span>
        ),
      )}
    </p>
  );
}

export function CitedSourcesPanel({
  sources,
  validationStatus,
}: {
  sources: RAGSource[];
  validationStatus?: string | null;
}) {
  if (sources.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-500">
        연결된 출처가 없습니다
        {validationStatus ? ` · ${validationStatus}` : ""}.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        출처
        {validationStatus ? (
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 font-medium normal-case text-slate-600">
            {validationStatus}
          </span>
        ) : null}
      </p>
      <ul className="space-y-2">
        {sources.map((source) => (
          <li
            key={`${source.citation_id}-${source.id}`}
            className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-teal-700 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {source.citation_id}
              </span>
              <span className="font-medium text-slate-800">
                {normalizeChatDisplayText(source.law_name)}
              </span>
              {source.document_type ? (
                <span className="text-slate-400">{source.document_type}</span>
              ) : null}
            </div>
            <p className="mt-1 text-slate-600">
              {[source.article_no, source.title]
                .filter(Boolean)
                .map((part) => normalizeChatDisplayText(String(part)))
                .join(" · ") || "제목 없음"}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              점수 {source.ranking_score.toFixed(4)}
              {source.citation_count > 1
                ? ` · 인용 ${source.citation_count}회`
                : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
