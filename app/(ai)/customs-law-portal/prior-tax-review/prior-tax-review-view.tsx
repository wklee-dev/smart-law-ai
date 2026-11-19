"use client";

import {
  CasCard,
  CasExcelButton,
  CasPageHeader,
  CasPageShell,
  CasResetButton,
  CasSearchButton,
  CasSecondaryButton,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  ClipGridEmptyRow,
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
  tdClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import { CLIP_PRIOR_TAX_TARGET_GOODS_GROUP_DEFS } from "@/app/lib/clip-prior-tax-target-goods-shared";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import { fillTodayIfEmpty } from "@/app/lib/date-input-utils";
import { formatClipCustomsChiefHsInput } from "@/app/lib/clip-customs-chief-shared";
import {
  CLIP_PRIOR_TAX_REVIEW_BY_SLUG,
  CLIP_PRIOR_TAX_REVIEW_ITEMS,
  clipPriorTaxReviewHref,
  type ClipPriorTaxReviewItem,
} from "@/app/lib/clip-prior-tax-review-items";
import type {
  ClipPriorTaxTargetGoodsGroup,
  ClipPriorTaxTargetGoodsRow,
} from "@/app/lib/clip-prior-tax-target-goods-shared";
import {
  resolveClipPriorTaxSecurityPriceBaseDate,
  type ClipPriorTaxSecurityPriceListRow,
  type ClipPriorTaxSecurityPriceSortKey,
} from "@/app/lib/clip-prior-tax-security-price-shared";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;

function getTodayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const PREASSESS_NOTICE = {
  summary:
    "신고한 세액에 대하여 관세채권 확보가 곤란하거나, 수입신고 수리전 세액을 심사하는 것이 적당하지 아니한 물품에 대하여 수입신고 수리전 세액심사를 합니다.",
  legalBasis:
    "물품의 가격변동이 큰 물품 기타 수입신고수리후에 세액을 심사하는 것이 적당하지 아니하다고 인정하여 관세청장이 정하는 물품",
};

const TARGET_GOODS_HSK_NOTICE =
  "※ 해당 세번(HSK) 클릭시 품목별 세부규격 내역을 조회할 수 있습니다. (개별소비세품목 중 일부 품목은 세부규격이 제정되지 않아 규격코드를 조회할 수 없습니다.)";

const SECURITY_PRICE_NOTICE =
  "수입신고물품은 원칙적으로 수입신고수리 후 수출입을 하게 되나, 「관세법」 제252조에 따라 수리 전에 수출입을 하려는 경우에는 납부할 관세에 상당하는 담보를 제공하고 세관장의 승인을 받아야 합니다. 이때 제공하는 담보의 산정기준 가격으로서 품목별 가격을 공개하는 것이 담보기준가격이며, 전자통관시스템(UNI-PASS)을 통해 매월 2회 공개합니다.";

const SECURITY_PRICE_BASE_DATE_HINT =
  "담보기준가격은 매월 2회 (1일, 16일) 게시";

const TABS = CLIP_PRIOR_TAX_REVIEW_ITEMS.map((item) => ({
  key: item.slug,
  label: item.label,
}));

const SECURITY_SORT_COLUMNS: {
  key: ClipPriorTaxSecurityPriceSortKey;
  label: string;
}[] = [
  { key: "std_code", label: "표준품명·규격코드" },
  { key: "std_item_name", label: "표준품명" },
  { key: "std_spec", label: "표준규격" },
  { key: "security_price_usd", label: "담보기준가격(USD/TON)" },
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

function pairTargetGoodsRows(
  items: ClipPriorTaxTargetGoodsRow[],
): [ClipPriorTaxTargetGoodsRow | null, ClipPriorTaxTargetGoodsRow | null][] {
  const out: [ClipPriorTaxTargetGoodsRow | null, ClipPriorTaxTargetGoodsRow | null][] =
    [];
  for (let i = 0; i < items.length; i += 2) {
    out.push([items[i] ?? null, items[i + 1] ?? null]);
  }
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

function PreassessNoticeBox() {
  return (
    <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-950">
      <p>
        <span className="font-semibold text-[#1e2f4f]">사전세액심사</span>{" "}
        {PREASSESS_NOTICE.summary}
      </p>
      <p className="mt-2">
        <span className="font-semibold text-[#1e2f4f]">
          법적근거(시행규칙 제8조)
        </span>{" "}
        {PREASSESS_NOTICE.legalBasis}
      </p>
    </div>
  );
}

function SecurityPriceNoticeBox() {
  return (
    <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-950">
      <p>
        <span className="font-semibold text-[#1e2f4f]">담보기준가격</span>{" "}
        {SECURITY_PRICE_NOTICE}
      </p>
    </div>
  );
}

function SecurityPriceUploadDialog({
  open,
  fileName,
  baseDate,
  uploading,
  onBaseDateChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  fileName: string;
  baseDate: string;
  uploading: boolean;
  onBaseDateChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  const resolvedDate = baseDate
    ? resolveClipPriorTaxSecurityPriceBaseDate(baseDate)
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-md rounded border border-[#e5e9ef] bg-white shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="security-price-upload-title"
      >
        <div className="border-b border-[#e5e9ef] px-4 py-3">
          <h3
            id="security-price-upload-title"
            className="text-[14px] font-semibold text-[#1e2f4f]"
          >
            담보기준가격 엑셀 업로드
          </h3>
        </div>
        <div className="space-y-3 px-4 py-4">
          <p className="text-[12px] text-[#666]">
            파일: <span className="font-medium text-[#333]">{fileName}</span>
          </p>
          <ClassificationFormSplitField label="*기준일자">
            <div className="space-y-1">
              <input
                type="date"
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={baseDate}
                onChange={(e) => onBaseDateChange(e.target.value)}
                onFocus={() => fillTodayIfEmpty(baseDate, onBaseDateChange)}
              />
              <p className="text-[11px] text-[#666]">
                {SECURITY_PRICE_BASE_DATE_HINT}
                {resolvedDate && resolvedDate !== baseDate
                  ? ` → ${resolvedDate} 기준으로 저장됩니다.`
                  : resolvedDate
                    ? ` (${resolvedDate} 기준으로 저장)`
                    : ""}
              </p>
            </div>
          </ClassificationFormSplitField>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#e5e9ef] bg-[#f8f6f2] px-4 py-3">
          <CasSecondaryButton onClick={onCancel} disabled={uploading}>
            취소
          </CasSecondaryButton>
          <CasSearchButton
            onClick={onConfirm}
            disabled={uploading || !baseDate.trim()}
          >
            {uploading ? "업로드 중…" : "업로드"}
          </CasSearchButton>
        </div>
      </div>
    </div>
  );
}

function TargetGoodsGroupTable({ group }: { group: ClipPriorTaxTargetGoodsGroup }) {
  const pairs = pairTargetGoodsRows(group.items);
  return (
    <section className="mb-5 overflow-hidden rounded border border-[#e5e9ef] bg-white">
      <div className="border-b border-[#e5e9ef] bg-[#f8fafc] px-3 py-2 text-[13px] font-semibold text-[#333]">
        {group.target_group_name} ({group.items.length.toLocaleString()}개)
      </div>
      <ClipGridTable fixedLayout={false} minWidth="100%">
        <colgroup>
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "25%" }} />
        </colgroup>
        <thead>
          <tr>
            <ClipGridTh className="text-center">품명</ClipGridTh>
            <ClipGridTh className="text-center">세번(HSK)</ClipGridTh>
            <ClipGridTh className="text-center">품명</ClipGridTh>
            <ClipGridTh className="text-center">세번(HSK)</ClipGridTh>
          </tr>
        </thead>
        <tbody>
          {pairs.length === 0 ? (
            <tr>
              <td
                colSpan={4}
                className={`${tdClass} py-10 text-center text-[13px] text-[#666]`}
              >
                조회결과가 존재하지 않습니다.
              </td>
            </tr>
          ) : (
            pairs.map((pair, idx) => (
              <tr key={`${group.target_group_code}-${idx}`} className={clipGridRowHoverClass}>
                <ClipGridTd align="center">{pair[0]?.item_name ?? ""}</ClipGridTd>
                <ClipGridTd align="center" className={clipGridMonoClass}>
                  {pair[0]?.hs_code_display ?? ""}
                </ClipGridTd>
                <ClipGridTd align="center">{pair[1]?.item_name ?? ""}</ClipGridTd>
                <ClipGridTd align="center" className={clipGridMonoClass}>
                  {pair[1]?.hs_code_display ?? ""}
                </ClipGridTd>
              </tr>
            ))
          )}
        </tbody>
      </ClipGridTable>
    </section>
  );
}

function TargetGoodsFooterNotes() {
  return (
    <>
      <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-950">
        {TARGET_GOODS_HSK_NOTICE}
      </div>
      <section>
        <h3 className="mb-2 border-l-4 border-[#1e2f4f] pl-2 text-[13px] font-semibold text-[#1e2f4f]">
          관련기관
        </h3>
        <div className="rounded border border-[#e5e9ef] bg-white px-4 py-3 text-[13px] text-[#333]">
          관세청 심사정책과 (☎ 042-481-7866)
        </div>
      </section>
    </>
  );
}

function SubjectGoodsPanel() {
  const [draftDate, setDraftDate] = useState(getTodayIsoDate);
  const [appliedDate, setAppliedDate] = useState(getTodayIsoDate);
  const [groups, setGroups] = useState<ClipPriorTaxTargetGoodsGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!appliedDate) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        groups: ClipPriorTaxTargetGoodsGroup[];
        total: number;
      }>(
        `/api/clip-prior-tax-review/target-goods/query?baseDate=${encodeURIComponent(appliedDate)}`,
      );
      setGroups(data.groups ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setGroups([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [appliedDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const displayGroups = CLIP_PRIOR_TAX_TARGET_GOODS_GROUP_DEFS.map((def) => {
    const existing = groups.find(
      (group) => group.target_group_code === def.target_group_code,
    );
    return (
      existing ?? {
        target_group_code: def.target_group_code,
        target_group_name: def.target_group_name,
        items: [],
      }
    );
  });

  return (
    <>
      <PreassessNoticeBox />

      <CasCard title="검색">
        <div className="grid gap-3 sm:grid-cols-2">
          <ClassificationFormSplitField label="기준일자">
            <input
              type="date"
              className={CLASSIFICATION_FORM_INPUT_CLASS}
              value={draftDate}
              onChange={(e) => setDraftDate(e.target.value)}
              onFocus={() => fillTodayIfEmpty(draftDate, setDraftDate)}
            />
          </ClassificationFormSplitField>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-[#f8f6f2] px-3 py-2.5">
          <CasResetButton
            disabled={loading}
            onClick={() => {
              const today = getTodayIsoDate();
              setDraftDate(today);
              setAppliedDate(today);
            }}
          />
          <CasSearchButton
            disabled={loading || !draftDate}
            onClick={() => setAppliedDate(draftDate)}
          />
        </div>
      </CasCard>

      <CasCard title="조회 결과" className="flex min-w-0 flex-col">
        {error ? <p className="mb-2 text-[12px] text-red-600">{error}</p> : null}
        {loading ? (
          <p className="text-[12px] text-[#666]">불러오는 중…</p>
        ) : (
          <>
            {appliedDate ? (
              <p className="mb-3 text-[12px] text-[#666]">
                기준일자 {appliedDate} · 전체 {total.toLocaleString()}건
              </p>
            ) : null}
            {displayGroups.map((group) => (
              <TargetGoodsGroupTable key={group.target_group_code} group={group} />
            ))}
            <TargetGoodsFooterNotes />
          </>
        )}
      </CasCard>
    </>
  );
}

function SecurityPricePanel() {
  const [draftDate, setDraftDate] = useState(() =>
    resolveClipPriorTaxSecurityPriceBaseDate(new Date()),
  );
  const [appliedDate, setAppliedDate] = useState(() =>
    resolveClipPriorTaxSecurityPriceBaseDate(new Date()),
  );
  const [draftHsCode, setDraftHsCode] = useState("");
  const [appliedHsCode, setAppliedHsCode] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<ClipPriorTaxSecurityPriceSortKey>("seq_no");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const [rows, setRows] = useState<ClipPriorTaxSecurityPriceListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadPendingFile, setUploadPendingFile] = useState<File | null>(null);
  const [uploadBaseDate, setUploadBaseDate] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (appliedDate.trim()) u.set("baseDate", appliedDate.trim());
    if (appliedHsCode.trim()) u.set("hsCode", appliedHsCode.trim());
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-prior-tax-review/security-price/query?${u}`;
  }, [appliedDate, appliedHsCode, page, pageSize, sort, sortDir]);

  const loadRows = useCallback(async () => {
    if (!appliedDate) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: ClipPriorTaxSecurityPriceListRow[];
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
  }, [appliedDate, buildQueryUrl]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const totalPg = Math.max(1, Math.ceil(total / pageSize));
  const curPageSafe = Math.min(page, totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  const onSearch = () => {
    const baseDate = resolveClipPriorTaxSecurityPriceBaseDate(draftDate);
    setDraftDate(baseDate);
    setAppliedDate(baseDate);
    setAppliedHsCode(draftHsCode);
    setPage(1);
  };

  const onReset = () => {
    const baseDate = resolveClipPriorTaxSecurityPriceBaseDate(new Date());
    setDraftDate(baseDate);
    setAppliedDate(baseDate);
    setDraftHsCode("");
    setAppliedHsCode("");
    setPage(1);
    setSort("seq_no");
    setSortDir("asc");
  };

  const onHeaderSort = (key: ClipPriorTaxSecurityPriceSortKey) => {
    if (sortRef.current === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const onExport = () => {
    const u = new URLSearchParams();
    if (appliedDate.trim()) u.set("baseDate", appliedDate.trim());
    if (appliedHsCode.trim()) u.set("hsCode", appliedHsCode.trim());
    const qs = u.toString();
    window.open(
      `/api/clip-prior-tax-review/security-price/export${qs ? `?${qs}` : ""}`,
      "_blank",
    );
  };

  const closeUploadDialog = () => {
    setUploadDialogOpen(false);
    setUploadPendingFile(null);
    setUploadBaseDate("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onUploadFile = async (file: File, baseDateInput: string) => {
    const baseDate = resolveClipPriorTaxSecurityPriceBaseDate(baseDateInput);
    if (!baseDate) {
      setError("업로드 기준일자를 입력해 주세요.");
      return;
    }

    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("baseDate", baseDate);
      const res = await fetch("/api/clip-prior-tax-review/security-price/upload", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        ok?: boolean;
        imported?: number;
        baseDate?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "업로드 실패");
      }
      const uploadDate = resolveClipPriorTaxSecurityPriceBaseDate(
        data.baseDate || new Date(),
      );
      setMessage(
        data.message ??
          `${uploadDate} 기준 ${(data.imported ?? 0).toLocaleString()}건을 반영했습니다.`,
      );
      setAppliedDate(uploadDate);
      setDraftDate(uploadDate);
      setPage(1);
      closeUploadDialog();
      await loadRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
    }
  };

  const onUploadFileSelected = (file: File) => {
    setUploadPendingFile(file);
    setUploadBaseDate(
      draftDate
        ? resolveClipPriorTaxSecurityPriceBaseDate(draftDate)
        : resolveClipPriorTaxSecurityPriceBaseDate(new Date()),
    );
    setUploadDialogOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onConfirmUpload = () => {
    if (!uploadPendingFile || !uploadBaseDate.trim()) return;
    void onUploadFile(uploadPendingFile, uploadBaseDate);
  };

  return (
    <>
      <SecurityPriceNoticeBox />

      <CasCard title="검색">
        <div className="grid gap-3 sm:grid-cols-2">
          <ClassificationFormSplitField label="*기준일자">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <input
                type="date"
                className={`${CLASSIFICATION_FORM_INPUT_CLASS} max-w-[11rem]`}
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                onFocus={() => fillTodayIfEmpty(draftDate, setDraftDate)}
              />
              <span className="text-[11px] text-[#666]">
                {SECURITY_PRICE_BASE_DATE_HINT}
              </span>
            </div>
          </ClassificationFormSplitField>
          <ClassificationFormSplitField label="HS부호">
            <input
              type="text"
              className={`${CLASSIFICATION_FORM_INPUT_CLASS} font-mono`}
              value={draftHsCode}
              placeholder="예: 0301"
              onChange={(e) =>
                setDraftHsCode(formatClipCustomsChiefHsInput(e.target.value))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </ClassificationFormSplitField>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-[#f8f6f2] px-3 py-2.5">
          <CasResetButton onClick={onReset} disabled={loading || uploading} />
          <CasSearchButton
            onClick={onSearch}
            disabled={loading || uploading || !draftDate}
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
                if (file) onUploadFileSelected(file);
              }}
            />
            <CasSecondaryButton
              icon="excel"
              disabled={uploading || loading}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "업로드 중…" : "엑셀업로드"}
            </CasSecondaryButton>
            <CasExcelButton
              disabled={loading || uploading || total === 0}
              onClick={onExport}
            >
              엑셀다운로드
            </CasExcelButton>
          </div>
        </div>

        {message ? (
          <p className="mb-2 text-[12px] text-emerald-700">{message}</p>
        ) : null}
        {error ? <p className="mb-2 text-[12px] text-red-600">{error}</p> : null}

        <ClipGridTable>
          <colgroup>
            <col style={{ width: "6%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "42%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr>
              <ClipGridTh className="px-1">번호</ClipGridTh>
              {SECURITY_SORT_COLUMNS.map(({ key, label }) => (
                <ClipGridTh key={key}>
                  <ClipSortThButton
                    label={label}
                    active={sort === key}
                    sortDir={sortDir}
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
              rows.map((row, idx) => (
                <tr key={row.id} className={clipGridRowHoverClass}>
                  <ClipGridTd className={clipGridSeqClass}>
                    {(curPageSafe - 1) * pageSize + idx + 1}
                  </ClipGridTd>
                  <ClipGridTd className={clipGridMonoClass}>{row.std_code}</ClipGridTd>
                  <ClipGridTruncateCell align="left" title={row.std_item_name}>
                    {row.std_item_name}
                  </ClipGridTruncateCell>
                  <ClipGridTruncateCell align="left" title={row.std_spec}>
                    {row.std_spec}
                  </ClipGridTruncateCell>
                  <ClipGridTd align="right" className="tabular-nums">
                    {row.security_price_display}
                  </ClipGridTd>
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

      <SecurityPriceUploadDialog
        open={uploadDialogOpen}
        fileName={uploadPendingFile?.name ?? ""}
        baseDate={uploadBaseDate}
        uploading={uploading}
        onBaseDateChange={setUploadBaseDate}
        onCancel={closeUploadDialog}
        onConfirm={onConfirmUpload}
      />
    </>
  );
}

function PriorTaxReviewTabs({
  activeSlug,
}: {
  activeSlug: ClipPriorTaxReviewItem["slug"];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get("embed") === "1";

  const navigateTab = (key: string) => {
    const href = clipPriorTaxReviewHref(key);
    const label = CLIP_PRIOR_TAX_REVIEW_BY_SLUG[key]?.label ?? key;
    if (
      isEmbed &&
      typeof window !== "undefined" &&
      window.parent !== window
    ) {
      window.parent.postMessage(
        { type: "admin-embed-navigate", path: href, label },
        window.location.origin,
      );
      return;
    }
    router.push(clipPriorTaxReviewHref(key, { embed: isEmbed }));
  };

  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const active = activeSlug === tab.key;
        const href = clipPriorTaxReviewHref(tab.key, { embed: isEmbed });
        return (
          <Link
            key={tab.key}
            href={href}
            onClick={(e) => {
              e.preventDefault();
              navigateTab(tab.key);
            }}
            className={
              active
                ? "rounded-md bg-[#1e2f4f] px-4 py-2 text-[12px] font-medium text-white shadow-sm transition-colors"
                : "rounded-md border border-[#e5e9ef] bg-white px-4 py-2 text-[12px] font-medium text-[#666] transition-colors hover:bg-[#f8fafc] hover:text-[#333]"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export function PriorTaxReviewView({
  item,
}: {
  item: ClipPriorTaxReviewItem;
}) {
  return (
    <CasPageShell>
      <CasPageHeader title={item.label} />

      <PriorTaxReviewTabs activeSlug={item.slug} />

      {item.slug === "subject-goods" ? (
        <SubjectGoodsPanel />
      ) : (
        <SecurityPricePanel />
      )}
    </CasPageShell>
  );
}
