"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

type SourceDetailOk = {
  ok: true;
  chunkId: number;
  law_name_kr: string | null;
  law_id: string | null;
  source_title: string | null;
  article_no: string | null;
  article_title: string | null;
  full_text: string;
  resolved_from_article: boolean;
};

type SourceDetailErr = {
  ok: false;
  error?: string;
};

function normalizeForJumpMatch(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

function LawSourceInfoBody() {
  const searchParams = useSearchParams();
  const name = searchParams.get("name")?.trim() ?? "";
  const chunkIdRaw = searchParams.get("chunkId")?.trim() ?? "";
  const chunkId = chunkIdRaw ? Number(chunkIdRaw) : NaN;
  const hasChunk = Number.isFinite(chunkId) && chunkId > 0;
  const jumpRaw = searchParams.get("jump")?.trim() ?? "";

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
          `/api/law-chat/source-detail?chunkId=${encodeURIComponent(String(chunkId))}`,
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

  const titleLawName =
    detail?.law_name_kr?.trim() || name || "";
  const heading = titleLawName || "법령 출처";

  const articleHeading =
    detail?.source_title?.trim() ||
    [detail?.article_no, detail?.article_title]
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean)
      .join(" ")
      .trim();

  const bodyLines = useMemo(() => {
    const t = detail?.full_text?.trim();
    if (!t) return [];
    return t.split("\n").map((line) => line.replace(/\r$/, ""));
  }, [detail?.full_text]);

  const jumpLineIndex = useMemo(() => {
    if (!jumpRaw || bodyLines.length === 0) return -1;
    const needle = normalizeForJumpMatch(jumpRaw);
    if (!needle) return -1;
    return bodyLines.findIndex((line) =>
      normalizeForJumpMatch(line).includes(needle),
    );
  }, [jumpRaw, bodyLines]);

  const jumpTargetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (jumpLineIndex < 0 || !jumpTargetRef.current) return;
    jumpTargetRef.current.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [jumpLineIndex, detail?.full_text]);

  return (
    <div className="flex max-h-[min(90vh,820px)] flex-col bg-gradient-to-b from-white to-slate-50 text-slate-800">
      <div className="shrink-0 border-b border-slate-200/80 bg-white/95 px-5 py-4 backdrop-blur-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          법령명
        </p>
        <h1 className="mt-1 text-lg font-semibold leading-snug text-slate-900">
          {heading}
        </h1>
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
              {detail.resolved_from_article
                ? "저장된 조문 전체"
                : "청크에 포함된 본문"}
            </p>
            <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-900 shadow-sm">
              <div className="font-sans">
                {bodyLines.map((line, i) => (
                  <div
                    key={i}
                    ref={i === jumpLineIndex ? jumpTargetRef : undefined}
                    className={
                      i === jumpLineIndex
                        ? "whitespace-pre-wrap scroll-mt-4 rounded-md bg-amber-50/90 px-1 py-0.5 ring-1 ring-amber-200/80"
                        : "whitespace-pre-wrap"
                    }
                  >
                    {line || "\u00a0"}
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : !hasChunk ? (
          <>
            {!name && !hasChunk ? (
              <p className="text-sm text-slate-500">
                표시할 법령 정보가 없습니다.
              </p>
            ) : (
              <p className="text-sm text-slate-500">
                출처 청크가 없어 본문을 불러오지 못했습니다. 채팅 목록에서 같은
                출처를 다시 열어 주세요.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">표시할 본문이 없습니다.</p>
        )}
      </div>
    </div>
  );
}

/** LangChain·채팅 출처에서 `window.open`으로 여는 법령·조문 팝업 (`?embed=1` 권장) */
export default function LawSourceInfoPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-500" aria-hidden>
          불러오는 중…
        </div>
      }
    >
      <LawSourceInfoBody />
    </Suspense>
  );
}
