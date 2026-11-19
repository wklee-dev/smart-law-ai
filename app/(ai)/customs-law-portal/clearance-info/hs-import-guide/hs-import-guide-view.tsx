"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasResetButton,
  CasSearchButton,
  CasSecondaryButton,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { HsImportGuideDetailModal } from "@/app/(ai)/customs-law-portal/clearance-info/hs-import-guide/hs-import-guide-detail-modal";
import {
  ClipGridEmptyRow,
  ClipGridStatsBar,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipPaginationBar,
  ClipSortThButton,
  clipGridLinkClass,
  clipGridMonoClass,
  clipGridRowHoverClass,
  clipGridSeqClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import { formatClipCustomsChiefHsInput } from "@/app/lib/clip-customs-chief-shared";
import type {
  ClipHsImportGuideDetail,
  ClipHsImportGuideListRow,
  ClipHsImportGuidePdfInfo,
  ClipHsImportGuideSortKey,
} from "@/app/lib/clip-hs-import-guide-shared";
import { useCallback, useEffect, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;

const SORT_COLUMNS: { key: ClipHsImportGuideSortKey; label: string }[] = [
  { key: "hs_code", label: "HSCode" },
  { key: "product_name", label: "품명" },
  { key: "source_updated_at", label: "등록일자" },
];

function visiblePageBlock(currentPage: number, totalPages: number): number[] {
  const tp = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(Math.max(1, Math.floor(currentPage)), tp);
  const start = Math.floor((cur - 1) / PAGE_NUMBER_WINDOW) * PAGE_NUMBER_WINDOW + 1;
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

export default function HsImportGuideView() {
  const [draft, setDraft] = useState({ hsCode: "", productName: "" });
  const [applied, setApplied] = useState({ hsCode: "", productName: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<ClipHsImportGuideSortKey>("hs_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [rows, setRows] = useState<ClipHsImportGuideListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfInfo, setPdfInfo] = useState<ClipHsImportGuidePdfInfo | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ClipHsImportGuideDetail | null>(null);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (applied.hsCode.trim()) u.set("hsCode", applied.hsCode.trim());
    if (applied.productName.trim()) u.set("productName", applied.productName.trim());
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-hs-import-guide/query?${u}`;
  }, [applied.hsCode, applied.productName, page, pageSize, sort, sortDir]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: ClipHsImportGuideListRow[];
        total: number;
      }>(buildQueryUrl());
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [buildQueryUrl]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    void fetchJson<{ pdf: ClipHsImportGuidePdfInfo }>(
      "/api/clip-hs-import-guide/pdf-info",
    )
      .then((data) => setPdfInfo(data.pdf ?? null))
      .catch(() => setPdfInfo(null));
  }, []);

  const openDetail = useCallback(async (hsCode: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setError(null);
    try {
      const data = await fetchJson<{ detail: ClipHsImportGuideDetail }>(
        `/api/clip-hs-import-guide/detail?hsCode=${encodeURIComponent(hsCode)}`,
      );
      setDetail(data.detail ?? null);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "상세 조회 실패");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const totalPg = Math.max(1, Math.ceil(total / pageSize));
  const curPageSafe = Math.min(page, totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  const onSearch = () => {
    setApplied({ ...draft });
    setPage(1);
  };

  const onReset = () => {
    const empty = { hsCode: "", productName: "" };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
    setSort("hs_code");
    setSortDir("asc");
  };

  const toggleSort = (key: ClipHsImportGuideSortKey) => {
    if (sort === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  return (
    <CasPageShell>
      <CasPageHeader title="HS별 품명·규격 수입신고 가이드" />

      <CasCard title="검색">
        <div className="grid gap-3 sm:grid-cols-2">
          <ClassificationFormSplitField label="HSCODE">
            <input
              type="text"
              className={`${CLASSIFICATION_FORM_INPUT_CLASS} font-mono`}
              value={draft.hsCode}
              placeholder="예: 0101.29-1000"
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  hsCode: formatClipCustomsChiefHsInput(e.target.value),
                }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </ClassificationFormSplitField>
          <ClassificationFormSplitField label="품명">
            <input
              type="text"
              className={CLASSIFICATION_FORM_INPUT_CLASS}
              value={draft.productName}
              placeholder="품명"
              onChange={(e) =>
                setDraft((p) => ({ ...p, productName: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </ClassificationFormSplitField>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-[#f8f6f2] px-3 py-2.5">
          <CasResetButton onClick={onReset} disabled={loading} />
          <CasSearchButton onClick={onSearch} disabled={loading} />
        </div>
      </CasCard>

      {pdfInfo?.available ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-4 py-2.5">
          <p className="text-[12px] font-medium text-amber-900">
            전체파일(PDF)
            {pdfInfo.file_name ? ` · ${pdfInfo.file_name}` : ""}
          </p>
          <CasSecondaryButton
            icon="download"
            onClick={() => {
              window.open("/api/clip-hs-import-guide/pdf", "_blank");
            }}
          >
            다운로드
          </CasSecondaryButton>
        </div>
      ) : null}

      <CasCard title="조회 결과" className="flex min-w-0 flex-col">
        <div className="mb-2">
          <ClipGridStatsBar
            total={total}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPage(1);
              setPageSize(size);
            }}
          />
        </div>

        {error ? (
          <p className="mb-2 text-[12px] text-red-600">{error}</p>
        ) : null}

        <ClipGridTable>
          <colgroup>
            <col style={{ width: "6%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "56%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr>
              <ClipGridTh className="px-1">No</ClipGridTh>
              {SORT_COLUMNS.map(({ key, label }) => (
                <ClipGridTh key={key}>
                  <ClipSortThButton
                    label={label}
                    active={sort === key}
                    sortDir={sortDir}
                    onClick={() => toggleSort(key)}
                  />
                </ClipGridTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {(loading || rows.length === 0) && (
              <ClipGridEmptyRow colSpan={4} loading={loading} />
            )}
            {!loading &&
              rows.map((row, idx) => (
                <tr key={row.hs_code} className={clipGridRowHoverClass}>
                  <ClipGridTd className={clipGridSeqClass}>
                    {(curPageSafe - 1) * pageSize + idx + 1}
                  </ClipGridTd>
                  <ClipGridTd className={clipGridMonoClass}>
                    {row.hs_code_display}
                  </ClipGridTd>
                  <ClipGridTd>
                    <button
                      type="button"
                      className={`${clipGridLinkClass} block w-full truncate text-left`}
                      title={row.product_name}
                      onClick={() => void openDetail(row.hs_code)}
                    >
                      {row.product_name}
                    </button>
                  </ClipGridTd>
                  <ClipGridTd>{row.registered_at}</ClipGridTd>
                </tr>
              ))}
          </tbody>
        </ClipGridTable>

        {total > 0 ? (
          <ClipPaginationBar
            curPageSafe={curPageSafe}
            totalPg={totalPg}
            loading={loading}
            block={block}
            onPage={setPage}
          />
        ) : null}
      </CasCard>

      {detailOpen ? (
        <HsImportGuideDetailModal
          detail={detail}
          loading={detailLoading}
          onClose={() => {
            setDetailOpen(false);
            setDetail(null);
          }}
        />
      ) : null}
    </CasPageShell>
  );
}
