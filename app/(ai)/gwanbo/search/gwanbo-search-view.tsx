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
  ClipGridEmptyRow,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipPaginationBar,
  clipGridRowHoverClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import { formatFileSize } from "@/app/(ai)/kita/yestrade-content-panel";
import {
  GWANBO_SEARCH_FIELDS,
  type GwanboNoticeDetail,
  type GwanboNoticeListRow,
  type GwanboSearchField,
} from "@/app/lib/gwanbo-notice-shared";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;
const PAGE_SIZES = [10, 30, 50, 100];
const SOURCE_URL = "https://gwanbo.go.kr/user/search/searchKeyword.do?menuMode=m2";
const CONTROL_CLASS =
  "h-9 rounded-md border border-[#d8dee6] bg-white px-2 text-[13px] text-[#333] shadow-sm focus:border-[#1e2f4f] focus:outline-none focus:ring-1 focus:ring-[#1e2f4f]/18";

function str(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

/** 20260914 → 2026.09.14 */
function dotDate(v: string | null): string {
  if (!v) return "—";
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(v);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : v;
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

/** 검색어를 빨간색으로 표시 (전자관보 검색결과 표기) */
function Highlight({ text, keyword }: { text: string; keyword: string }) {
  const kw = keyword.trim();
  if (!kw) return <>{text}</>;
  const lower = text.toLowerCase();
  const k = kw.toLowerCase();
  const parts: { s: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const at = lower.indexOf(k, i);
    if (at < 0) {
      parts.push({ s: text.slice(i), hit: false });
      break;
    }
    if (at > i) parts.push({ s: text.slice(i, at), hit: false });
    parts.push({ s: text.slice(at, at + kw.length), hit: true });
    i = at + kw.length;
  }
  return (
    <>
      {parts.map((p, idx) =>
        p.hit ? (
          <span key={idx} className="text-red-600">
            {p.s}
          </span>
        ) : (
          <Fragment key={idx}>{p.s}</Fragment>
        ),
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 gap-2 text-[12px]">
      <span className="w-20 shrink-0 font-semibold text-slate-600">{label}</span>
      <span className="min-w-0 break-words text-slate-800">{str(value)}</span>
    </div>
  );
}

type Query = { field: GwanboSearchField; keyword: string };

export function GwanboSearchView() {
  const [draft, setDraft] = useState<Query>({ field: "title", keyword: "" });
  const [applied, setApplied] = useState<Query>(draft);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<GwanboNoticeListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<GwanboNoticeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listUrl = useMemo(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (applied.keyword.trim()) {
      u.set("keyword", applied.keyword.trim());
      u.set("field", applied.field);
    }
    return `/api/gwanbo-notice/query?${u}`;
  }, [page, pageSize, applied]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ rows: GwanboNoticeListRow[]; total: number }>(
        listUrl,
      );
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

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await fetchJson<{ post: GwanboNoticeDetail }>(
        `/api/gwanbo-notice/detail?id=${encodeURIComponent(id)}`,
      );
      setDetail(data.post);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상세 조회 실패");
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function search() {
    setApplied(draft);
    setPage(1);
  }

  function resetForm() {
    const empty: Query = { field: "title", keyword: "" };
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
  const titleKeyword = applied.field === "body" ? "" : applied.keyword;
  const showDetail = selectedId !== null;

  return (
    <CasPageShell>
      <CasPageHeader title="기본검색" />
      <p className="text-[12px] text-slate-600">
        대한민국 전자관보 · 관보보기 · 호수별 ·{" "}
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1e2f4f] underline"
        >
          기본검색 (원문)
        </a>
        {" · 품목분류 고시 · "}
        <code className="rounded bg-slate-100 px-1 text-[11px]">TB_GWANBO_NOTICE</code>
      </p>

      {!showDetail ? (
        <>
          <div className="rounded-lg border border-[#c9d1dc] bg-white px-4 py-5 shadow-sm">
            <p className="mb-3 text-[12px] text-slate-500">
              입력한 키워드에 대해 메타 및 본문 검색할 수 있습니다.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <select
                className={`${CONTROL_CLASS} w-28`}
                value={draft.field}
                aria-label="검색구분"
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    field: e.target.value as GwanboSearchField,
                  }))
                }
              >
                {GWANBO_SEARCH_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input
                className={`${CONTROL_CLASS} w-full max-w-md flex-1`}
                value={draft.keyword}
                placeholder="예: 품목분류 변경고시"
                aria-label="검색어"
                onChange={(e) =>
                  setDraft((p) => ({ ...p, keyword: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") search();
                }}
              />
              <CasSearchButton type="button" disabled={loading} onClick={search} />
              <CasResetButton type="button" disabled={loading} onClick={resetForm} />
            </div>
          </div>

          <CasCard className="flex min-w-0 flex-col">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-semibold text-[#1e2f4f]">
                고시{" "}
                <span className="text-[12px] font-normal text-slate-600">
                  총{" "}
                  <strong className="text-[#1e5bb8]">{total.toLocaleString()}</strong>
                  건
                </span>
              </p>
              <select
                className={`${CONTROL_CLASS} h-8 text-[12px]`}
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
                    {n}
                  </option>
                ))}
              </select>
            </div>

            {error ? (
              <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <ClipGridTable>
              <colgroup>
                <col style={{ width: "58%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "12%" }} />
              </colgroup>
              <thead>
                <tr>
                  <ClipGridTh>목차</ClipGridTh>
                  <ClipGridTh>발행일</ClipGridTh>
                  <ClipGridTh>관보호수</ClipGridTh>
                  <ClipGridTh>구분</ClipGridTh>
                  <ClipGridTh>원문</ClipGridTh>
                </tr>
              </thead>
              <tbody>
                {(loading || rows.length === 0) && (
                  <ClipGridEmptyRow colSpan={5} loading={loading} />
                )}
                {!loading &&
                  rows.map((r) => (
                    <tr key={r.noticeId} className={clipGridRowHoverClass}>
                      <ClipGridTd title={r.title}>
                        <button
                          type="button"
                          title={r.title}
                          className="block w-full truncate text-left text-[#333] hover:text-[#1e2f4f] hover:underline"
                          onClick={() => void openDetail(r.noticeId)}
                        >
                          · <Highlight text={r.title} keyword={titleKeyword} />
                        </button>
                      </ClipGridTd>
                      <ClipGridTd className="text-center tabular-nums">
                        {dotDate(r.regDate)}
                      </ClipGridTd>
                      <ClipGridTd className="text-center tabular-nums">
                        {r.ofcttNum != null ? `${r.ofcttNum} 호` : "—"}
                      </ClipGridTd>
                      <ClipGridTd className="text-center">
                        {str(r.categoryName)}
                      </ClipGridTd>
                      <ClipGridTd className="text-center">
                        {r.pdfApiUrl ? (
                          <a
                            href={r.pdfApiUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#1e2f4f] underline"
                          >
                            PDF
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </ClipGridTd>
                    </tr>
                  ))}
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
        </>
      ) : (
        <CasCard
          title="고시 상세"
          className="flex min-w-0 flex-col"
          action={
            <CasSecondaryButton
              type="button"
              onClick={() => {
                setSelectedId(null);
                setDetail(null);
              }}
            >
              목록
            </CasSecondaryButton>
          }
        >
          {detailLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">불러오는 중…</p>
          ) : detail ? (
            <div className="space-y-4 text-sm">
              <p className="text-[14px] font-semibold text-[#1e2f4f]">{detail.title}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <DetailRow label="발행일" value={dotDate(detail.regDate)} />
                <DetailRow
                  label="관보호수"
                  value={detail.ofcttNum != null ? `${detail.ofcttNum} 호` : null}
                />
                <DetailRow label="구분" value={detail.categoryName} />
                <DetailRow label="발행기관" value={detail.organNm} />
                <DetailRow label="관련법령" value={detail.lawordNm} />
                <DetailRow
                  label="PDF"
                  value={
                    detail.pageCount != null || detail.pdfFileSize != null
                      ? [
                          detail.pageCount != null ? `${detail.pageCount}쪽` : "",
                          detail.pdfFileSize
                            ? formatFileSize(detail.pdfFileSize)
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : null
                  }
                />
              </div>
              <div className="flex flex-wrap gap-3 text-[12px]">
                {detail.pdfApiUrl ? (
                  <>
                    <a
                      href={detail.pdfApiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[#1e2f4f] underline"
                    >
                      원문 PDF 보기
                    </a>
                    <a
                      href={`${detail.pdfApiUrl}&download=1`}
                      className="font-medium text-[#1e2f4f] underline"
                    >
                      PDF 내려받기
                    </a>
                  </>
                ) : (
                  <span className="text-amber-700">로컬 PDF 파일 없음</span>
                )}
                {detail.viewerUrl ? (
                  <a
                    href={detail.viewerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#1e2f4f] underline"
                  >
                    전자관보 뷰어
                  </a>
                ) : null}
              </div>

              <div>
                <p className="mb-1 text-[11px] font-semibold text-slate-600">
                  변경 물품 ({detail.items.length}건)
                </p>
                <ClipGridTable>
                  <colgroup>
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "32%" }} />
                    <col style={{ width: "18%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <ClipGridTh>연번</ClipGridTh>
                      <ClipGridTh>품명</ClipGridTh>
                      <ClipGridTh>변경 전 HS</ClipGridTh>
                      <ClipGridTh>변경 후 HS</ClipGridTh>
                      <ClipGridTh>변경 사유</ClipGridTh>
                      <ClipGridTh>물품 설명</ClipGridTh>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.length === 0 && (
                      <ClipGridEmptyRow colSpan={6} loading={false} />
                    )}
                    {detail.items.map((it) => (
                      <tr key={it.itemId} className={clipGridRowHoverClass}>
                        <ClipGridTd className="text-center tabular-nums">
                          {it.itemNo ?? "—"}
                        </ClipGridTd>
                        <ClipGridTd className="whitespace-normal break-words">
                          {str(it.itemName)}
                        </ClipGridTd>
                        <ClipGridTd className="text-center tabular-nums">
                          {str(it.prevHsCode)}
                        </ClipGridTd>
                        <ClipGridTd className="text-center tabular-nums">
                          {str(it.newHsCode)}
                        </ClipGridTd>
                        <ClipGridTd className="whitespace-normal break-words">
                          {str(it.changeReason)}
                        </ClipGridTd>
                        <ClipGridTd className="whitespace-normal break-words">
                          {str(it.goodsDesc)}
                        </ClipGridTd>
                      </tr>
                    ))}
                  </tbody>
                </ClipGridTable>
              </div>

              <div>
                <p className="mb-1 text-[11px] font-semibold text-slate-600">본문</p>
                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-md border border-stone-200 bg-white p-3 text-[12px] leading-relaxed text-slate-800">
                  {detail.bodyText || "본문이 없습니다."}
                </pre>
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
