"use client";

import {
  CasResetButton,
  CasSearchButton,
} from "@/app/components/search-action-buttons";
import { CasCard, CasPageHeader, CasSecondaryButton } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  ClipGridDateCell,
  ClipGridEmptyRow,
  ClipGridLinkTruncateCell,
  ClipGridStatsBar,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipGridTruncateCell,
  ClipPaginationBar,
  ClipSortThButton,
  clipGridRowHoverClass,
  clipGridSeqClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import { fillTodayIfEmpty } from "@/app/lib/date-input-utils";
import {
  TT_CASE_DECISION_TABS,
  type TtCaseDetail,
  type TtCaseListRow,
  type TtCaseSortKey,
  type TtCaseTabCounts,
} from "@/app/lib/tt-case-shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;
const TT_SITE_ORIGIN = "https://www.tt.go.kr";

type UiTabKey = "ALL" | (typeof TT_CASE_DECISION_TABS)[number];
type ViewMode = "list" | "detail";

const SORT_COLUMNS: { key: TtCaseSortKey; label: string }[] = [
  { key: "decision_date", label: "결정일" },
  { key: "claim_no", label: "청구번호" },
  { key: "decision_type", label: "결정유형" },
  { key: "title", label: "제목" },
  { key: "doc_no", label: "문서번호" },
];

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
  const res = await fetch(path);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

function absoluteTtUrl(pathOrUrl: string | null | undefined): string | null {
  const raw = (pathOrUrl ?? "").trim();
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `${TT_SITE_ORIGIN}${raw}`;
  return `${TT_SITE_ORIGIN}/${raw}`;
}

export default function TaxTribunalCasesPage() {
  const [draft, setDraft] = useState({
    claimNo: "",
    title: "",
    keyword: "",
    relatedLaw: "",
    dateFrom: "",
    dateTo: "",
  });
  const [applied, setApplied] = useState(draft);
  const [activeTab, setActiveTab] = useState<UiTabKey>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<TtCaseSortKey>("decision_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [rows, setRows] = useState<TtCaseListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [tabCounts, setTabCounts] = useState<TtCaseTabCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedDemNo, setSelectedDemNo] = useState<number | null>(null);
  const [detail, setDetail] = useState<TtCaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const queryUrl = useMemo(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("tab", activeTab === "ALL" ? "ALL" : activeTab);
    u.set("sort", sort);
    u.set("dir", sortDir === "asc" ? "ASC" : "DESC");
    if (applied.claimNo.trim()) u.set("claimNo", applied.claimNo.trim());
    if (applied.title.trim()) u.set("title", applied.title.trim());
    if (applied.keyword.trim()) u.set("keyword", applied.keyword.trim());
    if (applied.relatedLaw.trim()) u.set("relatedLaw", applied.relatedLaw.trim());
    if (applied.dateFrom.trim()) u.set("dateFrom", applied.dateFrom.trim());
    if (applied.dateTo.trim()) u.set("dateTo", applied.dateTo.trim());
    return `/api/tt-case/query?${u}`;
  }, [page, pageSize, activeTab, sort, sortDir, applied]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: TtCaseListRow[];
        total: number;
        tabCounts: TtCaseTabCounts;
      }>(queryUrl);
      setRows(data.rows);
      setTotal(data.total);
      setTabCounts(data.tabCounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [queryUrl]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = async (demNo: number) => {
    setSelectedDemNo(demNo);
    setViewMode("detail");
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await fetchJson<{ detail: TtCaseDetail }>(
        `/api/tt-case/detail?demNo=${demNo}`,
      );
      setDetail(data.detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const resetForm = () => {
    const empty = {
      claimNo: "",
      title: "",
      keyword: "",
      relatedLaw: "",
      dateFrom: "",
      dateTo: "",
    };
    setDraft(empty);
    setApplied(empty);
    setActiveTab("ALL");
    setPage(1);
    setSort("decision_date");
    setSortDir("desc");
  };

  const onHeaderSort = (key: TtCaseSortKey) => {
    if (sort === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir(key === "title" || key === "claim_no" ? "asc" : "desc");
    }
    setPage(1);
  };

  const totalPg = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const curPageSafe = Math.min(Math.max(1, page), totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  function tabBadgeCount(key: UiTabKey): number {
    if (!tabCounts) return 0;
    if (key === "ALL") return tabCounts.전체;
    return tabCounts[key] ?? 0;
  }

  return (
    <div className="min-h-full bg-slate-100 p-4 text-slate-800 sm:p-6">
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
        <CasPageHeader title="조세심판사례" />

        {viewMode === "list" ? (
          <>
            <div className="overflow-hidden rounded-lg border border-stone-300 bg-[#f5f2ea] shadow-sm ring-1 ring-stone-200/80">
              <div className="divide-y divide-stone-300 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-stone-300">
                  <ClassificationFormSplitField label="청구·문서번호">
                    <input
                      className={CLASSIFICATION_FORM_INPUT_CLASS}
                      value={draft.claimNo}
                      placeholder="예: 조심2026관0044"
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, claimNo: e.target.value }))
                      }
                    />
                  </ClassificationFormSplitField>
                  <ClassificationFormSplitField label="제목">
                    <input
                      className={CLASSIFICATION_FORM_INPUT_CLASS}
                      value={draft.title}
                      placeholder="제목 키워드"
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, title: e.target.value }))
                      }
                    />
                  </ClassificationFormSplitField>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-stone-300">
                  <ClassificationFormSplitField label="관련법령">
                    <input
                      className={CLASSIFICATION_FORM_INPUT_CLASS}
                      value={draft.relatedLaw}
                      placeholder="예: 관세법"
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, relatedLaw: e.target.value }))
                      }
                    />
                  </ClassificationFormSplitField>
                  <ClassificationFormSplitField label="검색어">
                    <input
                      className={CLASSIFICATION_FORM_INPUT_CLASS}
                      value={draft.keyword}
                      placeholder="요지·주문·이유 검색"
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, keyword: e.target.value }))
                      }
                    />
                  </ClassificationFormSplitField>
                </div>
                <ClassificationFormSplitField label="결정일" compact>
                  <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
                    <input
                      type="date"
                      className={`${CLASSIFICATION_FORM_INPUT_CLASS} !w-auto min-w-[9.5rem] max-w-[11rem] shrink-0`}
                      value={draft.dateFrom}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, dateFrom: e.target.value }))
                      }
                      onFocus={() =>
                        fillTodayIfEmpty(draft.dateFrom, (ymd) =>
                          setDraft((p) => ({ ...p, dateFrom: ymd })),
                        )
                      }
                    />
                    <span className="shrink-0 text-slate-400">~</span>
                    <input
                      type="date"
                      className={`${CLASSIFICATION_FORM_INPUT_CLASS} !w-auto min-w-[9.5rem] max-w-[11rem] shrink-0`}
                      value={draft.dateTo}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, dateTo: e.target.value }))
                      }
                      onFocus={() =>
                        fillTodayIfEmpty(draft.dateTo, (ymd) =>
                          setDraft((p) => ({ ...p, dateTo: ymd })),
                        )
                      }
                    />
                  </div>
                </ClassificationFormSplitField>
                <div className="flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-[#f8f6f2] px-3 py-2.5">
                  <CasResetButton
                    type="button"
                    disabled={loading}
                    onClick={resetForm}
                  />
                  <CasSearchButton
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setApplied({ ...draft });
                      setPage(1);
                    }}
                  >
                    {loading ? "조회 중…" : "조회"}
                  </CasSearchButton>
                </div>
              </div>
            </div>

            <div className="flex overflow-x-auto rounded-t-md border border-stone-300 bg-stone-200/70 shadow-inner">
              {(
                [
                  { key: "ALL" as const, label: "전체" },
                  ...TT_CASE_DECISION_TABS.map((t) => ({
                    key: t,
                    label: t,
                  })),
                ] as { key: UiTabKey; label: string }[]
              ).map((t, i, arr) => {
                const sel = activeTab === t.key;
                const n = tabBadgeCount(t.key);
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(t.key);
                      setPage(1);
                    }}
                    className={`min-w-0 shrink-0 whitespace-nowrap border-stone-300 px-3 py-2.5 text-xs font-semibold sm:px-5 sm:text-sm ${
                      i < arr.length - 1 ? "border-r" : ""
                    } ${
                      sel
                        ? "bg-[#1e2f4f] text-white shadow-sm"
                        : "bg-stone-100 text-slate-800 hover:bg-white"
                    }`}
                  >
                    {t.label}{" "}
                    <span className={sel ? "opacity-95" : "text-slate-600"}>
                      [{n.toLocaleString("ko-KR")}]
                    </span>
                  </button>
                );
              })}
            </div>

            <CasCard title="조회 결과" className="flex min-w-0 flex-col">
              {error ? (
                <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              ) : null}

              <ClipGridStatsBar
                total={total}
                pageSize={pageSize}
                loading={loading}
                onPageSizeChange={(size) => {
                  setPage(1);
                  setPageSize(size);
                }}
              />

              <ClipGridTable>
                <colgroup>
                  <col style={{ width: "4%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "48%" }} />
                  <col style={{ width: "16%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <ClipGridTh>번호</ClipGridTh>
                    {SORT_COLUMNS.map(({ key, label }) => (
                      <ClipGridTh key={key}>
                        <ClipSortThButton
                          label={label}
                          active={sort === key}
                          sortDir={sortDir}
                          align={key === "title" ? "left" : "center"}
                          onClick={() => onHeaderSort(key)}
                        />
                      </ClipGridTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(loading || rows.length === 0) && (
                    <ClipGridEmptyRow colSpan={6} loading={loading} />
                  )}
                  {!loading &&
                    rows.map((r, idx) => {
                      const seq = (curPageSafe - 1) * pageSize + idx + 1;
                      const sel = selectedDemNo === r.dem_no;
                      return (
                        <tr
                          key={r.dem_no}
                          className={`${clipGridRowHoverClass} ${
                            sel ? "bg-[#1e2f4f]/5" : ""
                          }`}
                        >
                          <ClipGridTd className={clipGridSeqClass}>
                            {seq}
                          </ClipGridTd>
                          <ClipGridDateCell title={str(r.decision_date)}>
                            {str(r.decision_date)}
                          </ClipGridDateCell>
                          <ClipGridTd className="text-center font-mono text-[12px]">
                            {str(r.claim_no)}
                          </ClipGridTd>
                          <ClipGridTd className="text-center">
                            {str(r.decision_type)}
                          </ClipGridTd>
                          <ClipGridLinkTruncateCell
                            label={str(r.title)}
                            title={str(r.title)}
                            onClick={() => void openDetail(r.dem_no)}
                          />
                          <ClipGridTruncateCell title={str(r.doc_no)}>
                            {str(r.doc_no)}
                          </ClipGridTruncateCell>
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
          </>
        ) : (
          <CasCard
            title="결정문 상세"
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
                  <DetailRow label="청구번호" value={detail.claim_no} />
                  <DetailRow label="문서번호" value={detail.doc_no} />
                  <DetailRow label="세목" value={detail.semok_name} />
                  <DetailRow label="결정유형" value={detail.decision_type} />
                  <DetailRow label="결정일" value={detail.decision_date} />
                  <DetailRow
                    label="첨부"
                    value={
                      detail.attach_cnt != null
                        ? `${detail.attach_cnt}건`
                        : null
                    }
                  />
                </div>
                <DetailBlock label="제목" value={detail.title} />
                <DetailBlock label="결정요지" value={detail.summary} />
                <DetailBlock label="관련법령" value={detail.related_law} />
                <DetailBlock label="참조결정" value={detail.ref_decision} />
                <DetailBlock label="따른결정" value={detail.fol_decision} />
                <DetailBlock label="주문" value={detail.order_text} />
                <DetailBlock label="이유" value={detail.reason_text} />

                {detail.attachments.length > 0 ? (
                  <div>
                    <h3 className="mb-1 text-[12px] font-semibold text-slate-600">
                      첨부파일
                    </h3>
                    <ul className="list-inside list-disc space-y-1 text-[13px]">
                      {detail.attachments.map((a) => {
                        const href = absoluteTtUrl(a.download_url);
                        return (
                          <li key={a.attach_id}>
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-[#2f6fbf] underline"
                              >
                                {a.file_name || a.dem_str || href}
                              </a>
                            ) : (
                              a.file_name || "—"
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {absoluteTtUrl(detail.source_url) ? (
                  <p className="text-[12px] text-slate-500">
                    원문:{" "}
                    <a
                      href={absoluteTtUrl(detail.source_url)!}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#2f6fbf] underline"
                    >
                      조세심판원
                    </a>
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">
                상세 정보가 없습니다.
              </p>
            )}
          </CasCard>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex gap-2 border-b border-slate-100 py-1.5">
      <span className="w-20 shrink-0 text-[12px] font-semibold text-slate-500">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[13px] text-slate-800">
        {str(value)}
      </span>
    </div>
  );
}

function DetailBlock({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  const t = (value ?? "").trim();
  if (!t) return null;
  return (
    <div>
      <h3 className="mb-1 text-[12px] font-semibold text-slate-600">{label}</h3>
      <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-800">
        {t}
      </pre>
    </div>
  );
}
