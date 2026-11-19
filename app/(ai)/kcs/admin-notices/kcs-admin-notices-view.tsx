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
  ClipSortThButton,
  clipGridRowHoverClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import { formatFileSize } from "@/app/(ai)/kita/yestrade-content-panel";
import {
  KCS_ADMIN_NOTICE_SEARCH_FIELDS,
  type KcsAdminNoticeDetail,
  type KcsAdminNoticeListRow,
  type KcsAdminNoticeSearchField,
  type KcsAdminNoticeSortKey,
} from "@/app/lib/kcs-admin-notice-shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;
const SOURCE_LIST_URL =
  "https://www.customs.go.kr/kcs/na/ntt/selectNttList.do?mi=2897&bbsId=1366";

const SORT_COLUMNS: { key: KcsAdminNoticeSortKey; label: string }[] = [
  { key: "seq_no", label: "번호" },
  { key: "title", label: "제목" },
  { key: "writer", label: "작성자" },
  { key: "reg_date", label: "등록일" },
  { key: "view_count", label: "조회수" },
];

const PAGE_SIZES = [10, 20, 30, 50, 100];
const NEW_DAYS = 7;
const SEARCH_SELECT_CLASS =
  "h-8 rounded-md border border-[#d8dee6] bg-white px-2 text-[12px] text-[#333] shadow-sm focus:border-[#1e2f4f] focus:outline-none focus:ring-1 focus:ring-[#1e2f4f]/18";

function str(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

/** 2026-11-10 → 2026.11.10 (관세청 원문 표기) */
function dotDate(v: string | null): string {
  if (!v) return "—";
  const m = /^(\d{4})[-.](\d{2})[-.](\d{2})/.exec(v);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : v;
}

function isNewNotice(v: string | null): boolean {
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

type ViewMode = "list" | "detail";

export function KcsAdminNoticesView() {
  const [draft, setDraft] = useState<{
    field: KcsAdminNoticeSearchField;
    keyword: string;
  }>({ field: "all", keyword: "" });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<KcsAdminNoticeSortKey>("seq_no");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [rows, setRows] = useState<KcsAdminNoticeListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<KcsAdminNoticeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const listUrl = useMemo(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("sort", sort);
    u.set("dir", sortDir);
    if (applied.keyword.trim()) {
      u.set("keyword", applied.keyword.trim());
      u.set("field", applied.field);
    }
    return `/api/kcs-admin-notice/query?${u}`;
  }, [page, pageSize, sort, sortDir, applied]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: KcsAdminNoticeListRow[];
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

  const openDetail = useCallback(async (id: number) => {
    setSelectedId(id);
    setViewMode("detail");
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await fetchJson<{ post: KcsAdminNoticeDetail }>(
        `/api/kcs-admin-notice/detail?id=${encodeURIComponent(String(id))}`,
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
    const empty = { field: "all" as const, keyword: "" };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
  }

  function onHeaderSort(key: KcsAdminNoticeSortKey) {
    if (sort === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir(key === "title" || key === "writer" ? "asc" : "desc");
    }
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
      <CasPageHeader title="행정예고" />
      <p className="text-[12px] text-slate-600">
        관세청 · 알림·소식 · 공고·공시 ·{" "}
        <a
          href={SOURCE_LIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1e2f4f] underline"
        >
          행정규칙 행정예고 (원문)
        </a>
        {" · "}
        <code className="rounded bg-slate-100 px-1 text-[11px]">
          customs_admin_notice
        </code>
      </p>

      {viewMode === "list" ? (
        <CasCard title="행정규칙 행정예고" className="flex min-w-0 flex-col">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-y border-[#d8dee6] bg-[#f7f9fb] px-3 py-2.5">
            <p className="text-[12px] text-slate-700">
              전체{" "}
              <strong className="text-[#1e5bb8]">
                {total.toLocaleString()}
              </strong>{" "}
              건{" "}
              <strong className="ml-1 text-[#1e5bb8]">{curPageSafe}</strong>/
              {totalPg.toLocaleString()} 페이지
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                className={SEARCH_SELECT_CLASS}
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
              <select
                className={SEARCH_SELECT_CLASS}
                value={draft.field}
                aria-label="검색구분"
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    field: e.target.value as KcsAdminNoticeSearchField,
                  }))
                }
              >
                {KCS_ADMIN_NOTICE_SEARCH_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input
                className="h-8 w-48 rounded-md border border-[#d8dee6] bg-white px-2 text-[12px] text-[#333] shadow-sm focus:border-[#1e2f4f] focus:outline-none focus:ring-1 focus:ring-[#1e2f4f]/18"
                value={draft.keyword}
                placeholder="검색어를 입력하세요"
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
              <col style={{ width: "11%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <tr>
                {SORT_COLUMNS.map(({ key, label }) => (
                    <ClipGridTh key={key}>
                      <ClipSortThButton
                        label={label}
                        active={sort === key}
                        sortDir={sortDir}
                        align={
                          key === "title" ? "left" : "center"
                        }
                        onClick={() => onHeaderSort(key)}
                      />
                    </ClipGridTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(loading || rows.length === 0) && (
                  <ClipGridEmptyRow colSpan={5} loading={loading} />
                )}
                {!loading &&
                  rows.map((r) => {
                    const sel = selectedId === r.id;
                    return (
                      <tr
                        key={r.id}
                        className={`${clipGridRowHoverClass} ${
                          sel ? "bg-[#1e2f4f]/5" : ""
                        }`}
                      >
                        <ClipGridTd className="text-center tabular-nums">
                          {r.seqNo ?? "—"}
                        </ClipGridTd>
                        <ClipGridTd title={str(r.title)}>
                          <div className="flex min-w-0 items-center gap-1.5">
                            {isNewNotice(r.regDate) ? (
                              <span className="shrink-0 rounded-sm border border-red-500 px-1 text-[10px] font-bold leading-4 text-red-600">
                                NEW
                              </span>
                            ) : null}
                            <button
                              type="button"
                              title={str(r.title)}
                              className="min-w-0 truncate text-left text-[#333] hover:text-[#1e2f4f] hover:underline"
                              onClick={() => void openDetail(r.id)}
                            >
                              {str(r.title)}
                            </button>
                          </div>
                        </ClipGridTd>
                        <ClipGridTd
                          className="truncate text-center"
                          title={str(r.writer)}
                        >
                          {str(r.writer)}
                        </ClipGridTd>
                        <ClipGridDateCell title={str(r.regDate)}>
                          {dotDate(r.regDate)}
                        </ClipGridDateCell>
                        <ClipGridTd className="text-center tabular-nums">
                          {r.viewCount ?? "—"}
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
          title="행정예고 상세"
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
                <DetailRow
                  label="번호"
                  value={detail.seqNo != null ? String(detail.seqNo) : null}
                />
                <DetailRow label="등록일" value={detail.regDate} />
                <DetailRow label="작성자" value={detail.writer} />
                <DetailRow
                  label="조회수"
                  value={
                    detail.viewCount != null ? String(detail.viewCount) : null
                  }
                />
                <DetailRow
                  label="첨부"
                  value={`${detail.attachmentCount}건`}
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold text-slate-600">
                  제목
                </p>
                <p className="text-[14px] font-semibold text-[#1e2f4f]">
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
                      <li key={a.attachId} className="text-[12px]">
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
