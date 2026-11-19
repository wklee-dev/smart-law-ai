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
import {
  ClipGridDateCell,
  ClipGridEmptyRow,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipPaginationBar,
  clipGridRowHoverClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import { formatFileSize } from "@/app/(ai)/kita/yestrade-content-panel";
import {
  KCTDI_TRADE_SEARCH_FIELDS,
  type KctdiTradeDetail,
  type KctdiTradeListRow,
  type KctdiTradeSearchField,
} from "@/app/lib/kctdi-trade-shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;
const SOURCE_LIST_URL = "https://www.kctdi.or.kr/kctdi/research/research11.do";
const PAGE_SIZES = [10, 20, 30, 50, 100];
const NEW_DAYS = 7;
const INPUT_CLASS =
  "h-8 rounded-md border border-[#d8dee6] bg-white px-2 text-[12px] text-[#333] shadow-sm focus:border-[#1e2f4f] focus:outline-none focus:ring-1 focus:ring-[#1e2f4f]/18";

function str(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

/** 2026-11-16 → 2026.11.16 (관세무역개발원 원문 표기) */
function dotDate(v: string | null): string {
  if (!v) return "—";
  const m = /^(\d{4})[-.](\d{2})[-.](\d{2})/.exec(v);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : v;
}

function isNew(v: string | null): boolean {
  if (!v) return false;
  const t = Date.parse(v.slice(0, 10).replace(/\./g, "-"));
  if (Number.isNaN(t)) return false;
  return Date.now() - t < NEW_DAYS * 24 * 60 * 60 * 1000;
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

type Filters = {
  field: KctdiTradeSearchField;
  keyword: string;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: Filters = {
  field: "all",
  keyword: "",
  dateFrom: "",
  dateTo: "",
};

export function KctdiTradeView() {
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<KctdiTradeListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNo, setSelectedNo] = useState<string | null>(null);
  const [detail, setDetail] = useState<KctdiTradeDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const listUrl = useMemo(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (applied.keyword.trim()) {
      u.set("keyword", applied.keyword.trim());
      u.set("field", applied.field);
    }
    if (applied.dateFrom) u.set("dateFrom", applied.dateFrom);
    if (applied.dateTo) u.set("dateTo", applied.dateTo);
    return `/api/kctdi-trade/query?${u}`;
  }, [page, pageSize, applied]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: KctdiTradeListRow[];
        total: number;
      }>(listUrl);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
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

  const openDetail = useCallback(async (articleNo: string) => {
    setSelectedNo(articleNo);
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await fetchJson<{ post: KctdiTradeDetail }>(
        `/api/kctdi-trade/detail?articleNo=${encodeURIComponent(articleNo)}`,
      );
      setDetail(data.post);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상세 조회 실패");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function search() {
    setApplied(draft);
    setPage(1);
  }

  function resetForm() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
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
      <CasPageHeader title="무역동향" />
      <p className="text-[12px] text-slate-600">
        한국관세무역개발원 · 관세동향 서비스 · 주간 관세무역정보 ·{" "}
        <a
          href={SOURCE_LIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1e2f4f] underline"
        >
          [일간] 국내 관세무역동향 (원문)
        </a>
        {" · "}
        <code className="rounded bg-slate-100 px-1 text-[11px]">
          kctdi_trade_articles
        </code>
      </p>

      {!detailOpen ? (
        <CasCard title="[일간] 국내 관세무역동향" className="flex min-w-0 flex-col">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-y border-[#d8dee6] bg-[#f7f9fb] px-3 py-2.5">
            <p className="text-[12px] text-slate-700">
              총{" "}
              <strong className="text-[#1e5bb8]">
                {total.toLocaleString()}
              </strong>
              건 <span className="ml-2">페이지</span>{" "}
              <strong className="text-[#1e5bb8]">{curPageSafe}</strong>/
              {totalPg.toLocaleString()}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                className={INPUT_CLASS}
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
              <span className="text-[12px] text-slate-600">등록일</span>
              <input
                type="date"
                className={INPUT_CLASS}
                value={draft.dateFrom}
                aria-label="등록일 시작"
                onChange={(e) =>
                  setDraft((p) => ({ ...p, dateFrom: e.target.value }))
                }
              />
              <span className="text-[12px] text-slate-500">~</span>
              <input
                type="date"
                className={INPUT_CLASS}
                value={draft.dateTo}
                aria-label="등록일 종료"
                onChange={(e) =>
                  setDraft((p) => ({ ...p, dateTo: e.target.value }))
                }
              />
              <select
                className={INPUT_CLASS}
                value={draft.field}
                aria-label="검색구분"
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    field: e.target.value as KctdiTradeSearchField,
                  }))
                }
              >
                {KCTDI_TRADE_SEARCH_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input
                className={`${INPUT_CLASS} w-48`}
                value={draft.keyword}
                placeholder="검색어를 입력하세요."
                aria-label="검색어"
                onChange={(e) =>
                  setDraft((p) => ({ ...p, keyword: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") search();
                }}
              />
              <CasSearchButton
                type="button"
                disabled={loading}
                onClick={search}
              />
              <CasResetButton
                type="button"
                disabled={loading}
                onClick={resetForm}
              />
            </div>
          </div>

          {error ? (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <ClipGridTable>
            <colgroup>
              <col style={{ width: "8%" }} />
              <col style={{ width: "58%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <tr>
                <ClipGridTh>번호</ClipGridTh>
                <ClipGridTh>제목</ClipGridTh>
                <ClipGridTh>글쓴이</ClipGridTh>
                <ClipGridTh>등록일</ClipGridTh>
                <ClipGridTh>첨부파일</ClipGridTh>
              </tr>
            </thead>
            <tbody>
              {(loading || rows.length === 0) && (
                <ClipGridEmptyRow colSpan={5} loading={loading} />
              )}
              {!loading &&
                rows.map((r) => {
                  const sel = selectedNo === r.articleNo;
                  return (
                    <tr
                      key={r.articleNo}
                      className={`${clipGridRowHoverClass} ${
                        sel ? "bg-[#1e2f4f]/5" : ""
                      }`}
                    >
                      <ClipGridTd className="text-center tabular-nums">
                        {r.boardNumber ?? "—"}
                      </ClipGridTd>
                      <ClipGridTd title={r.title}>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <button
                            type="button"
                            title={r.title}
                            className="min-w-0 truncate text-left text-[#333] hover:text-[#1e2f4f] hover:underline"
                            onClick={() => void openDetail(r.articleNo)}
                          >
                            {str(r.title)}
                          </button>
                          {isNew(r.registeredDate) ? (
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white">
                              N
                            </span>
                          ) : null}
                        </div>
                      </ClipGridTd>
                      <ClipGridTd
                        className="truncate text-center"
                        title={str(r.writer)}
                      >
                        {str(r.writer)}
                      </ClipGridTd>
                      <ClipGridDateCell title={str(r.registeredDate)}>
                        {dotDate(r.registeredDate)}
                      </ClipGridDateCell>
                      <ClipGridTd className="text-center tabular-nums">
                        {r.attachmentCount > 0 ? `${r.attachmentCount}건` : ""}
                      </ClipGridTd>
                    </tr>
                  );
                })}
            </tbody>
          </ClipGridTable>

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
          title="무역동향 상세"
          className="flex min-w-0 flex-col"
          action={
            <CasSecondaryButton
              type="button"
              onClick={() => {
                setDetailOpen(false);
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
              <div>
                <p className="mb-1 text-[11px] font-semibold text-slate-600">
                  제목
                </p>
                <p className="text-[14px] font-semibold text-[#1e2f4f]">
                  {str(detail.title)}
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <DetailRow label="번호" value={detail.boardNumber} />
                <DetailRow label="글쓴이" value={detail.writer} />
                <DetailRow
                  label="등록일"
                  value={dotDate(detail.registeredDate)}
                />
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
              {detail.attachments.length > 0 ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold text-slate-600">
                    첨부파일
                  </p>
                  <ul className="space-y-1.5">
                    {detail.attachments.map((a) => (
                      <li key={a.fileKey} className="text-[12px]">
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
                              (로컬 파일 없음)
                            </span>
                          </span>
                        )}
                        {a.sizeBytes > 0 ? (
                          <span className="ml-2 text-slate-500">
                            {formatFileSize(a.sizeBytes)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
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
