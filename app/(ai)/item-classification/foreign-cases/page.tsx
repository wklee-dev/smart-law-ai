"use client";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  FOREIGN_BUCKET_LABEL,
  FOREIGN_HS_BUCKET_ORDER,
  foreignBucketAnchorId,
  foreignResultsTopAnchorId,
  type ForeignHsBucketCode,
} from "@/app/lib/foreign-hs-case-buckets";
import {
  foreignDetailFieldsForBucket,
  foreignDetailUsesLang,
  foreignListColumnLabel,
  foreignListPreviewKind,
  foreignListPreviewUsesLang,
  type ForeignDetailFieldDef,
  type ForeignI18nBase,
} from "@/app/lib/foreign-hs-case-display";
import type { ForeignCaseListRow } from "@/app/lib/foreign-hs-case-types";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import { CasResetButton, CasSearchButton } from "@/app/components/search-action-buttons";
import {
  ClipGridDateCell,
  ClipGridEmptyRow,
  ClipGridLabelCell,
  ClipGridLinkCell,
  ClipGridLinkTruncateCell,
  ClipGridStatsBar,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipGridTruncateCell,
  ClipPaginationBar,
  clipGridRowHoverClass,
  clipGridMonoClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import { useCallback, useRef, useState } from "react";
import { EnforcementDateRangePicker } from "../domestic-cases/enforcement-date-range-picker";

type TextLang = "org" | "eng" | "kor";

function clientHasCriterion(f: {
  ref_no: string;
  hs_code: string;
  enforce_date_from: string;
  enforce_date_to: string;
  keyword: string;
}): boolean {
  const keys = [
    f.ref_no,
    f.hs_code,
    f.keyword,
    f.enforce_date_from,
    f.enforce_date_to,
  ] as const;
  return keys.some((v) => v.trim().length > 0);
}

const EMPTY_PAGES: Record<ForeignHsBucketCode, number> = Object.fromEntries(
  FOREIGN_HS_BUCKET_ORDER.map((b) => [b, 1]),
) as Record<ForeignHsBucketCode, number>;

const ZERO_TOTALS: Record<ForeignHsBucketCode, number> = Object.fromEntries(
  FOREIGN_HS_BUCKET_ORDER.map((b) => [b, 0]),
) as Record<ForeignHsBucketCode, number>;

function freshEmptyRows(): Record<ForeignHsBucketCode, ForeignCaseListRow[]> {
  return Object.fromEntries(
    FOREIGN_HS_BUCKET_ORDER.map((b) => [b, [] as ForeignCaseListRow[]]),
  ) as Record<ForeignHsBucketCode, ForeignCaseListRow[]>;
}

const DEFAULT_LANG: Record<ForeignHsBucketCode, TextLang> = Object.fromEntries(
  FOREIGN_HS_BUCKET_ORDER.map((b) => [b, "org" as TextLang]),
) as Record<ForeignHsBucketCode, TextLang>;

type BucketBlock = {
  rows: ForeignCaseListRow[];
  total: number;
  page: number;
  pageSize: number;
};

function str(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

function goodsPreview(row: ForeignCaseListRow, lang: TextLang): string {
  if (lang === "eng") return row.goods_preview_eng;
  if (lang === "kor") return row.goods_preview_kor;
  return row.goods_preview_org;
}

function scalarOrDash(record: Record<string, unknown>, key: string): string {
  const v = record[key];
  if (v === null || v === undefined) return "—";
  const t = String(v).trim();
  return t.length > 0 ? t : "—";
}

function textField(
  record: Record<string, unknown>,
  base: ForeignI18nBase,
  lang: TextLang,
): string {
  const suf = lang === "org" ? "_org" : lang === "eng" ? "_eng" : "_kor";
  const v = record[`${base}${suf}`];
  if (v === null || v === undefined) return "";
  return String(v);
}

/** 언어별 필드 · 비어 있으면 대시 */
function textFieldOrDash(
  record: Record<string, unknown>,
  base: ForeignI18nBase,
  lang: TextLang,
): string {
  const t = textField(record, base, lang).trim();
  return t.length > 0 ? t : "—";
}

function renderDetailFieldValue(
  record: Record<string, unknown>,
  field: ForeignDetailFieldDef,
  lang: TextLang,
): string {
  if (field.type === "scalar") return scalarOrDash(record, field.key);
  return textFieldOrDash(record, field.base, lang);
}

/** `foreign_cases.image_count` 기준 — case_images 잔여 행과 불일치 방지 */
function foreignCaseImageCount(record: Record<string, unknown> | null): number {
  if (!record) return 0;
  const n = Number(record.image_count);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/** 페이지당 건수·총건수에 따라 10페이지 단위로 번호 구간 표시(1–10, 11–20 …) */
const PAGE_NUMBER_WINDOW = 10;

function foreignCaseVisiblePageNumbers(
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

type DetailImage = {
  id: number;
  seq: number;
  display_src: string | null;
};

export default function ItemClassificationForeignCasesPage() {
  const [form, setForm] = useState({
    ref_no: "",
    hs_code: "",
    enforce_date_from: "",
    enforce_date_to: "",
    keyword: "",
  });
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [bucketPages, setBucketPages] =
    useState<Record<ForeignHsBucketCode, number>>(EMPTY_PAGES);
  const bucketPagesRef = useRef(bucketPages);
  bucketPagesRef.current = bucketPages;

  const [bucketTotals, setBucketTotals] =
    useState<Record<ForeignHsBucketCode, number>>(ZERO_TOTALS);
  const [bucketRows, setBucketRows] = useState<
    Record<ForeignHsBucketCode, ForeignCaseListRow[]>
  >(() => freshEmptyRows());

  const [langByBucket, setLangByBucket] =
    useState<Record<ForeignHsBucketCode, TextLang>>(DEFAULT_LANG);

  const [detailSrno, setDetailSrno] = useState<string | null>(null);
  const [detailBucket, setDetailBucket] =
    useState<ForeignHsBucketCode | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRecord, setDetailRecord] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [detailImages, setDetailImages] = useState<DetailImage[]>([]);

  const groupedFetch = useCallback(
    async (opts: {
      buckets: ForeignHsBucketCode[];
      resetVisiblePages?: boolean;
      pageMap?: Partial<Record<ForeignHsBucketCode, number>>;
      pageSizeUsed?: number;
    }) => {
      if (!clientHasCriterion(form)) return;

      const buckets = opts.buckets;
      const nextPages: Record<ForeignHsBucketCode, number> = {
        ...bucketPagesRef.current,
      };
      if (opts.resetVisiblePages) {
        for (const b of buckets) nextPages[b] = 1;
      } else if (opts.pageMap) {
        Object.assign(nextPages, opts.pageMap);
      }
      bucketPagesRef.current = nextPages;
      setBucketPages(nextPages);

      const bucketPagesPayload: Partial<Record<ForeignHsBucketCode, number>> =
        {};
      for (const b of buckets) bucketPagesPayload[b] = nextPages[b];

      const ps =
        opts.pageSizeUsed ??
        Math.min(100, Math.max(5, Math.floor(Number(pageSize) || 10)));

      setError(null);
      setLoading(true);

      try {
        const res = await fetch("/api/foreign-hs-classification/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enforce_date_from: form.enforce_date_from,
            enforce_date_to: form.enforce_date_to,
            ref_no: form.ref_no,
            hs_code: form.hs_code,
            keyword: form.keyword,
            grouped: true,
            buckets: FOREIGN_HS_BUCKET_ORDER,
            bucketPages: bucketPagesPayload,
            pageSize: ps,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "조회에 실패했습니다.");

        const rawBuckets = data.buckets as Partial<
          Record<string, BucketBlock>
        >;

        setBucketTotals((prev) => {
          const n = { ...prev };
          for (const b of FOREIGN_HS_BUCKET_ORDER) {
            const block = rawBuckets[b];
            if (block != null && typeof block.total === "number") {
              n[b] = block.total;
            }
          }
          return n;
        });

        setBucketRows((prev) => {
          const n = { ...prev };
          for (const b of FOREIGN_HS_BUCKET_ORDER) {
            const block = rawBuckets[b];
            const rows = Array.isArray(block?.rows)
              ? (block.rows as ForeignCaseListRow[])
              : [];
            if (block != null) n[b] = rows;
          }
          return n;
        });

        setBucketPages(() => {
          const merged = { ...bucketPagesRef.current };
          for (const b of FOREIGN_HS_BUCKET_ORDER) {
            const block = rawBuckets[b];
            if (block != null && typeof block.page === "number") {
              merged[b] = block.page;
            }
          }
          bucketPagesRef.current = merged;
          return merged;
        });

        setHasSearched(true);
        setDetailSrno(null);
        setDetailBucket(null);
        setDetailRecord(null);
        setDetailImages([]);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "조회 중 오류가 발생했습니다.";
        setError(msg);
        setHasSearched(false);
        setBucketRows(freshEmptyRows());
        setBucketTotals(ZERO_TOTALS);
      } finally {
        setLoading(false);
      }
    },
    [form, pageSize],
  );

  const runSearchReload = useCallback(async () => {
    if (!clientHasCriterion(form)) {
      setError("조회 조건을 한 가지 이상 입력하세요.");
      setHasSearched(false);
      setBucketRows(freshEmptyRows());
      setBucketTotals(ZERO_TOTALS);
      setBucketPages(EMPTY_PAGES);
      bucketPagesRef.current = EMPTY_PAGES;
      return;
    }
    await groupedFetch({
      buckets: [...FOREIGN_HS_BUCKET_ORDER],
      resetVisiblePages: true,
    });
  }, [form, groupedFetch]);

  const resetForm = useCallback(() => {
    setForm({
      ref_no: "",
      hs_code: "",
      enforce_date_from: "",
      enforce_date_to: "",
      keyword: "",
    });
    setError(null);
    setHasSearched(false);
    setBucketPages(EMPTY_PAGES);
    bucketPagesRef.current = EMPTY_PAGES;
    setBucketTotals(ZERO_TOTALS);
    setBucketRows(freshEmptyRows());
    setLangByBucket(DEFAULT_LANG);
    setDetailSrno(null);
    setDetailBucket(null);
    setDetailRecord(null);
    setDetailImages([]);
    setDetailError(null);
  }, []);

  const loadDetail = useCallback(
    async (srno: string, bucket: ForeignHsBucketCode) => {
      setDetailLoading(true);
      setDetailError(null);
      setDetailBucket(bucket);
      setDetailSrno(srno);
      setDetailRecord(null);
      setDetailImages([]);
      try {
        const q = `/api/foreign-hs-classification/case?srno=${encodeURIComponent(srno)}`;
        const res = await fetch(q);
        const data = await res.json();
        if (!data.ok) {
          throw new Error(data.error || "상세 조회 실패");
        }
        setDetailSrno(srno);
        setDetailRecord(data.record as Record<string, unknown>);
        const rawImg = Array.isArray(data.images) ? data.images : [];
        const mapped: DetailImage[] = rawImg.map(
          (x: { id: number; seq: number; display_src?: string | null }) => ({
            id: Number(x.id),
            seq: Number(x.seq),
            display_src:
              typeof x.display_src === "string" ? x.display_src : null,
          }),
        );
        setDetailImages(mapped);

        queueMicrotask(() => {
          document
            .getElementById(`foreign-case-detail-${bucket}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } catch (e) {
        setDetailError(
          e instanceof Error ? e.message : "상세 조회 중 오류가 발생했습니다.",
        );
        setDetailSrno(null);
        setDetailRecord(null);
        setDetailImages([]);
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const changeBucketPage = useCallback(
    async (bucket: ForeignHsBucketCode, nextPage: number) => {
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
      await groupedFetch({
        buckets: [...FOREIGN_HS_BUCKET_ORDER],
        resetVisiblePages: true,
        pageSizeUsed: n,
      });
    },
    [form, groupedFetch, hasSearched],
  );

  const scrollToCountry = useCallback((code: string | "TOP") => {
    if (code === "TOP") {
      document
        .getElementById(foreignResultsTopAnchorId())
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    document
      .getElementById(foreignBucketAnchorId(code))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="min-h-full bg-slate-100 p-4 text-slate-800 sm:p-6">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5">
        <CasPageHeader title="품목분류 외국사례" />

        <div className="overflow-hidden rounded-lg border border-stone-300 bg-[#f5f2ea] shadow-sm ring-1 ring-stone-200/80">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-stone-300 bg-[#e8e4dc] px-2 pt-2">
            <p className="px-1 pb-2 text-[11px] font-semibold text-slate-700 sm:text-xs">
              바로가기 (조회 후 국가·권역으로 이동)
            </p>
            <button
              type="button"
              className="mb-px inline-flex items-center gap-1 rounded border border-[#1e2f4f]/40 bg-[#1e2f4f]/5 px-2.5 py-1.5 text-[11px] font-medium text-[#1e2f4f] hover:bg-[#1e2f4f]/10"
              disabled
            >
              검색 가이드
            </button>
          </div>
          <div className="border-b border-stone-300 bg-white px-2 pb-2 pt-1">
            <div className="grid grid-cols-5 gap-1 sm:grid-cols-10">
              <button
                type="button"
                disabled={!hasSearched}
                onClick={() => scrollToCountry("TOP")}
                className={`rounded border px-1 py-2 text-[11px] font-semibold sm:text-xs ${
                  hasSearched
                    ? "border-[#1e2f4f] bg-[#1e2f4f] text-white hover:bg-[#162438]"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                }`}
              >
                전체
              </button>
              {FOREIGN_HS_BUCKET_ORDER.map((code) => (
                <button
                  key={code}
                  type="button"
                  disabled={!hasSearched}
                  onClick={() => scrollToCountry(code)}
                  className={`truncate rounded border px-1 py-2 text-[11px] sm:text-xs ${
                    hasSearched
                      ? "border-slate-300 bg-slate-50 text-slate-800 hover:bg-blue-50"
                      : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                  }`}
                  title={FOREIGN_BUCKET_LABEL[code]}
                >
                  {FOREIGN_BUCKET_LABEL[code]}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-stone-300 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-stone-300">
              <ClassificationFormSplitField label="참조번호">
                <input
                  className={CLASSIFICATION_FORM_INPUT_CLASS}
                  value={form.ref_no}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, ref_no: e.target.value }))
                  }
                />
              </ClassificationFormSplitField>
              <ClassificationFormSplitField label="결정세번">
                <input
                  className={`${CLASSIFICATION_FORM_INPUT_CLASS} font-mono`}
                  value={form.hs_code}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, hs_code: e.target.value }))
                  }
                />
              </ClassificationFormSplitField>
            </div>

            <ClassificationFormSplitField label="시행일자" compact>
              <EnforcementDateRangePicker
                from={form.enforce_date_from}
                to={form.enforce_date_to}
                onConfirm={(from, to) =>
                  setForm((p) => ({
                    ...p,
                    enforce_date_from: from,
                    enforce_date_to: to,
                  }))
                }
              />
            </ClassificationFormSplitField>

            <ClassificationFormSplitField label="검색어">
              <input
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={form.keyword}
                placeholder="예: terminal, HS 코드, 물품 설명 키워드 등"
                onChange={(e) =>
                  setForm((p) => ({ ...p, keyword: e.target.value }))
                }
              />
            </ClassificationFormSplitField>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-300 bg-[#ebe8df] px-4 py-3">
            <p className="max-w-xl text-[11px] leading-snug text-slate-700">
              조회 조건은 <strong>한 가지 이상</strong> 입력해야 합니다.
            </p>
            <div className="flex flex-wrap gap-2">
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
            <div id={foreignResultsTopAnchorId()} className="-scroll-mt-24" />

            <div className="flex flex-wrap justify-end gap-2">
              <label className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600 shadow-sm">
                페이지당 (공통)
                <select
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs"
                  value={pageSize}
                  onChange={(e) =>
                    void onPageSizeSelect(Number(e.target.value) || 10)
                  }
                  disabled={loading}
                >
                  {[10, 20, 50].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-10">
              {FOREIGN_HS_BUCKET_ORDER.map((bucket) => {
                const rows = bucketRows[bucket];
                const total = bucketTotals[bucket] ?? 0;
                const curPage =
                  bucketPages[bucket] ?? bucketPagesRef.current[bucket] ?? 1;
                const ps = Math.min(
                  100,
                  Math.max(5, Math.floor(Number(pageSize) || 10)),
                );
                const totalPg = Math.max(1, Math.ceil((total || 0) / ps));
                const title = FOREIGN_BUCKET_LABEL[bucket];
                const lang = langByBucket[bucket] ?? "org";
                const showCountryCol = bucket === "EU";
                const listPreviewKind = foreignListPreviewKind(bucket);
                const listTextColLabel = foreignListColumnLabel(listPreviewKind);
                const listUsesLang = foreignListPreviewUsesLang(listPreviewKind);
                const detailUsesLang = foreignDetailUsesLang(bucket);
                const detailFields = foreignDetailFieldsForBucket(bucket);
                const pageNumbers = foreignCaseVisiblePageNumbers(
                  curPage,
                  totalPg,
                  PAGE_NUMBER_WINDOW,
                );

                const setLang = (next: TextLang) =>
                  setLangByBucket((p) => ({ ...p, [bucket]: next }));

                return (
                  <section
                    key={bucket}
                    id={foreignBucketAnchorId(bucket)}
                    className="scroll-mt-24 overflow-hidden rounded-lg border border-[#e5e9ef] bg-white shadow-sm"
                  >
                    <div className="border-b border-[#e5e9ef] bg-[#fafbfc] px-4 py-3">
                      <div className="flex items-start gap-2 border-l-4 border-[#1e2f4f] pl-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[12px] font-semibold text-[#1e2f4f]">
                            {title}
                          </h3>
                        </div>
                        {listUsesLang && (
                          <div className="flex shrink-0 gap-1">
                            {(
                              [
                                ["org", "원문"],
                                ["eng", "영문"],
                                ["kor", "국문"],
                              ] as const
                            ).map(([k, lab]) => {
                              const sel = lang === k;
                              return (
                                <button
                                  key={k}
                                  type="button"
                                  onClick={() => setLang(k)}
                                  className={`rounded border px-2 py-1 text-[11px] font-semibold sm:text-xs ${
                                    sel
                                      ? "border-[#1e2f4f] bg-[#1e2f4f] text-white"
                                      : "border-[#d8dee6] bg-white text-[#666] hover:bg-[#f8fafc]"
                                  }`}
                                >
                                  {lab}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-4 py-3.5">
                      <ClipGridStatsBar
                        total={total}
                        pageSize={pageSize}
                        loading={loading}
                        onPageSizeChange={(size) => void onPageSizeSelect(size)}
                      />

                      <ClipGridTable>
                        <colgroup>
                          {showCountryCol ? (
                            <col style={{ width: "5%" }} />
                          ) : null}
                          <col style={{ width: "11%" }} />
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "15%" }} />
                          <col style={{ width: "10%" }} />
                          <col
                            style={{
                              width: showCountryCol ? "43%" : "48%",
                            }}
                          />
                        </colgroup>
                        <thead>
                          <tr>
                            {showCountryCol && (
                              <ClipGridTh>국가</ClipGridTh>
                            )}
                            <ClipGridTh>시행일자</ClipGridTh>
                            <ClipGridTh>참조번호</ClipGridTh>
                            <ClipGridTh>결정세번</ClipGridTh>
                            <ClipGridTh>이미지건수</ClipGridTh>
                            <ClipGridTh>{listTextColLabel}</ClipGridTh>
                          </tr>
                        </thead>
                        <tbody>
                          {(rows ?? []).length === 0 && (
                            <ClipGridEmptyRow
                              colSpan={showCountryCol ? 6 : 5}
                              loading={loading}
                            />
                          )}
                          {(rows ?? []).length > 0 &&
                            (rows ?? []).map((r) => {
                              const srno = String(r.prlst_clsf_srno ?? "").trim();
                              const canOpen = srno.length > 0;
                              const selected =
                                detailSrno != null &&
                                srno.length > 0 &&
                                detailSrno === srno;
                              const gText = goodsPreview(r, lang);
                              const refNo = str(r.ref_no);
                              return (
                                <tr
                                  key={`${bucket}-${r.id}`}
                                  className={`${clipGridRowHoverClass} ${
                                    selected ? "bg-[#1e2f4f]/5" : ""
                                  }`}
                                >
                                  {showCountryCol && (
                                    <ClipGridLabelCell title={str(r.country)}>
                                      {str(r.country)}
                                    </ClipGridLabelCell>
                                  )}
                                  <ClipGridDateCell title={str(r.enforce_date)}>
                                    {str(r.enforce_date)}
                                  </ClipGridDateCell>
                                  <ClipGridLinkTruncateCell
                                    label={refNo}
                                    title={refNo}
                                    disabled={!canOpen}
                                    onClick={() => {
                                      if (canOpen) void loadDetail(srno, bucket);
                                    }}
                                  />
                                  <ClipGridTruncateCell
                                    className={clipGridMonoClass}
                                    title={str(r.hs_code)}
                                  >
                                    {str(r.hs_code)}
                                  </ClipGridTruncateCell>
                                  <ClipGridTruncateCell
                                    align="center"
                                    title={String(r.image_count ?? "—")}
                                  >
                                    {typeof r.image_count === "number"
                                      ? r.image_count
                                      : "—"}
                                  </ClipGridTruncateCell>
                                  <ClipGridLinkCell
                                    label={gText || "—"}
                                    title={gText || undefined}
                                    disabled={!canOpen}
                                    onClick={() => {
                                      if (canOpen) void loadDetail(srno, bucket);
                                    }}
                                  />
                                </tr>
                              );
                            })}
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
                      id={`foreign-case-detail-${bucket}`}
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
                      detailSrno !== null &&
                      detailRecord && (
                      <section className="border-t border-slate-300 bg-slate-50/80 px-0 shadow-inner print:border-0 print:bg-white print:shadow-none">
                        <div className="rounded-b-lg border-x border-b border-slate-300 bg-white shadow-sm print:border-0 print:shadow-none">
                          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                            <h2 className="text-base font-semibold text-slate-900">
                              상세보기 ({FOREIGN_BUCKET_LABEL[bucket]})
                            </h2>
                            <div className="flex flex-wrap items-center gap-2 print:hidden">
                              {detailUsesLang &&
                                (
                                  [
                                    ["org", "원문"],
                                    ["eng", "영문"],
                                    ["kor", "국문"],
                                  ] as const
                                ).map(([k, lab]) => {
                                  const sel = lang === k;
                                  return (
                                    <button
                                      key={k}
                                      type="button"
                                      onClick={() =>
                                        setLangByBucket((prev) => ({
                                          ...prev,
                                          [bucket]: k,
                                        }))
                                      }
                                      className={`rounded border px-2 py-1 text-[11px] font-semibold sm:text-xs ${
                                        sel
                                          ? "border-[#1e2f4f] bg-[#1e2f4f] text-white"
                                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                      }`}
                                    >
                                      {lab}
                                    </button>
                                  );
                                })}
                              <button
                                type="button"
                                onClick={() =>
                                  typeof window !== "undefined" &&
                                  window.print()
                                }
                                className="rounded border border-slate-300 px-3 py-1 text-xs"
                              >
                                인쇄
                              </button>
                            </div>
                          </header>

                          <div className="grid gap-0 border-collapse px-0 text-[13px] sm:grid-cols-[10rem_minmax(0,1fr)]">
                            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r">
                              기준년도
                            </div>
                            <div className="border-b border-slate-100 px-3 py-2">
                              {str(detailRecord.base_year)}
                            </div>

                            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r">
                              참조번호
                            </div>
                            <div className="border-b border-slate-100 px-3 py-2">
                              {str(detailRecord.ref_no)}
                            </div>

                            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r">
                              시행일자
                            </div>
                            <div className="border-b border-slate-100 px-3 py-2">
                              {str(detailRecord.enforce_date)}
                            </div>

                            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r align-top pt-3">
                              결정세번
                            </div>
                            <div className="border-b border-slate-100 px-3 py-2 align-top font-mono text-sm">
                              {str(detailRecord.hs_code)}
                            </div>

                            {detailFields.map((field) => (
                              <div key={field.label} className="contents">
                                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-medium text-slate-700 sm:border-r align-top">
                                  {field.label}
                                </div>
                                <div className="border-b border-slate-100 px-3 py-2 whitespace-pre-wrap break-words leading-relaxed">
                                  {renderDetailFieldValue(
                                    detailRecord,
                                    field,
                                    lang,
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          {(() => {
                            const visibleDetailImages =
                              foreignCaseImageCount(detailRecord) > 0
                                ? detailImages.filter((im) => im.display_src)
                                : [];
                            if (visibleDetailImages.length === 0) return null;
                            return (
                            <div className="border-t border-slate-200 px-4 py-4">
                              <h3 className="mb-3 text-sm font-semibold text-slate-900">
                                관련 이미지
                              </h3>
                              <div
                                className={`grid gap-4 ${
                                  visibleDetailImages.length <= 1
                                    ? "grid-cols-1"
                                    : "grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3"
                                }`}
                              >
                                {visibleDetailImages.map((im) => {
                                  return (
                                    <figure
                                      key={im.id}
                                      className="flex w-full min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                                    >
                                      <div className="flex min-h-[12rem] w-full items-center justify-center bg-slate-50/95 p-2 sm:min-h-[16rem] sm:p-3">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        {typeof im.display_src === "string" &&
                                        im.display_src.trim() !== "" ? (
                                          <img
                                            src={im.display_src}
                                            alt={`이미지 ${im.seq}`}
                                            className="mx-auto block h-auto max-h-[min(85vh,56rem)] w-full object-contain"
                                            loading="lazy"
                                            decoding="async"
                                          />
                                        ) : null}
                                      </div>
                                      <figcaption className="border-t border-slate-100 px-2 py-1.5 text-center text-[11px] text-slate-500">
                                        이미지 {im.seq}
                                      </figcaption>
                                    </figure>
                                  );
                                })}
                              </div>
                            </div>
                            );
                          })()}
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
