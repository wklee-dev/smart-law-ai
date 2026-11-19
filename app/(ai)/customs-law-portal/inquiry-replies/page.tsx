"use client";

import { CasResetButton, CasSearchButton } from "@/app/components/search-action-buttons";
import { CasCard, CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  ClipGridDateCell,
  ClipGridEmptyRow,
  ClipGridLinkCell,
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
  CLIP_QUESTION_AREA_TABS,
  CLIP_QUESTION_GUBUN_OPTIONS,
  formatClipQuestionBodyText,
  type ClipQuestionDetail,
  type ClipQuestionListRow,
  type ClipQuestionSortKey,
  type ClipQuestionTabCounts,
} from "@/app/lib/clip-question-shared";
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

type UiTabKey = "ALL" | (typeof CLIP_QUESTION_AREA_TABS)[number];
type ViewMode = "list" | "detail";

const SORT_COLUMNS: { key: ClipQuestionSortKey; label: string }[] = [
  { key: "gubun", label: "질의구분" },
  { key: "category", label: "업무분야" },
  { key: "title", label: "제목" },
  { key: "receive_date", label: "접수일자" },
  { key: "reply_date", label: "회신일자" },
  { key: "reply_dept", label: "회신부서" },
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

function DetailMetaRow({
  label,
  value,
  colSpan,
  formatted,
}: {
  label: string;
  value: string;
  colSpan?: 3;
  /** 상세내용·회신내용 등 구조 마커 줄바꿈 */
  formatted?: boolean;
}) {
  const display = formatted ? formatClipQuestionBodyText(value) || "—" : value;
  return (
    <>
      <th className="w-32 border border-stone-300 bg-[#ebe8e0] px-2 py-2 text-right text-xs font-semibold text-slate-800">
        {label}
      </th>
      <td
        colSpan={colSpan}
        className={`border border-stone-300 px-3 py-2 text-[13px] text-slate-900 ${
          formatted
            ? "leading-[1.85] whitespace-pre-wrap"
            : "leading-relaxed whitespace-pre-wrap"
        }`}
      >
        {display}
      </td>
    </>
  );
}

function QuestionDetailTables({ detail }: { detail: ClipQuestionDetail }) {
  return (
    <div className="space-y-4 p-4">
      <div>
        <h3 className="mb-2 border-l-4 border-blue-600 pl-2 text-sm font-bold text-slate-900">
          법령질의서
        </h3>
        <table className="w-full border-collapse text-left">
          <tbody>
            <tr>
              <DetailMetaRow label="업무분야" value={str(detail.category)} />
              <DetailMetaRow
                label="접수일자"
                value={str(detail.receive_date)}
              />
            </tr>
            <tr>
              <DetailMetaRow
                label="제목"
                value={str(detail.title)}
                colSpan={3}
              />
            </tr>
            <tr>
              <DetailMetaRow
                label="질의요지"
                value={str(detail.question_summary)}
                colSpan={3}
              />
            </tr>
            <tr>
              <DetailMetaRow
                label="해석대상 법령/규칙"
                value={str(detail.law_target)}
                colSpan={3}
              />
            </tr>
            <tr>
              <DetailMetaRow
                label="관련법령 근거규정"
                value={str(detail.law_basis)}
                colSpan={3}
              />
            </tr>
            <tr>
              <DetailMetaRow
                label="상세내용"
                value={detail.detail_content}
                colSpan={3}
                formatted
              />
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-2 border-l-4 border-blue-600 pl-2 text-sm font-bold text-slate-900">
          법령회신
        </h3>
        <table className="w-full border-collapse text-left">
          <tbody>
            <tr>
              <DetailMetaRow
                label="회신부서"
                value={str(detail.reply_dept)}
              />
              <DetailMetaRow
                label="회신일자"
                value={str(detail.reply_date)}
              />
            </tr>
            <tr>
              <DetailMetaRow
                label="회신내용"
                value={detail.reply_content}
                colSpan={3}
                formatted
              />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="rounded border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs leading-relaxed text-blue-900">
        본 회신은 질의 당시의 사실관계를 전제로 한 해석이며, 구체적 사안에 따라
        달리 적용될 수 있습니다.
      </p>
    </div>
  );
}

export default function CustomsLawPortalInquiryRepliesPage() {
  const [draft, setDraft] = useState({ gubun: "", title: "" });
  const [applied, setApplied] = useState({ gubun: "", title: "" });
  const [activeTab, setActiveTab] = useState<UiTabKey>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<ClipQuestionSortKey>("receive_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const [tabCounts, setTabCounts] = useState<ClipQuestionTabCounts | null>(null);
  const [rows, setRows] = useState<ClipQuestionListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedSeqId, setSelectedSeqId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClipQuestionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("tab", activeTab === "ALL" ? "ALL" : activeTab);
    if (applied.gubun.trim()) u.set("gubun", applied.gubun.trim());
    if (applied.title.trim()) u.set("title", applied.title.trim());
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-question/query?${u}`;
  }, [page, pageSize, activeTab, applied, sort, sortDir]);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        tabCounts: ClipQuestionTabCounts;
        rows: ClipQuestionListRow[];
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

  const openDetail = useCallback(async (seqId: string) => {
    setSelectedSeqId(seqId);
    setViewMode("detail");
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const d = await fetchJson<ClipQuestionDetail>(
        `/api/clip-question/detail?seqId=${encodeURIComponent(seqId)}`,
      );
      setDetail(d);
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void runQuery();
  }, [runQuery]);

  const onHeaderSort = useCallback((key: ClipQuestionSortKey) => {
    setPage(1);
    if (sortRef.current === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir("asc");
    }
  }, []);

  const resetForm = useCallback(() => {
    const empty = { gubun: "", title: "" };
    setDraft(empty);
    setApplied(empty);
    setActiveTab("ALL");
    setPage(1);
    setSort("receive_date");
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

  const tabLabel = activeTab === "ALL" ? "전체" : activeTab;

  const gubunRadios = [
    { value: "", label: "전체" },
    ...CLIP_QUESTION_GUBUN_OPTIONS.map((g) => ({ value: g, label: g })),
  ];

  return (
    <div className="min-h-full bg-slate-100 p-4 text-slate-800 sm:p-6">
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
        <CasPageHeader title="법령질의회신" />

        {viewMode === "list" && (
          <>
            <div className="overflow-hidden rounded-lg border border-stone-300 bg-[#f5f2ea] shadow-sm ring-1 ring-stone-200/80">
              <div className="divide-y divide-stone-300 bg-white">
                <div className="flex min-h-[2.75rem] items-stretch bg-white">
                  <div className="flex w-[6.65rem] shrink-0 items-center justify-end border-r border-stone-300 bg-[#ebe8e0] px-2 py-2 text-[11px] font-semibold text-slate-800 sm:w-28">
                    질의구분
                  </div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
                    {gubunRadios.map((opt) => (
                      <label
                        key={opt.value || "all"}
                        className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-700"
                      >
                        <input
                          type="radio"
                          name="gubun"
                          className="border-stone-400"
                          checked={draft.gubun === opt.value}
                          onChange={() =>
                            setDraft((p) => ({ ...p, gubun: opt.value }))
                          }
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                <ClassificationFormSplitField label="제목">
                  <input
                    type="text"
                    className={CLASSIFICATION_FORM_INPUT_CLASS}
                    value={draft.title}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, title: e.target.value }))
                    }
                    placeholder="제목 키워드"
                  />
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
                  ...CLIP_QUESTION_AREA_TABS.map((t) => ({
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
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "32%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
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
                          align={
                            key === "title" ||
                            key === "gubun" ||
                            key === "category" ||
                            key === "reply_dept"
                              ? "left"
                              : "center"
                          }
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
                      const sel = selectedSeqId === r.seq_id;
                      const title = str(r.title);
                      return (
                        <tr
                          key={r.seq_id}
                          className={`${clipGridRowHoverClass} ${
                            sel ? "bg-[#1e2f4f]/5" : ""
                          }`}
                        >
                          <ClipGridTd className={clipGridSeqClass}>
                            {seq}
                          </ClipGridTd>
                          <ClipGridTruncateCell align="left" title={str(r.gubun)}>
                            {str(r.gubun)}
                          </ClipGridTruncateCell>
                          <ClipGridTruncateCell align="left" title={str(r.category)}>
                            {str(r.category)}
                          </ClipGridTruncateCell>
                          <ClipGridLinkCell
                            label={title}
                            title={title}
                            onClick={() => void openDetail(r.seq_id)}
                          />
                          <ClipGridDateCell title={str(r.receive_date)}>
                            {str(r.receive_date)}
                          </ClipGridDateCell>
                          <ClipGridDateCell title={str(r.reply_date)}>
                            {str(r.reply_date)}
                          </ClipGridDateCell>
                          <ClipGridTruncateCell align="left" title={str(r.reply_dept)}>
                            {str(r.reply_dept)}
                          </ClipGridTruncateCell>
                        </tr>
                      );
                    })}
                </tbody>
              </ClipGridTable>

              {total > 0 && (
                <ClipPaginationBar
                  curPageSafe={curPageSafe}
                  totalPg={totalPg}
                  loading={loading}
                  block={block}
                  onPage={setPage}
                />
              )}
            </CasCard>
          </>
        )}

        {viewMode === "detail" && (
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
              <div>
                <p className="text-[11px] text-slate-500">
                  법령·판례 등 &gt; 질의회신 &gt; {tabLabel}
                </p>
                <h2 className="text-sm font-bold text-slate-900">
                  법령질의회신 본문
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
              <aside className="w-full shrink-0 border-b border-slate-200 bg-slate-50 lg:w-64 lg:border-r lg:border-b-0">
                <p className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                  | 검색결과 [{tabLabel}]
                </p>
                <ul className="max-h-[28rem] overflow-y-auto text-[12px] lg:max-h-none">
                  {rows.map((r) => {
                    const sel = r.seq_id === selectedSeqId;
                    return (
                      <li
                        key={r.seq_id}
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
                          onClick={() => void openDetail(r.seq_id)}
                        >
                          {r.title}
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
                  <QuestionDetailTables detail={detail} />
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
