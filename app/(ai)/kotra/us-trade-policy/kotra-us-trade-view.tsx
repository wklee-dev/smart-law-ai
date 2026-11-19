"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasSecondaryButton,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  CasResetButton,
  CasSearchButton,
} from "@/app/components/search-action-buttons";
import { ClipPaginationBar } from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import { fillTodayIfEmpty } from "@/app/lib/date-input-utils";
import type {
  KotraUsTradeDetail,
  KotraUsTradeListRow,
} from "@/app/lib/kotra-us-trade-shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;
const PAGE_SIZES = [10, 20, 30, 50];
const SOURCE_LIST_URL =
  "https://dream.kotra.or.kr/kotranews/cms/com/index.do?MENU_ID=1580";
const CONTROL_CLASS =
  "h-9 rounded-md border border-[#d8dee6] bg-white px-2 text-[13px] text-[#333] shadow-sm focus:border-[#1e2f4f] focus:outline-none focus:ring-1 focus:ring-[#1e2f4f]/18";

function str(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function visiblePageBlock(currentPage: number, totalPages: number): number[] {
  const tp = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(Math.max(1, Math.floor(currentPage)), tp);
  const start =
    Math.floor((cur - 1) / PAGE_NUMBER_WINDOW) * PAGE_NUMBER_WINDOW + 1;
  const end = Math.min(start + PAGE_NUMBER_WINDOW - 1, tp);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex min-w-0 gap-2 text-[12px]">
      <span className="w-20 shrink-0 font-semibold text-slate-600">{label}</span>
      <span className="min-w-0 break-words text-slate-800">{str(value)}</span>
    </div>
  );
}

type ViewMode = "list" | "detail";

export function KotraUsTradeView() {
  const [draft, setDraft] = useState({
    keyword: "",
    dateFrom: "",
    dateTo: "",
  });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<KotraUsTradeListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KotraUsTradeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const listUrl = useMemo(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("sort", "published_date");
    u.set("dir", "desc");
    if (applied.keyword.trim()) u.set("keyword", applied.keyword.trim());
    if (applied.dateFrom.trim()) u.set("dateFrom", applied.dateFrom.trim());
    if (applied.dateTo.trim()) u.set("dateTo", applied.dateTo.trim());
    return `/api/kotra-us-trade/query?${u}`;
  }, [page, pageSize, applied]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: KotraUsTradeListRow[];
        total: number;
        ready?: boolean;
      }>(listUrl);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setReady(data.ready !== false);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "목록 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = useCallback(async (articleId: string) => {
    setSelectedId(articleId);
    setViewMode("detail");
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await fetchJson<{ post: KotraUsTradeDetail }>(
        `/api/kotra-us-trade/detail?articleId=${encodeURIComponent(articleId)}`,
      );
      setDetail(data.post);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상세 조회 실패");
      setViewMode("list");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function search() {
    setApplied(draft);
    setPage(1);
  }

  function resetForm() {
    const empty = { keyword: "", dateFrom: "", dateTo: "" };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
  }

  const totalPg = Math.max(1, Math.ceil(total / pageSize) || 1);
  const curPageSafe = Math.min(page, totalPg);
  const block = useMemo(
    () => visiblePageBlock(curPageSafe, totalPg),
    [curPageSafe, totalPg],
  );

  return (
    <CasPageShell>
      <CasPageHeader title="미국통상정책" />
      <p className="text-[12px] text-slate-600">
        KOTRA · 해외시장뉴스 ·{" "}
        <a
          href={SOURCE_LIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1e2f4f] underline"
        >
          미국통상정책 (원문)
        </a>
        {" · "}
        <code className="rounded bg-slate-100 px-1 text-[11px]">
          kotra_us_trade_articles
        </code>
      </p>

      {viewMode === "list" ? (
        <CasCard title="미국통상정책" className="flex min-w-0 flex-col">
          <div className="mb-3 space-y-2 rounded-md border border-[#e5e9ef] bg-[#f7f9fb] p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-[12px] text-[#666]">
                <span className="mb-1 block">게시일</span>
                <span className="flex items-center gap-1">
                  <input
                    type="date"
                    className={`${CONTROL_CLASS} w-[10.5rem]`}
                    value={draft.dateFrom}
                    onFocus={() =>
                      fillTodayIfEmpty(draft.dateFrom, (v) =>
                        setDraft((p) => ({ ...p, dateFrom: v })),
                      )
                    }
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, dateFrom: e.target.value }))
                    }
                  />
                  <span className="text-slate-400">~</span>
                  <input
                    type="date"
                    className={`${CONTROL_CLASS} w-[10.5rem]`}
                    value={draft.dateTo}
                    onFocus={() =>
                      fillTodayIfEmpty(draft.dateTo, (v) =>
                        setDraft((p) => ({ ...p, dateTo: v })),
                      )
                    }
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, dateTo: e.target.value }))
                    }
                  />
                </span>
              </label>
              <label className="min-w-[14rem] flex-1 text-[12px] text-[#666]">
                <span className="mb-1 block">검색</span>
                <input
                  className={`${CONTROL_CLASS} w-full`}
                  value={draft.keyword}
                  placeholder="검색어를 입력하세요"
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, keyword: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") search();
                  }}
                />
              </label>
              <CasResetButton
                type="button"
                disabled={loading}
                onClick={resetForm}
              />
              <CasSearchButton
                type="button"
                disabled={loading}
                onClick={search}
              />
            </div>
          </div>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] text-slate-700">
              총{" "}
              <strong className="text-[#1e5bb8]">
                {total.toLocaleString()}
              </strong>
              건
            </p>
            <select
              className={CONTROL_CLASS}
              value={pageSize}
              disabled={loading}
              aria-label="페이지당 건수"
              onChange={(e) => {
                setPage(1);
                setPageSize(Number(e.target.value) || 10);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}건
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {!ready ? (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              아직 수집 데이터가 없습니다. `kotra_us_trade_articles` 테이블이
              생성되면 목록이 표시됩니다. (가이드:{" "}
              <code className="rounded bg-white px-1">
                D:\Manus\KOTRA_미국통상정책
              </code>
              )
            </p>
          ) : null}

          <div className="divide-y divide-[#e5e9ef] border-t border-[#e5e9ef]">
            {loading ? (
              <p className="py-10 text-center text-sm text-slate-500">
                조회 중…
              </p>
            ) : rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                검색 결과가 없습니다.
              </p>
            ) : (
              rows.map((r) => {
                const sel = selectedId === r.articleId;
                const meta = [r.office, r.author, r.publishedDate]
                  .filter(Boolean)
                  .join(" | ");
                return (
                  <button
                    key={r.articleId}
                    type="button"
                    className={`flex w-full gap-3 px-2 py-3 text-left hover:bg-[#f8fafc] ${
                      sel ? "bg-[#1e2f4f]/5" : ""
                    }`}
                    onClick={() => void openDetail(r.articleId)}
                  >
                    <span className="w-12 shrink-0 pt-1 text-center text-[13px] tabular-nums text-slate-500">
                      {r.listNumber ?? "—"}
                    </span>
                    <span className="flex h-[72px] w-[96px] shrink-0 items-center justify-center overflow-hidden rounded border border-[#e5e9ef] bg-[#eef2f6] text-[11px] text-slate-400">
                      미국
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-[#1e2f4f]">
                        {str(r.title)}
                      </span>
                      {r.summary ? (
                        <span className="mt-1 line-clamp-2 block text-[12px] leading-relaxed text-slate-600">
                          {r.summary}
                        </span>
                      ) : null}
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="rounded bg-[#e0e7ff] px-1.5 py-0.5 font-medium text-[#3730a3]">
                          미국통상정책
                        </span>
                        <span>{meta}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <ClipPaginationBar
            curPageSafe={curPageSafe}
            totalPg={totalPg}
            loading={loading}
            block={block}
            onPage={setPage}
          />
        </CasCard>
      ) : (
        <CasCard
          title="미국통상정책 상세"
          className="flex min-w-0 flex-col"
          action={
            <CasSecondaryButton
              type="button"
              onClick={() => {
                setViewMode("list");
                setDetail(null);
              }}
            >
              목록
            </CasSecondaryButton>
          }
        >
          {detailLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              불러오는 중…
            </p>
          ) : detail ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailRow label="무역관" value={detail.office} />
                <DetailRow label="작성자" value={detail.author} />
                <DetailRow label="게시일" value={detail.publishedDate} />
                <DetailRow
                  label="첨부"
                  value={`${detail.attachmentCount}건`}
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold text-slate-600">
                  제목
                </p>
                <p className="text-[15px] font-semibold text-[#1e2f4f]">
                  {str(detail.title)}
                </p>
              </div>
              {detail.sourceUrl ? (
                <p className="text-[12px]">
                  <a
                    href={detail.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1e2f4f] underline"
                  >
                    원문 바로가기
                  </a>
                </p>
              ) : null}
              <div>
                <p className="mb-1 text-[11px] font-semibold text-slate-600">
                  본문
                </p>
                {detail.contentHtml.trim() ? (
                  <div
                    className="prose prose-sm max-w-none rounded-md border border-stone-200 bg-white p-3 text-[13px] leading-relaxed text-slate-800 [&_img]:max-w-full"
                    dangerouslySetInnerHTML={{ __html: detail.contentHtml }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap rounded-md border border-stone-200 bg-white p-3 text-[13px] leading-relaxed text-slate-800">
                    {detail.contentText || "본문이 없습니다."}
                  </pre>
                )}
              </div>
              {detail.attachments.length > 0 ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold text-slate-600">
                    첨부파일
                  </p>
                  <ul className="space-y-1.5">
                    {detail.attachments.map((a) => (
                      <li key={a.fileId} className="text-[12px]">
                        {a.fileApiUrl ? (
                          <a
                            href={a.fileApiUrl}
                            className="font-medium text-[#1e2f4f] underline"
                          >
                            {a.fileName}
                          </a>
                        ) : (
                          <span className="text-slate-700">
                            {a.fileName}
                            <span className="ml-2 text-amber-700">
                              (로컬 파일 없음
                              {a.status ? ` · ${a.status}` : ""})
                            </span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              상세 정보가 없습니다.
            </p>
          )}
        </CasCard>
      )}
    </CasPageShell>
  );
}
