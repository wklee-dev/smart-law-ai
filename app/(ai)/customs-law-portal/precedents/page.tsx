"use client";

import { CasResetButton, CasSearchButton } from "@/app/components/search-action-buttons";
import { CasCard, CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  ClipGridDateCell,
  ClipGridEmptyRow,
  ClipGridLinkCell,
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
import {
  CLIP_PRECEDENT_TYPE_TABS,
  type ClipPrecedentDetail,
  type ClipPrecedentDetailSection,
  type ClipPrecedentHsRow,
  type ClipPrecedentLawRow,
  type ClipPrecedentListRow,
  type ClipPrecedentSortKey,
  type ClipPrecedentTabCounts,
} from "@/app/lib/clip-precedent-shared";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const PAGE_NUMBER_WINDOW = 10;

function visiblePageBlock(
  currentPage: number,
  totalPages: number,
  windowSize: number = PAGE_NUMBER_WINDOW,
): number[] {
  const tp = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(Math.max(1, Math.floor(currentPage)), tp);
  const start = Math.floor((cur - 1) / windowSize) * windowSize + 1;
  const end = Math.min(start + windowSize - 1, tp);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

type UiTabKey = "ALL" | (typeof CLIP_PRECEDENT_TYPE_TABS)[number];
type DetailTab = "case" | "law" | "hs";
type ViewMode = "list" | "detail";

const SORT_COLUMNS: { key: ClipPrecedentSortKey; label: string }[] = [
  { key: "trial_type", label: "심판유형" },
  { key: "incd_no", label: "사건번호" },
  { key: "wrdc_ttle", label: "결정서제목" },
  { key: "issue_class", label: "쟁점분류" },
  { key: "decision_date", label: "결정일자" },
  { key: "agency", label: "처분청" },
];

function str(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

function PaginationBar({
  curPageSafe,
  totalPg,
  loading,
  block,
  onPage,
}: {
  curPageSafe: number;
  totalPg: number;
  loading: boolean;
  block: number[];
  onPage: (p: number) => void;
}) {
  if (totalPg <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 px-2 py-3">
      <button
        type="button"
        aria-label="첫 페이지"
        disabled={curPageSafe <= 1 || loading}
        onClick={() => onPage(1)}
        className="min-w-[2rem] rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
      >
        «
      </button>
      <button
        type="button"
        aria-label="이전 페이지"
        disabled={curPageSafe <= 1 || loading}
        onClick={() => onPage(Math.max(1, curPageSafe - 1))}
        className="min-w-[2rem] rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
      >
        ‹
      </button>
      {block.map((p) => {
        const sel = p === curPageSafe;
        return (
          <button
            key={p}
            type="button"
            aria-label={`${p}페이지`}
            aria-current={sel ? "page" : undefined}
            disabled={loading}
            onClick={() => onPage(p)}
            className={`min-w-[2.25rem] rounded border px-2 py-1 text-xs font-medium ${
              sel
                ? "border-blue-600 bg-blue-50 text-blue-900"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            } disabled:opacity-60`}
          >
            {p}
          </button>
        );
      })}
      <button
        type="button"
        aria-label="다음 페이지"
        disabled={curPageSafe >= totalPg || loading}
        onClick={() => onPage(Math.min(totalPg, curPageSafe + 1))}
        className="min-w-[2rem] rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
      >
        ›
      </button>
      <button
        type="button"
        aria-label="마지막 페이지"
        disabled={curPageSafe >= totalPg || loading}
        onClick={() => onPage(totalPg)}
        className="min-w-[2rem] rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
      >
        »
      </button>
    </div>
  );
}

function MetaCell({
  label,
  value,
  colSpan,
}: {
  label: string;
  value: string;
  colSpan?: 3;
}) {
  return (
    <>
      <th className="w-28 border border-stone-300 bg-[#ebe8e0] px-2 py-2 text-right text-xs font-semibold text-slate-800">
        {label}
      </th>
      <td
        colSpan={colSpan}
        className="border border-stone-300 px-3 py-2 text-[13px] text-slate-900"
      >
        {value}
      </td>
    </>
  );
}

function PrecedentBodySections({
  sections,
}: {
  sections: ClipPrecedentDetailSection[];
}) {
  if (sections.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-slate-500">
        본문 내용이 없습니다.
      </p>
    );
  }
  return (
    <div className="divide-y divide-stone-200 border-t border-stone-300">
      {sections.map((s) => (
        <div key={s.key} className="flex items-start">
          <div className="w-28 shrink-0 self-stretch border-r border-stone-200 bg-stone-50 px-2 py-4 text-center text-xs font-semibold leading-snug text-slate-700">
            {s.label}
          </div>
          <div className="min-w-0 flex-1 whitespace-pre-wrap px-4 py-4 text-[13px] leading-[1.75] text-slate-900">
            {s.text}
          </div>
        </div>
      ))}
    </div>
  );
}

function LawTabContent({ laws }: { laws: ClipPrecedentLawRow[] }) {
  if (laws.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-slate-500">
        관련 법령이 없습니다.
      </p>
    );
  }
  return (
    <div className="divide-y divide-stone-200">
      {laws.map((law) => (
        <div key={law.id} className="px-4 py-4">
          <h3 className="text-sm font-semibold text-blue-800">{law.law_name}</h3>
          <div className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">
            {law.law_content}
          </div>
        </div>
      ))}
    </div>
  );
}

function HsTabContent({ items }: { items: ClipPrecedentHsRow[] }) {
  if (items.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-slate-500">
        관련 HS 정보가 없습니다.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-[13px]">
        <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
          <tr>
            <th className="border border-slate-200 px-3 py-2">HS코드</th>
            <th className="border border-slate-200 px-3 py-2">품명(한글)</th>
            <th className="border border-slate-200 px-3 py-2">품명(영문)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id} className="text-slate-800">
              <td className="border border-slate-200 px-3 py-2 font-mono text-xs whitespace-nowrap">
                {str(row.hs_code)}
              </td>
              <td className="border border-slate-200 px-3 py-2">{str(row.kor_name)}</td>
              <td className="border border-slate-200 px-3 py-2">{str(row.eng_name)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CustomsLawPortalPrecedentsPage() {
  const [issueOpts, setIssueOpts] = useState<string[]>([]);
  const [agencyOpts, setAgencyOpts] = useState<string[]>([]);
  const [draft, setDraft] = useState({
    caseNo: "",
    title: "",
    issueClass: "",
    agency: "",
  });
  const [applied, setApplied] = useState({
    caseNo: "",
    title: "",
    issueClass: "",
    agency: "",
  });
  const [activeTab, setActiveTab] = useState<UiTabKey>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<ClipPrecedentSortKey>("decision_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const [tabCounts, setTabCounts] = useState<ClipPrecedentTabCounts | null>(null);
  const [rows, setRows] = useState<ClipPrecedentListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [detailTab, setDetailTab] = useState<DetailTab>("case");
  const [selectedDsbdNo, setSelectedDsbdNo] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClipPrecedentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("tab", activeTab === "ALL" ? "ALL" : activeTab);
    if (applied.caseNo.trim()) u.set("caseNo", applied.caseNo.trim());
    if (applied.title.trim()) u.set("title", applied.title.trim());
    if (applied.issueClass.trim()) u.set("issueClass", applied.issueClass.trim());
    if (applied.agency.trim()) u.set("agency", applied.agency.trim());
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-precedent/query?${u}`;
  }, [page, pageSize, activeTab, applied, sort, sortDir]);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        tabCounts: ClipPrecedentTabCounts;
        rows: ClipPrecedentListRow[];
        total: number;
      }>(buildQueryUrl());
      setTabCounts(data.tabCounts);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [buildQueryUrl]);

  const loadFilters = useCallback(async () => {
    const data = await fetchJson<{
      issue_classes: string[];
      agencies: string[];
    }>("/api/clip-precedent/filters");
    setIssueOpts(data.issue_classes);
    setAgencyOpts(data.agencies);
  }, []);

  const openDetail = useCallback(async (dsbdIncdNo: string) => {
    setSelectedDsbdNo(dsbdIncdNo);
    setViewMode("detail");
    setDetailTab("case");
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const d = await fetchJson<ClipPrecedentDetail>(
        `/api/clip-precedent/detail?dsbdIncdNo=${encodeURIComponent(dsbdIncdNo)}`,
      );
      setDetail(d);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadFilters();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [loadFilters]);

  useEffect(() => {
    void runQuery();
  }, [runQuery]);

  const onHeaderSort = useCallback((key: ClipPrecedentSortKey) => {
    setPage(1);
    if (sortRef.current === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir("asc");
    }
  }, []);

  const resetForm = useCallback(() => {
    const empty = { caseNo: "", title: "", issueClass: "", agency: "" };
    setDraft(empty);
    setApplied(empty);
    setActiveTab("ALL");
    setPage(1);
    setSort("decision_date");
    setSortDir("desc");
  }, []);

  const totalPg = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const curPageSafe = Math.min(Math.max(1, page), totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  function tabBadgeCount(key: UiTabKey): number {
    if (!tabCounts) return 0;
    if (key === "ALL") return tabCounts.전체;
    return tabCounts[key];
  }

  const tabLabel =
    activeTab === "ALL" ? "전체" : activeTab;

  return (
    <div className="min-h-full bg-slate-100 p-4 text-slate-800 sm:p-6">
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
        <CasPageHeader title="판례·결정례" />

        {viewMode === "list" && (
          <>
            <div className="overflow-hidden rounded-lg border border-stone-300 bg-[#f5f2ea] shadow-sm ring-1 ring-stone-200/80">
              <div className="divide-y divide-stone-300 bg-white">
                <ClassificationFormSplitField label="사건번호">
                  <input
                    type="text"
                    className={CLASSIFICATION_FORM_INPUT_CLASS}
                    value={draft.caseNo}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, caseNo: e.target.value }))
                    }
                    placeholder="예: 관세청-적부심사-2025-45"
                  />
                </ClassificationFormSplitField>
                <ClassificationFormSplitField label="결정서제목">
                  <input
                    type="text"
                    className={CLASSIFICATION_FORM_INPUT_CLASS}
                    value={draft.title}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, title: e.target.value }))
                    }
                    placeholder="결정서 제목 키워드"
                  />
                </ClassificationFormSplitField>
                <div className="flex min-h-[2.75rem] items-stretch bg-white">
                  <div className="flex w-[6.65rem] shrink-0 items-center justify-end border-r border-stone-300 bg-[#ebe8e0] px-2 py-2 text-[11px] font-semibold text-slate-800 sm:w-28">
                    쟁점분류
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 px-2 py-2">
                    <select
                      className={`${CLASSIFICATION_FORM_INPUT_CLASS} w-[min(100%,14rem)]`}
                      value={draft.issueClass}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, issueClass: e.target.value }))
                      }
                    >
                      <option value="">— 전체 —</option>
                      {issueOpts.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <span className="text-[11px] font-semibold text-slate-700">
                      처분청
                    </span>
                    <select
                      className={`${CLASSIFICATION_FORM_INPUT_CLASS} w-[min(100%,14rem)]`}
                      value={draft.agency}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, agency: e.target.value }))
                      }
                    >
                      <option value="">— 전체 —</option>
                      {agencyOpts.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
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
                  ...CLIP_PRECEDENT_TYPE_TABS.map((t) => ({
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
                      [{n}]
                    </span>
                  </button>
                );
              })}
            </div>

            <CasCard title="조회 결과" className="flex min-w-0 flex-col">
              {error && (
                <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              )}

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
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "17%" }} />
                  <col style={{ width: "34%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "14%" }} />
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
                          align={key === "wrdc_ttle" ? "left" : "center"}
                          onClick={() => onHeaderSort(key)}
                        />
                      </ClipGridTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(loading || rows.length === 0) && (
                    <ClipGridEmptyRow colSpan={7} loading={loading} />
                  )}
                  {!loading &&
                    rows.map((r, idx) => {
                      const seq = (curPageSafe - 1) * pageSize + idx + 1;
                      const sel = selectedDsbdNo === r.dsbd_incd_no;
                      const title = str(r.wrdc_ttle);
                      return (
                        <tr
                          key={r.dsbd_incd_no}
                          className={`${clipGridRowHoverClass} ${
                            sel ? "bg-[#1e2f4f]/5" : ""
                          }`}
                        >
                          <ClipGridTd className={clipGridSeqClass}>
                            {seq}
                          </ClipGridTd>
                          <ClipGridTruncateCell align="center" title={str(r.trial_type)}>
                            {str(r.trial_type)}
                          </ClipGridTruncateCell>
                          <ClipGridLinkTruncateCell
                            align="center"
                            label={str(r.incd_no)}
                            title={str(r.incd_no)}
                            onClick={() => void openDetail(r.dsbd_incd_no)}
                          />
                          <ClipGridLinkCell
                            label={title}
                            title={title}
                            onClick={() => void openDetail(r.dsbd_incd_no)}
                          />
                          <ClipGridTruncateCell align="center" title={str(r.issue_class)}>
                            {str(r.issue_class)}
                          </ClipGridTruncateCell>
                          <ClipGridDateCell title={str(r.decision_date)}>
                            {str(r.decision_date)}
                          </ClipGridDateCell>
                          <ClipGridTruncateCell align="center" title={str(r.agency)}>
                            {str(r.agency)}
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
        )}

        {viewMode === "detail" && (
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
              <div>
                <p className="text-[11px] text-slate-500">
                  법령·판례 등 &gt; 판례·결정례 &gt; {tabLabel}
                </p>
                <h2 className="text-sm font-bold text-slate-900">
                  결정례·판례 본문
                </h2>
              </div>
              <div className="flex gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className="rounded border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50"
                >
                  목록
                </button>
                <button
                  type="button"
                  disabled={!detail}
                  onClick={() =>
                    typeof window !== "undefined" && window.print()
                  }
                  className="rounded border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                >
                  인쇄
                </button>
              </div>
            </div>

            <div className="flex min-h-[32rem] flex-col lg:flex-row">
              <aside className="w-full shrink-0 border-b border-slate-200 bg-slate-50 lg:w-56 lg:border-r lg:border-b-0">
                <p className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                  | 검색결과 [{tabLabel}]
                </p>
                <ul className="max-h-[28rem] overflow-y-auto text-[12px] lg:max-h-none">
                  {rows.map((r) => {
                    const sel = r.dsbd_incd_no === selectedDsbdNo;
                    return (
                      <li
                        key={r.dsbd_incd_no}
                        className={`border-b border-slate-100 ${
                          sel ? "bg-amber-50" : ""
                        }`}
                      >
                        <button
                          type="button"
                          className={`block w-full px-3 py-2 text-left leading-snug ${
                            sel
                              ? "font-semibold text-blue-900"
                              : "text-blue-700 hover:underline"
                          }`}
                          onClick={() => void openDetail(r.dsbd_incd_no)}
                        >
                          {r.incd_no}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <PaginationBar
                  curPageSafe={curPageSafe}
                  totalPg={totalPg}
                  loading={loading}
                  block={block}
                  onPage={setPage}
                />
              </aside>

              <div className="min-w-0 flex-1">
                {detailLoading && (
                  <p className="px-4 py-8 text-center text-sm text-slate-500">
                    본문을 불러오는 중…
                  </p>
                )}
                {detailError && (
                  <p className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {detailError}
                  </p>
                )}
                {detail && !detailLoading && (
                  <>
                    <div className="flex overflow-x-auto border-b border-stone-300 bg-stone-100">
                      {(
                        [
                          { key: "case" as const, label: "심사사건" },
                          { key: "law" as const, label: "관련법령" },
                          { key: "hs" as const, label: "HS" },
                        ] as const
                      ).map((t) => {
                        const sel = detailTab === t.key;
                        return (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => setDetailTab(t.key)}
                            className={`border-r border-stone-300 px-4 py-2 text-xs font-semibold ${
                              sel
                                ? "bg-white text-blue-800"
                                : "text-slate-700 hover:bg-white/70"
                            }`}
                          >
                            {t.label}
                            {t.key === "law" && detail.laws.length > 0
                              ? ` (${detail.laws.length})`
                              : ""}
                            {t.key === "hs" && detail.hs_items.length > 0
                              ? ` (${detail.hs_items.length})`
                              : ""}
                          </button>
                        );
                      })}
                    </div>

                    {detailTab === "case" && (
                      <>
                        <table className="w-full border-collapse text-left">
                          <tbody>
                            <tr>
                              <MetaCell
                                label="심판유형"
                                value={str(detail.trial_type)}
                              />
                              <MetaCell
                                label="쟁점분류"
                                value={str(detail.issue_class)}
                              />
                            </tr>
                            <tr>
                              <MetaCell
                                label="제목"
                                value={str(detail.wrdc_ttle)}
                                colSpan={3}
                              />
                            </tr>
                            <tr>
                              <MetaCell
                                label="사건번호"
                                value={str(detail.incd_no)}
                              />
                              <MetaCell
                                label="결정일자"
                                value={str(detail.decision_date)}
                              />
                            </tr>
                            <tr>
                              <MetaCell
                                label="결정유형"
                                value={str(detail.decision_type)}
                              />
                              <MetaCell
                                label="처분청"
                                value={str(detail.agency)}
                              />
                            </tr>
                          </tbody>
                        </table>
                        <PrecedentBodySections sections={detail.sections} />
                      </>
                    )}
                    {detailTab === "law" && (
                      <LawTabContent laws={detail.laws} />
                    )}
                    {detailTab === "hs" && (
                      <HsTabContent items={detail.hs_items} />
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
