"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type SourceDetailOk = {
  ok: true;
  chunkId: number;
  source_pk: number;
  law_name: string | null;
  document_type: string | null;
  article_no: string | null;
  title: string | null;
  header: string | null;
  full_text: string;
  resolved_from_admin_rule: boolean;
};

type SourceDetailErr = {
  ok: false;
  error?: string;
};

function AdminRuleSourceInfoBody() {
  const searchParams = useSearchParams();
  const name = searchParams.get("name")?.trim() ?? "";
  const chunkIdRaw = searchParams.get("chunkId")?.trim() ?? "";
  const chunkId = chunkIdRaw ? Number(chunkIdRaw) : NaN;
  const hasChunk = Number.isFinite(chunkId) && chunkId > 0;

  const [detail, setDetail] = useState<SourceDetailOk | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(hasChunk);

  useEffect(() => {
    if (!hasChunk) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadErr(null);
        const res = await fetch(
          `/api/rag/admin-rule-source-detail?chunkId=${encodeURIComponent(String(chunkId))}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as SourceDetailOk | SourceDetailErr;
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setDetail(null);
          setLoadErr(
            !data.ok && "error" in data
              ? data.error ?? "조회에 실패했습니다."
              : "조회에 실패했습니다.",
          );
          return;
        }
        setDetail(data);
      } catch {
        if (!cancelled) {
          setDetail(null);
          setLoadErr("네트워크 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasChunk, chunkId]);

  const heading =
    detail?.law_name?.trim() || name || "행정규칙 출처";

  const articleHeading = [
    detail?.article_no,
    detail?.title || detail?.header,
  ]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .trim();

  const bodyLines = useMemo(() => {
    const text = detail?.full_text?.trim();
    if (!text) return [];
    return text.split("\n").map((line) => line.replace(/\r$/, ""));
  }, [detail?.full_text]);

  return (
    <div className="flex max-h-[min(90vh,820px)] flex-col bg-gradient-to-b from-white to-slate-50 text-slate-800">
      <div className="shrink-0 border-b border-slate-200/80 bg-white/95 px-5 py-4 backdrop-blur-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          행정규칙명
        </p>
        <h1 className="mt-1 text-lg font-semibold leading-snug text-slate-900">
          {heading}
        </h1>
        {detail?.document_type ? (
          <p className="mt-1 text-xs text-slate-500">{detail.document_type}</p>
        ) : null}
        {articleHeading ? (
          <p className="mt-3 rounded-lg bg-slate-100/90 px-3 py-2 text-sm font-medium text-slate-800">
            {articleHeading}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <p className="text-sm text-slate-500">조문을 불러오는 중…</p>
        ) : loadErr ? (
          <p className="text-sm text-red-700">{loadErr}</p>
        ) : detail?.full_text ? (
          <>
            <p className="mb-2 text-[11px] text-slate-500">
              {detail.resolved_from_admin_rule
                ? "저장된 행정규칙 조문 전체"
                : "검색 청크에 포함된 본문"}
            </p>
            <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-900 shadow-sm">
              <div className="font-sans">
                {bodyLines.map((line, index) => (
                  <div key={index} className="whitespace-pre-wrap">
                    {line || "\u00a0"}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : !hasChunk ? (
          <p className="text-sm text-slate-500">
            표시할 행정규칙 정보가 없습니다.
          </p>
        ) : (
          <p className="text-sm text-slate-500">표시할 본문이 없습니다.</p>
        )}
      </div>
    </div>
  );
}

/** 행정규칙 RAG 출처 팝업 (`?embed=1` 권장) */
export default function AdminRuleSourceInfoPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-500" aria-hidden>
          불러오는 중…
        </div>
      }
    >
      <AdminRuleSourceInfoBody />
    </Suspense>
  );
}
