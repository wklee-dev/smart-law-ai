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
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import type {
  ClipStandardProductCodeListRow,
  ClipStandardProductCodeSortKey,
} from "@/app/lib/clip-standard-product-code-shared";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;

const SORT_COLUMNS: { key: ClipStandardProductCodeSortKey; label: string }[] =
  [
    { key: "std_code", label: "표준품명·규격코드" },
    { key: "item_name", label: "품명" },
    { key: "std_item_name", label: "표준품명" },
    { key: "std_spec", label: "표준규격" },
  ];

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
  const res = await fetch(path);
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export default function StandardProductCodePage() {
  const [draft, setDraft] = useState({ hsCode: "", itemName: "" });
  const [applied, setApplied] = useState({ hsCode: "", itemName: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<ClipStandardProductCodeSortKey>("seq_no");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const [rows, setRows] = useState<ClipStandardProductCodeListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (applied.hsCode.trim()) u.set("hsCode", applied.hsCode.trim());
    if (applied.itemName.trim()) u.set("itemName", applied.itemName.trim());
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-standard-product-code/query?${u}`;
  }, [applied.hsCode, applied.itemName, page, pageSize, sort, sortDir]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: ClipStandardProductCodeListRow[];
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

  const totalPg = Math.max(1, Math.ceil(total / pageSize));
  const curPageSafe = Math.min(page, totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  const onSearch = () => {
    setApplied({ ...draft });
    setPage(1);
  };

  const onReset = () => {
    const empty = { hsCode: "", itemName: "" };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
    setSort("seq_no");
    setSortDir("asc");
  };

  const onHeaderSort = (key: ClipStandardProductCodeSortKey) => {
    if (sortRef.current === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir(key === "seq_no" ? "asc" : "asc");
    }
    setPage(1);
  };

  const onExport = () => {
    const u = new URLSearchParams();
    if (applied.hsCode.trim()) u.set("hsCode", applied.hsCode.trim());
    if (applied.itemName.trim()) u.set("itemName", applied.itemName.trim());
    const qs = u.toString();
    window.open(
      `/api/clip-standard-product-code/export${qs ? `?${qs}` : ""}`,
      "_blank",
    );
  };

  const onUploadClick = () => {
    fileInputRef.current?.click();
  };

  const onUploadFile = async (file: File) => {
    setUploading(true);
    setMessage(null);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/clip-standard-product-code/upload", {
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

  return (
    <CasPageShell>
      <CasPageHeader title="표준품명/규격코드" />

      <CasCard title="검색">
        <div className="grid gap-3 sm:grid-cols-2">
          <ClassificationFormSplitField label="HS부호">
            <input
              type="text"
              className={`${CLASSIFICATION_FORM_INPUT_CLASS} font-mono`}
              value={draft.hsCode}
              placeholder="예: 0101"
              onChange={(e) =>
                setDraft((p) => ({ ...p, hsCode: e.target.value }))
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
              value={draft.itemName}
              placeholder="품명·표준품명·표준규격"
              onChange={(e) =>
                setDraft((p) => ({ ...p, itemName: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </ClassificationFormSplitField>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-[#f8f6f2] px-3 py-2.5">
          <CasResetButton onClick={onReset} disabled={loading || uploading} />
          <CasSearchButton onClick={onSearch} disabled={loading || uploading} />
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
              onClick={onUploadClick}
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
        {error ? (
          <p className="mb-2 text-[12px] text-red-600">{error}</p>
        ) : null}

        <ClipGridTable>
          <colgroup>
            <col style={{ width: "5%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "32%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "32%" }} />
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
                    align={key === "item_name" ? "left" : "center"}
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
              rows.map((r) => (
                <tr key={r.id} className={clipGridRowHoverClass}>
                  <ClipGridTd className={clipGridSeqClass}>
                    {r.seq_no}
                  </ClipGridTd>
                  <ClipGridLabelCell
                    className={clipGridMonoClass}
                    title={str(r.std_code)}
                  >
                    {str(r.std_code)}
                  </ClipGridLabelCell>
                  <ClipGridTruncateCell align="left" title={str(r.item_name)}>
                    {str(r.item_name)}
                  </ClipGridTruncateCell>
                  <ClipGridTruncateCell
                    align="left"
                    title={str(r.std_item_name)}
                  >
                    {str(r.std_item_name)}
                  </ClipGridTruncateCell>
                  <ClipGridTruncateCell align="left" title={str(r.std_spec)}>
                    {str(r.std_spec)}
                  </ClipGridTruncateCell>
                </tr>
              ))}
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
    </CasPageShell>
  );
}
