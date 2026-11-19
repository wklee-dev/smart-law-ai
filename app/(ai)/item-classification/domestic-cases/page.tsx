"use client";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { CasResetButton, CasSearchButton } from "@/app/components/search-action-buttons";
import {
  ClipGridDateCell,
  ClipGridLabelCell,
  ClipGridEmptyRow,
  ClipGridStatsBar,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipGridLinkCell,
  ClipGridLinkTruncateCell,
  ClipGridTruncateCell,
  ClipPaginationBar,
  clipGridRowHoverClass,
  clipGridMonoClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import { EnforcementDateRangePicker } from "./enforcement-date-range-picker";

/** 서버와 동일: 검색폼 필드 중 하나 이상 */
function clientHasCriterion(f: {
  reff_no: string;
  dtrm_hs_sgn: string;
  enfr_dt_from: string;
  enfr_dt_to: string;
  cmdt_nm: string;
  cmdt_desc: string;
  dtrm_rsn_cn: string;
  keyword: string;
}): boolean {
  const keys = [
    f.reff_no,
    f.dtrm_hs_sgn,
    f.cmdt_nm,
    f.cmdt_desc,
    f.dtrm_rsn_cn,
    f.keyword,
    f.enfr_dt_from,
    f.enfr_dt_to,
  ] as const;
  return keys.some((v) => v.trim().length > 0);
}

type TabKey = "ALL" | "A" | "B" | "C";

type BucketCode = "A" | "B" | "C";

function bucketsForTabKey(tab: TabKey): BucketCode[] {
  if (tab === "ALL") return ["A", "B", "C"];
  return [tab];
}

const INITIAL_PAGES: Record<BucketCode, number> = { A: 1, B: 1, C: 1 };

const BUCKET_TITLE: Record<BucketCode, string> = {
  A: "위원회결정사항",
  B: "협의회결정사항",
  C: "품목분류사례",
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "A", label: "위원회결정사항" },
  { key: "B", label: "협의회결정사항" },
  { key: "C", label: "품목분류사례" },
];

type ListRow = {
  id: number;
  committee_type: string;
  committee_name: string;
  rrdc_no: string | null;
  reff_no: string | null;
  enfr_dt: string | null;
  cstm_nm: string | null;
  dtrm_hs_sgn: string | null;
  cmdt_nm: string | null;
  imge_cnt: number | null;
};

function str(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

/** 목록 그리드: 긴 텍스트(품명 등) 줄바꿈 표시 */
function listCellText(v: unknown): string {
  const s = str(v);
  if (s === "—") return s;
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** 단순 HS 형식(예: 6106.20-1000) — 목록에서 전체 표시 */
const SIMPLE_HS_LIST_PATTERN = /^\d{4}\.\d{2}-\d{2,4}$/;

const DTRM_HS_LIST_MAX_LEN = 20;

/** 목록 결정세번: 1234.56-0000 형식은 전체, 그 외 20자+… */
function formatListDtrmHsSgn(raw: unknown): { display: string; title: string } {
  const full = listCellText(raw);
  if (full === "—") return { display: full, title: full };
  const line = full.replace(/\s+/g, " ").trim();
  if (SIMPLE_HS_LIST_PATTERN.test(line)) {
    return { display: line, title: line };
  }
  if (line.length <= DTRM_HS_LIST_MAX_LEN) {
    return { display: line, title: line };
  }
  return {
    display: `${line.slice(0, DTRM_HS_LIST_MAX_LEN)}...`,
    title: line,
  };
}

/** 페이지당 건수·총건수에 따라 10페이지 단위 번호 구간(1–10, 11–20 …), 외국사례와 동일 */
const PAGE_NUMBER_WINDOW = 10;

function domesticVisiblePageNumbers(
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

/** API 응답 한 버킷 */
type BucketBlock = {
  rows: ListRow[];
  total: number;
  page: number;
  pageSize: number;
};

export default function ItemClassificationDomesticCasesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("ALL");
  const [form, setForm] = useState({
    reff_no: "",
    dtrm_hs_sgn: "",
    enfr_dt_from: "",
    enfr_dt_to: "",
    cmdt_nm: "",
    cmdt_desc: "",
    dtrm_rsn_cn: "",
    keyword: "",
  });
  const [pageSize, setPageSize] = useState(10);
  const [since2006, setSince2006] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasSearched, setHasSearched] = useState(false);

  const [bucketPages, setBucketPages] =
    useState<Record<BucketCode, number>>(INITIAL_PAGES);
  const bucketPagesRef = useRef(bucketPages);

  bucketPagesRef.current = bucketPages;

  const hasSearchedRef = useRef(false);

  const [bucketTotals, setBucketTotals] = useState<Record<BucketCode, number>>({
    A: 0,
    B: 0,
    C: 0,
  });
  const [bucketRows, setBucketRows] = useState<
    Record<BucketCode, ListRow[]>
  >({ A: [], B: [], C: [] });

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailCaseId, setDetailCaseId] = useState<number | null>(null);
  const [detailBucket, setDetailBucket] = useState<BucketCode | null>(null);
  const [detailRecord, setDetailRecord] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [detailImages, setDetailImages] = useState<
    {
      id: number;
      image_seq: number;
      download_status: string;
      content_type: string | null;
      image_size: number | null;
    }[]
  >([]);

  const groupedFetch = useCallback(
    async (opts: {
      buckets: BucketCode[];
      resetVisiblePages?: boolean;
      pageMap?: Partial<Record<BucketCode, number>>;
      pageSizeUsed?: number;
    }) => {
      if (!clientHasCriterion(form)) return;

      const buckets = opts.buckets;
      const nextPages: Record<BucketCode, number> = {
        ...bucketPagesRef.current,
      };
      if (opts.resetVisiblePages) {
        for (const b of buckets) nextPages[b] = 1;
      } else if (opts.pageMap) {
        Object.assign(nextPages, opts.pageMap);
      }
      bucketPagesRef.current = nextPages;
      setBucketPages(nextPages);

      const bucketPagesPayload: Partial<Record<BucketCode, number>> = {};
      for (const b of buckets) bucketPagesPayload[b] = nextPages[b];

      const ps =
        opts.pageSizeUsed ??
        Math.min(100, Math.max(5, Math.floor(Number(pageSize) || 10)));

      setError(null);
      setLoading(true);

      try {
        const res = await fetch("/api/domestic-hs-classification/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            grouped: true,
            buckets,
            bucketPages: bucketPagesPayload,
            pageSize: ps,
            since2006,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");

        const rawBuckets = data.buckets as Partial<
          Record<string, BucketBlock>
        >;

        setBucketTotals((prev) => {
          const n = { ...prev };
          for (const b of buckets) {
            const block = rawBuckets[b];
            if (block != null && typeof block.total === "number") {
              n[b] = block.total;
            }
          }
          return n;
        });

        setBucketRows((prev) => {
          const n = { ...prev };
          for (const b of buckets) {
            const block = rawBuckets[b];
            const rows = Array.isArray(block?.rows)
              ? (block.rows as ListRow[])
              : [];
            if (block != null) n[b] = rows;
          }
          return n;
        });

        setBucketPages(() => {
          const merged = { ...bucketPagesRef.current };
          for (const b of buckets) {
            const block = rawBuckets[b];
            if (block != null && typeof block.page === "number") {
              merged[b] = block.page;
            }
          }
          bucketPagesRef.current = merged;
          return merged;
        });

        setHasSearched(true);
        hasSearchedRef.current = true;
        setDetailCaseId(null);
        setDetailBucket(null);
        setDetailRecord(null);
        setDetailImages([]);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "조회 중 오류가 발생했습니다.";
        setError(msg);
        setHasSearched(false);
        hasSearchedRef.current = false;
        setBucketRows({ A: [], B: [], C: [] });
        setBucketTotals({ A: 0, B: 0, C: 0 });
        setDetailCaseId(null);
        setDetailBucket(null);
        setDetailRecord(null);
        setDetailImages([]);
      } finally {
        setLoading(false);
      }
    },
    [form, pageSize, since2006],
  );

  const groupedFetchRef = useRef(groupedFetch);
  groupedFetchRef.current = groupedFetch;

  const runSearchReload = useCallback(async () => {
    if (!clientHasCriterion(form)) {
      setError("조회 조건을 한 가지 이상 입력하세요.");
      setHasSearched(false);
      hasSearchedRef.current = false;
      setBucketRows({ A: [], B: [], C: [] });
      setBucketTotals({ A: 0, B: 0, C: 0 });
      setBucketPages(INITIAL_PAGES);
      bucketPagesRef.current = INITIAL_PAGES;
      setDetailCaseId(null);
      setDetailBucket(null);
      setDetailRecord(null);
      setDetailImages([]);
      setDetailError(null);
      return;
    }
    const b = bucketsForTabKey(activeTab);
    await groupedFetch({ buckets: b, resetVisiblePages: true });
  }, [activeTab, form, groupedFetch]);

  const clearSearchResults = useCallback(() => {
    setError(null);
    setHasSearched(false);
    hasSearchedRef.current = false;
    setBucketPages(INITIAL_PAGES);
    bucketPagesRef.current = INITIAL_PAGES;
    setBucketTotals({ A: 0, B: 0, C: 0 });
    setBucketRows({ A: [], B: [], C: [] });
    setDetailCaseId(null);
    setDetailBucket(null);
    setDetailRecord(null);
    setDetailImages([]);
    setDetailError(null);
  }, []);

  const resetForm = useCallback(() => {
    setForm({
      reff_no: "",
      dtrm_hs_sgn: "",
      enfr_dt_from: "",
      enfr_dt_to: "",
      cmdt_nm: "",
      cmdt_desc: "",
      dtrm_rsn_cn: "",
      keyword: "",
    });
    setSince2006(false);
    clearSearchResults();
  }, [clearSearchResults]);

  useEffect(() => {
    setDetailCaseId(null);
    setDetailBucket(null);
    setDetailRecord(null);
    setDetailImages([]);
    setDetailError(null);
    if (!hasSearchedRef.current) return;
    void groupedFetchRef.current({
      buckets: bucketsForTabKey(activeTab),
    });
  }, [activeTab]);

  const loadDetail = useCallback(async (caseId: number, bucket: BucketCode) => {
    setDetailLoading(true);
    setDetailError(null);
    setDetailBucket(bucket);
    setDetailCaseId(caseId);
    setDetailRecord(null);
    setDetailImages([]);
    try {
      const res = await fetch(
        `/api/domestic-hs-classification/case?caseId=${encodeURIComponent(String(caseId))}&since2006=${since2006 ? "1" : "0"}`,
      );
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "상세 조회 실패");
      }
      setDetailCaseId(caseId);
      setDetailRecord(data.record as Record<string, unknown>);
      setDetailImages(Array.isArray(data.images) ? data.images : []);

      queueMicrotask(() => {
        const el =
          typeof document !== "undefined"
            ? document.getElementById(`domestic-case-detail-${bucket}`)
            : null;
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      setDetailError(
        e instanceof Error ? e.message : "상세 조회 중 오류가 발생했습니다.",
      );
      setDetailCaseId(null);
      setDetailRecord(null);
      setDetailImages([]);
    } finally {
      setDetailLoading(false);
    }
  }, [since2006]);

  const visibleBuckets = bucketsForTabKey(activeTab);

  const changeBucketPage = useCallback(
    async (bucket: BucketCode, nextPage: number) => {
      const p = Math.max(1, nextPage);
      await groupedFetch({ buckets: [bucket], pageMap: { [bucket]: p } });
    },
    [groupedFetch],
  );

  const onPageSizeSelect = useCallback(
    async (n: number) => {
      setPageSize(n);
      if (!hasSearched) return;
      if (!clientHasCriterion(form)) return;
      const b = bucketsForTabKey(activeTab);
      await groupedFetch({
        buckets: b,
        resetVisiblePages: true,
        pageSizeUsed: n,
      });
    },
    [activeTab, form, groupedFetch, hasSearched],
  );

  return (
    <div className="min-h-full bg-slate-100 p-4 text-slate-800 sm:p-6">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5">
        <CasPageHeader title="품목분류 국내사례" />

        <div className="overflow-hidden rounded-lg border border-stone-300 bg-[#f5f2ea] shadow-sm ring-1 ring-stone-200/80">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-stone-300 bg-[#e8e4dc] px-2 pt-2">
            <div className="flex flex-wrap gap-1">
              {TABS.map((t) => {
                const sel = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={`rounded-t-lg px-3 py-2 text-xs font-semibold transition-colors sm:px-4 sm:py-2.5 sm:text-sm ${
                      sel
                        ? "relative z-[1] bg-[#1e2f4f] text-white shadow-sm"
                        : "text-slate-700 hover:bg-white/70"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="mb-px inline-flex items-center gap-1 rounded border border-[#1e2f4f]/40 bg-[#1e2f4f]/5 px-2.5 py-1.5 text-[11px] font-medium text-[#1e2f4f] hover:bg-[#1e2f4f]/10"
              disabled
            >
              검색 가이드
            </button>
          </div>

          <div className="divide-y divide-stone-300 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-stone-300">
              <ClassificationFormSplitField label="참조번호">
                <input
                  className={CLASSIFICATION_FORM_INPUT_CLASS}
                  value={form.reff_no}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, reff_no: e.target.value }))
                  }
                />
              </ClassificationFormSplitField>
              <ClassificationFormSplitField label="결정세번">
                <input
                  className={`${CLASSIFICATION_FORM_INPUT_CLASS} font-mono`}
                  value={form.dtrm_hs_sgn}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, dtrm_hs_sgn: e.target.value }))
                  }
                />
              </ClassificationFormSplitField>
            </div>

            <ClassificationFormSplitField label="시행일자" compact>
              <EnforcementDateRangePicker
                from={form.enfr_dt_from}
                to={form.enfr_dt_to}
                onConfirm={(from, to) =>
                  setForm((p) => ({ ...p, enfr_dt_from: from, enfr_dt_to: to }))
                }
              />
            </ClassificationFormSplitField>

            <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-stone-300">
              <ClassificationFormSplitField label="품명">
                <input
                  className={CLASSIFICATION_FORM_INPUT_CLASS}
                  value={form.cmdt_nm}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, cmdt_nm: e.target.value }))
                  }
                />
              </ClassificationFormSplitField>
              <ClassificationFormSplitField label="물품설명">
                <input
                  className={CLASSIFICATION_FORM_INPUT_CLASS}
                  value={form.cmdt_desc}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, cmdt_desc: e.target.value }))
                  }
                />
              </ClassificationFormSplitField>
            </div>

            <ClassificationFormSplitField label="결정사유">
              <input
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={form.dtrm_rsn_cn}
                onChange={(e) =>
                  setForm((p) => ({ ...p, dtrm_rsn_cn: e.target.value }))
                }
              />
            </ClassificationFormSplitField>

            <ClassificationFormSplitField label="검색어">
              <input
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={form.keyword}
                placeholder="예: 활성탄, 9506 등"
                onChange={(e) =>
                  setForm((p) => ({ ...p, keyword: e.target.value }))
                }
              />
            </ClassificationFormSplitField>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-300 bg-[#ebe8df] px-4 py-3">
            <p className="max-w-xl text-[11px] leading-snug text-red-700">
              썸네일 등이 깨져 보일 때 브라우저 캐시를 비운 뒤 (Ctrl+F5) 다시 조회해
              보세요.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-stone-300 text-blue-600 focus:ring-blue-500"
                  checked={since2006}
                  onChange={(e) => {
                    setSince2006(e.target.checked);
                    clearSearchResults();
                  }}
                />
                2006이후
              </label>
              <CasResetButton type="button" disabled={loading} onClick={resetForm} />
              <CasSearchButton
                type="button"
                disabled={loading}
                onClick={() => void runSearchReload()}
              >
                {loading ? "조회 중…" : "조회"}
              </CasSearchButton>
            </div>
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {hasSearched && (
          <>
            <ClipGridStatsBar
              total={0}
              pageSize={pageSize}
              loading={loading}
              showTotal={false}
              onPageSizeChange={(size) => void onPageSizeSelect(size)}
            />

            <div className="flex flex-col gap-10">
              {visibleBuckets.map((bucket) => {
                const rows = bucketRows[bucket];
                const total = bucketTotals[bucket] ?? 0;
                const curPage =
                  bucketPages[bucket] ??
                  bucketPagesRef.current[bucket] ??
                  1;
                const ps = Math.min(
                  100,
                  Math.max(5, Math.floor(Number(pageSize) || 10)),
                );
                const totalPg = Math.max(1, Math.ceil((total || 0) / ps));
                const pageNumbers = domesticVisiblePageNumbers(
                  curPage,
                  totalPg,
                  PAGE_NUMBER_WINDOW,
                );
                const title = BUCKET_TITLE[bucket];

                return (
                  <section
                    key={bucket}
                    className="overflow-hidden rounded-lg border border-[#e5e9ef] bg-white shadow-sm"
                  >
                    <div className="border-b border-[#e5e9ef] bg-[#fafbfc] px-4 py-2.5">
                      <h3 className="text-[12px] font-semibold text-[#333]">
                        {title}
                      </h3>
                    </div>

                    <div className="px-4 py-3.5">
                      <ClipGridStatsBar
                        total={total}
                        pageSize={pageSize}
                        loading={loading}
                        showPageSize={false}
                        onPageSizeChange={() => {}}
                      />

                      <ClipGridTable>
                        <colgroup>
                          <col style={{ width: "11%" }} />
                          <col style={{ width: "14%" }} />
                          <col style={{ width: "18%" }} />
                          <col style={{ width: "15%" }} />
                          <col style={{ width: "10%" }} />
                          <col style={{ width: "32%" }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <ClipGridTh>시행일자</ClipGridTh>
                            <ClipGridTh>시행기관</ClipGridTh>
                            <ClipGridTh>참조번호</ClipGridTh>
                            <ClipGridTh>결정세번</ClipGridTh>
                            <ClipGridTh className="whitespace-nowrap">
                              이미지건수
                            </ClipGridTh>
                            <ClipGridTh>품명</ClipGridTh>
                          </tr>
                        </thead>
                        <tbody>
                          {(rows ?? []).length === 0 && (
                            <ClipGridEmptyRow
                              colSpan={6}
                              loading={loading}
                            />
                          )}
                          {(rows ?? []).length > 0 &&
                            (rows ?? []).map((r) => (
                              <tr
                                key={r.id}
                                className={`${clipGridRowHoverClass} ${
                                  detailCaseId === r.id && detailBucket === bucket
                                    ? "bg-[#1e2f4f]/5"
                                    : ""
                                }`}
                              >
                                <ClipGridDateCell title={str(r.enfr_dt)}>
                                  {str(r.enfr_dt)}
                                </ClipGridDateCell>
                                <ClipGridLabelCell align="left" title={str(r.cstm_nm)}>
                                  {str(r.cstm_nm)}
                                </ClipGridLabelCell>
                                <ClipGridLinkTruncateCell
                                  label={str(r.reff_no)}
                                  title={str(r.reff_no)}
                                  onClick={() => loadDetail(r.id, bucket)}
                                />
                                <ClipGridLabelCell
                                  className={clipGridMonoClass}
                                  title={(() => {
                                    const hs = formatListDtrmHsSgn(r.dtrm_hs_sgn);
                                    return hs.title;
                                  })()}
                                >
                                  {(() => {
                                    const hs = formatListDtrmHsSgn(r.dtrm_hs_sgn);
                                    return hs.display;
                                  })()}
                                </ClipGridLabelCell>
                                <ClipGridTruncateCell align="center" title={String(r.imge_cnt ?? "—")}>
                                  {typeof r.imge_cnt === "number"
                                    ? r.imge_cnt
                                    : "—"}
                                </ClipGridTruncateCell>
                                <ClipGridLinkCell
                                  label={listCellText(r.cmdt_nm)}
                                  title={listCellText(r.cmdt_nm)}
                                  onClick={() => loadDetail(r.id, bucket)}
                                />
                              </tr>
                            ))}
                        </tbody>
                      </ClipGridTable>

                      {(rows ?? []).length > 0 && total > 0 && (
                        <ClipPaginationBar
                          curPageSafe={curPage}
                          totalPg={totalPg}
                          loading={loading}
                          block={pageNumbers}
                          onPage={(p) => void changeBucketPage(bucket, p)}
                        />
                      )}
                    </div>

                    <div
                      id={`domestic-case-detail-${bucket}`}
                      className="-scroll-mt-8"
                    />

                    {detailBucket === bucket && detailLoading && (
                      <p className="border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                        상세 불러오는 중…
                      </p>
                    )}
                    {detailBucket === bucket && detailError && !detailLoading && (
                      <p className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {detailError}
                      </p>
                    )}

                    {detailBucket === bucket &&
                      !detailLoading &&
                      detailCaseId !== null &&
                      detailRecord && (
                        <section className="border-t border-slate-300 bg-slate-50/80 shadow-inner print:border-0 print:bg-white print:shadow-none">
                          <div className="rounded-b-lg border-x border-b border-slate-300 bg-white shadow-sm print:border-0 print:shadow-none">
                            <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                              <h2 className="text-base font-semibold text-slate-900">
                                상세보기 ({BUCKET_TITLE[bucket]})
                              </h2>
                              <button
                                type="button"
                                onClick={() =>
                                  typeof window !== "undefined" &&
                                  window.print()
                                }
                                className="rounded border border-slate-300 px-3 py-1 text-xs print:hidden"
                              >
                                인쇄
                              </button>
                            </header>

                            <div className="grid gap-0 border-collapse text-[13px] sm:grid-cols-[10rem_minmax(0,1fr)]">
                              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r">
                                참조번호
                              </div>
                              <div className="border-b border-slate-100 px-3 py-2">
                                {str(detailRecord.reff_no)}
                              </div>

                              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r">
                                시행일자
                              </div>
                              <div className="border-b border-slate-100 px-3 py-2">
                                {str(detailRecord.enfr_dt)}
                              </div>

                              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r">
                                시행기관
                              </div>
                              <div className="border-b border-slate-100 px-3 py-2">
                                {str(detailRecord.cstm_nm)}
                              </div>

                              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r align-top pt-3">
                                결정세번
                              </div>
                              <div className="border-b border-slate-100 px-3 py-2 align-top font-mono text-sm">
                                {str(detailRecord.dtrm_hs_sgn)}
                              </div>

                              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r align-top">
                                품명
                              </div>
                              <div className="border-b border-slate-100 px-3 py-2 whitespace-pre-wrap break-words">
                                {str(detailRecord.cmdt_nm)}
                              </div>

                              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r align-top">
                                물품설명
                              </div>
                              <div className="border-b border-slate-100 px-3 py-2 whitespace-pre-wrap break-words leading-relaxed">
                                {str(detailRecord.cmdt_desc)}
                              </div>

                              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r align-top">
                                결정사유
                              </div>
                              <div className="border-b border-slate-100 px-3 py-2 whitespace-pre-wrap break-words leading-relaxed">
                                {str(detailRecord.dtrm_rsn_cn)}
                              </div>

                              <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r">
                                이미지건수
                              </div>
                              <div className="border-b border-slate-100 px-3 py-2">
                                {str(detailRecord.imge_cnt)}
                              </div>

                              {detailImages.length > 0 && (
                                <>
                                  <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:flex sm:border-r sm:items-center">
                                    관련 이미지
                                  </div>
                                  <div className="border-b border-slate-100 px-3 py-2">
                                    <div className="flex flex-wrap items-start gap-4">
                                      {detailImages.map((im) => {
                                        if (im.download_status !== "success") {
                                          return (
                                            <figure
                                              key={im.id}
                                              className="rounded border border-amber-200 bg-amber-50/90 px-2 py-2 text-xs text-amber-900"
                                            >
                                              이미지 #{im.image_seq}:{" "}
                                              {im.download_status}
                                            </figure>
                                          );
                                        }
                                        const imgUrl = `/api/domestic-hs-classification/image?imageId=${encodeURIComponent(String(im.id))}&caseId=${encodeURIComponent(String(detailCaseId))}&since2006=${since2006 ? "1" : "0"}`;
                                        return (
                                          <figure
                                            key={im.id}
                                            className="flex max-w-[15rem] flex-col items-start gap-1"
                                          >
                                            <div className="border border-stone-300 bg-white p-1">
                                              {/* eslint-disable-next-line @next/next/no-img-element */}
                                              <img
                                                src={imgUrl}
                                                alt={`관련 이미지 ${im.image_seq}`}
                                                className="block h-auto max-h-[15rem] w-auto max-w-[15rem] object-contain"
                                                loading="lazy"
                                                decoding="async"
                                              />
                                            </div>
                                            <figcaption className="text-left text-[11px] text-slate-600">
                                              이미지 {im.image_seq}
                                            </figcaption>
                                          </figure>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </section>
                      )}
                  </section>
                );
              })}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
