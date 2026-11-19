"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasResetButton,
  CasSearchButton,
  CasSecondaryButton,
  CasSubNavTabs,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  ClipGridDateCell,
  ClipGridEmptyRow,
  ClipGridLabelCell,
  ClipGridStatsBar,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipGridTruncateCell,
  ClipPaginationBar,
  ClipSortThButton,
  clipGridMonoClass,
  clipGridRowHoverClass,
  clipGridSeqClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import { NtxHtmlPanel } from "@/app/(ai)/customs-law-portal/tax-refund-info/ntx-html-panel";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import { CLIP_TARIFF_RATE_COMPOSITE_SECTION } from "@/app/lib/clip-tax-refund-info-items";
import type {
  ClipTariffRateListRow,
  ClipTariffRateSortKey,
} from "@/app/lib/clip-tariff-rate-shared";
import type { NtxPageContent } from "@/app/lib/clip-ntx-content-server";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;

const TABS = [
  { key: "history", label: "관세이력조회" },
  { key: "composite", label: "종합정보" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const SORT_COLUMNS: { key: ClipTariffRateSortKey; label: string }[] = [
  { key: "tariff_category", label: "관세구분" },
  { key: "hs_code", label: "품목번호" },
  { key: "item_name", label: "품명" },
  { key: "category_symbol", label: "구분기호" },
  { key: "tariff_rate", label: "관세율" },
  { key: "amount_per_unit", label: "단위당세액" },
  { key: "effective_start_date", label: "적용개시일자" },
  { key: "effective_end_date", label: "적용만료일자" },
];

const HS_SECTIONS = Array.from({ length: 97 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

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

function str(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

export default function TariffRateView() {
  const [activeTab, setActiveTab] = useState<TabKey>("history");
  const [draft, setDraft] = useState({
    hsCode: "",
    itemName: "",
    hsSection: "",
    includeHistory: false,
  });
  const [applied, setApplied] = useState({ ...draft });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<ClipTariffRateSortKey>("hs_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const [rows, setRows] = useState<ClipTariffRateListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [composite, setComposite] = useState<NtxPageContent | null>(null);
  const [compositeLoading, setCompositeLoading] = useState(false);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (applied.hsCode.trim()) u.set("hsCode", applied.hsCode.trim());
    if (applied.itemName.trim()) u.set("itemName", applied.itemName.trim());
    if (applied.hsSection.trim()) u.set("hsSection", applied.hsSection.trim());
    if (applied.includeHistory) u.set("includeHistory", "1");
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-tariff-rate/query?${u}`;
  }, [applied, page, pageSize, sort, sortDir]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: ClipTariffRateListRow[];
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

  const loadComposite = useCallback(async () => {
    setCompositeLoading(true);
    try {
      const data = await fetchJson<{
        ok: boolean;
        content?: NtxPageContent | null;
      }>(`/api/clip-ntx-content?section=${CLIP_TARIFF_RATE_COMPOSITE_SECTION}`);
      setComposite(data.content ?? null);
    } catch {
      setComposite(null);
    } finally {
      setCompositeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "history") void loadRows();
  }, [activeTab, loadRows]);

  useEffect(() => {
    if (activeTab === "composite") void loadComposite();
  }, [activeTab, loadComposite]);

  const totalPg = Math.max(1, Math.ceil(total / pageSize));
  const curPageSafe = Math.min(page, totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  const onSearch = () => {
    setApplied({ ...draft });
    setPage(1);
  };

  const onReset = () => {
    const empty = {
      hsCode: "",
      itemName: "",
      hsSection: "",
      includeHistory: false,
    };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
    setSort("hs_code");
    setSortDir("asc");
  };

  const onHeaderSort = (key: ClipTariffRateSortKey) => {
    if (sortRef.current === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const onUploadFile = async (file: File) => {
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("sheet", "7.1");
      const res = await fetch("/api/clip-tariff-rate/upload", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        imported?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "업로드 실패");
      }
      setMessage(`${(data.imported ?? 0).toLocaleString()}건을 반영했습니다.`);
      setPage(1);
      await loadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onImportDefault = async () => {
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/clip-tariff-rate/import-default", {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        imported?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "기본 파일 반영 실패");
      }
      setMessage(
        `기본 엑셀 ${(data.imported ?? 0).toLocaleString()}건을 반영했습니다.`,
      );
      setPage(1);
      await loadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "기본 파일 반영 실패");
    } finally {
      setUploading(false);
    }
  };

  return (
    <CasPageShell>
      <CasPageHeader title="관세율" />

      <CasSubNavTabs
        tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as TabKey)}
      />

      {activeTab === "history" && (
        <>
          <CasCard title="검색">
            <div className="grid gap-3 lg:grid-cols-2">
              <ClassificationFormSplitField label="품목번호">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <input
                    type="text"
                    className={`${CLASSIFICATION_FORM_INPUT_CLASS} min-w-[8rem] flex-1 font-mono`}
                    value={draft.hsCode}
                    placeholder="예: 0101.21"
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, hsCode: e.target.value }))
                    }
                    onKeyDown={(e) => e.key === "Enter" && onSearch()}
                  />
                  <label className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-[#333]">
                    <input
                      type="checkbox"
                      checked={draft.includeHistory}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          includeHistory: e.target.checked,
                        }))
                      }
                      className="h-3.5 w-3.5 rounded border-[#d8dee6]"
                    />
                    이력포함
                  </label>
                </div>
              </ClassificationFormSplitField>

              <ClassificationFormSplitField label="품명">
                <input
                  type="text"
                  className={CLASSIFICATION_FORM_INPUT_CLASS}
                  value={draft.itemName}
                  placeholder="품명"
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, itemName: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && onSearch()}
                />
              </ClassificationFormSplitField>

              <ClassificationFormSplitField label="세번구분">
                <select
                  className={CLASSIFICATION_FORM_INPUT_CLASS}
                  value={draft.hsSection}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, hsSection: e.target.value }))
                  }
                >
                  <option value="">-- 전체 --</option>
                  {HS_SECTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}류
                    </option>
                  ))}
                </select>
              </ClassificationFormSplitField>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-[#f8f6f2] px-3 py-2.5">
              <CasResetButton
                onClick={onReset}
                disabled={loading || uploading}
              />
              <CasSearchButton
                onClick={onSearch}
                disabled={loading || uploading}
              />
            </div>
          </CasCard>

          <CasCard title="조회 결과" className="flex min-w-0 flex-col">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <ClipGridStatsBar
                total={total}
                pageSize={pageSize}
                onPageSizeChange={(size) => {
                  setPage(1);
                  setPageSize(size);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onUploadFile(file);
                  }}
                />
                <CasSecondaryButton
                  icon="excel"
                  disabled={uploading || loading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "업로드 중…" : "엑셀업로드"}
                </CasSecondaryButton>
                <CasSecondaryButton
                  icon="excel"
                  disabled={uploading || loading}
                  onClick={() => void onImportDefault()}
                >
                  기본엑셀 반영
                </CasSecondaryButton>
              </div>
            </div>

            {message ? (
              <p className="mb-2 text-[12px] text-emerald-700">{message}</p>
            ) : null}
            {error ? (
              <p className="mb-2 text-[12px] text-red-600">{error}</p>
            ) : null}

            <ClipGridTable>
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "6%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr>
                  <ClipGridTh className="px-1">번호</ClipGridTh>
                  {SORT_COLUMNS.map(({ key, label }) => (
                    <ClipGridTh key={key}>
                      <ClipSortThButton
                        label={label}
                        active={sort === key}
                        sortDir={sortDir}
                        align={
                          key === "item_name" || key === "tariff_category"
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
                  <ClipGridEmptyRow colSpan={9} loading={loading} />
                )}
                {!loading &&
                  rows.map((r, idx) => {
                    const seq = (curPageSafe - 1) * pageSize + idx + 1;
                    return (
                      <tr key={r.id} className={clipGridRowHoverClass}>
                        <ClipGridTd className={clipGridSeqClass}>{seq}</ClipGridTd>
                        <ClipGridTruncateCell align="left" title={str(r.tariff_category)}>
                          {str(r.tariff_category)}
                        </ClipGridTruncateCell>
                        <ClipGridLabelCell
                          className={clipGridMonoClass}
                          title={r.hs_code_display}
                        >
                          {r.hs_code_display}
                        </ClipGridLabelCell>
                        <ClipGridTruncateCell align="left" title={str(r.item_name)}>
                          {str(r.item_name)}
                        </ClipGridTruncateCell>
                        <ClipGridLabelCell title={str(r.category_symbol)}>
                          {str(r.category_symbol)}
                        </ClipGridLabelCell>
                        <ClipGridLabelCell title={str(r.tariff_rate)}>
                          {str(r.tariff_rate)}
                        </ClipGridLabelCell>
                        <ClipGridLabelCell title={str(r.amount_per_unit)}>
                          {str(r.amount_per_unit)}
                        </ClipGridLabelCell>
                        <ClipGridDateCell title={str(r.effective_start_date)}>
                          {str(r.effective_start_date)}
                        </ClipGridDateCell>
                        <ClipGridDateCell title={str(r.effective_end_date)}>
                          {str(r.effective_end_date)}
                        </ClipGridDateCell>
                      </tr>
                    );
                  })}
              </tbody>
            </ClipGridTable>

            {total > 0 && (
              <ClipPaginationBar
                block={block}
                curPageSafe={curPageSafe}
                totalPg={totalPg}
                loading={loading}
                onPage={setPage}
              />
            )}
          </CasCard>
        </>
      )}

      {activeTab === "composite" && (
        <CasCard title="종합정보" className="!overflow-visible">
          <NtxHtmlPanel content={composite} loading={compositeLoading} />
        </CasCard>
      )}
    </CasPageShell>
  );
}
