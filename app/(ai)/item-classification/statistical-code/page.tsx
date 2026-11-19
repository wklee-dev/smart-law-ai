"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasResetButton,
  CasSearchButton,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  ClipGridEmptyRow,
  ClipGridStatsBar,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipGridTruncateCell,
  ClipPaginationBar,
  clipGridRowHoverClass,
  clipGridSeqClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import type {
  ClipStatisticalCodeCategoryRow,
  ClipStatisticalCodeDetailRow,
} from "@/app/lib/clip-statistical-code-shared";
import { useCallback, useEffect, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;

function visiblePageBlock(currentPage: number, totalPages: number): number[] {
  const tp = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(Math.max(1, Math.floor(currentPage)), tp);
  const start = Math.floor((cur - 1) / PAGE_NUMBER_WINDOW) * PAGE_NUMBER_WINDOW + 1;
  const end = Math.min(start + PAGE_NUMBER_WINDOW - 1, tp);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function cell(v: string): string {
  const s = v.trim();
  return s || "\u00a0";
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export default function StatisticalCodePage() {
  const [dbReady, setDbReady] = useState(true);

  const [nameDraft, setNameDraft] = useState("");
  const [nameApplied, setNameApplied] = useState("");

  const [catPage, setCatPage] = useState(1);
  const [catPageSize, setCatPageSize] = useState(10);
  const [categories, setCategories] = useState<ClipStatisticalCodeCategoryRow[]>(
    [],
  );
  const [catTotal, setCatTotal] = useState(0);
  const [catLoading, setCatLoading] = useState(false);

  const [selected, setSelected] = useState<ClipStatisticalCodeCategoryRow | null>(
    null,
  );

  const [detailDraft, setDetailDraft] = useState("");
  const [detailApplied, setDetailApplied] = useState("");
  const [detPage, setDetPage] = useState(1);
  const [detPageSize, setDetPageSize] = useState(10);
  const [details, setDetails] = useState<ClipStatisticalCodeDetailRow[]>([]);
  const [detTotal, setDetTotal] = useState(0);
  const [detLoading, setDetLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    setCatLoading(true);
    setError(null);
    try {
      const u = new URLSearchParams();
      u.set("page", String(catPage));
      u.set("pageSize", String(catPageSize));
      if (nameApplied.trim()) u.set("keyword", nameApplied.trim());
      const data = await fetchJson<{
        rows: ClipStatisticalCodeCategoryRow[];
        total: number;
        ready: boolean;
      }>(`/api/clip-statistical-code/categories?${u}`);
      setDbReady(data.ready);
      setCategories(data.rows ?? []);
      setCatTotal(data.total ?? 0);
    } catch (e) {
      setCategories([]);
      setCatTotal(0);
      setError(e instanceof Error ? e.message : "목록 조회 실패");
    } finally {
      setCatLoading(false);
    }
  }, [catPage, catPageSize, nameApplied]);

  const loadDetails = useCallback(async () => {
    if (!selected?.stat_code) {
      setDetails([]);
      setDetTotal(0);
      return;
    }
    setDetLoading(true);
    setError(null);
    try {
      const u = new URLSearchParams();
      u.set("statCode", selected.stat_code);
      u.set("page", String(detPage));
      u.set("pageSize", String(detPageSize));
      if (detailApplied.trim()) u.set("keyword", detailApplied.trim());
      const data = await fetchJson<{
        rows: ClipStatisticalCodeDetailRow[];
        total: number;
      }>(`/api/clip-statistical-code/details?${u}`);
      setDetails(data.rows ?? []);
      setDetTotal(data.total ?? 0);
    } catch (e) {
      setDetails([]);
      setDetTotal(0);
      setError(e instanceof Error ? e.message : "상세 조회 실패");
    } finally {
      setDetLoading(false);
    }
  }, [selected?.stat_code, detPage, detPageSize, detailApplied]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    if (categories.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((prev) => {
      if (prev && categories.some((c) => c.stat_code === prev.stat_code)) {
        return prev;
      }
      return categories[0] ?? null;
    });
  }, [categories]);

  const catTotalPg = Math.max(1, Math.ceil(catTotal / catPageSize));
  const catPageSafe = Math.min(catPage, catTotalPg);
  const catBlock = visiblePageBlock(catPageSafe, catTotalPg);

  const detTotalPg = Math.max(1, Math.ceil(detTotal / detPageSize));
  const detPageSafe = Math.min(detPage, detTotalPg);
  const detBlock = visiblePageBlock(detPageSafe, detTotalPg);

  const onSearchName = () => {
    setNameApplied(nameDraft);
    setCatPage(1);
  };

  const onResetName = () => {
    setNameDraft("");
    setNameApplied("");
    setCatPage(1);
  };

  const onDetailFilter = () => {
    setDetailApplied(detailDraft);
    setDetPage(1);
  };

  const onDetailReset = () => {
    setDetailDraft("");
    setDetailApplied("");
    setDetPage(1);
  };

  const selectCategory = (row: ClipStatisticalCodeCategoryRow) => {
    setSelected(row);
    setDetPage(1);
    setDetailDraft("");
    setDetailApplied("");
  };

  const displayName = (row: ClipStatisticalCodeCategoryRow) =>
    row.stat_name || row.stat_sign || row.stat_code;

  return (
    <CasPageShell>
      <CasPageHeader title="통계부호" />

      <CasCard title="검색">
        <ClassificationFormSplitField label="통계부호명">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              type="text"
              className={`${CLASSIFICATION_FORM_INPUT_CLASS} min-w-[12rem] flex-1`}
              value={nameDraft}
              placeholder="통계부호명"
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearchName();
              }}
            />
            <CasResetButton onClick={onResetName} disabled={catLoading} />
            <CasSearchButton onClick={onSearchName} disabled={catLoading} />
          </div>
        </ClassificationFormSplitField>
      </CasCard>

      {!dbReady ? (
        <p className="text-[12px] text-amber-800">
          통계부호 데이터가 없습니다. `node scripts/import-clip-statistical-code.mjs`
          로 적재해 주세요.
        </p>
      ) : null}
      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}

      <div className="grid min-h-0 gap-3 lg:grid-cols-2">
        <CasCard title="통계부호구분 목록" className="flex min-w-0 flex-col">
          <ClipGridStatsBar
            total={catTotal}
            pageSize={catPageSize}
            onPageSizeChange={(size) => {
              setCatPage(1);
              setCatPageSize(size);
            }}
          />
          <ClipGridTable>
            <colgroup>
              <col style={{ width: "100%" }} />
            </colgroup>
            <thead>
              <tr>
                <ClipGridTh>통계부호명</ClipGridTh>
              </tr>
            </thead>
            <tbody>
              {(catLoading || categories.length === 0) && (
                <ClipGridEmptyRow colSpan={1} loading={catLoading} />
              )}
              {!catLoading &&
                categories.map((row) => {
                  const active = selected?.stat_code === row.stat_code;
                  return (
                    <tr
                      key={row.stat_code}
                      className={`cursor-pointer ${clipGridRowHoverClass} ${
                        active ? "bg-[#e8eef7]" : ""
                      }`}
                      onClick={() => selectCategory(row)}
                    >
                      <ClipGridTd className={active ? "font-semibold text-[#1e2f4f]" : ""}>
                        {displayName(row)}
                      </ClipGridTd>
                    </tr>
                  );
                })}
            </tbody>
          </ClipGridTable>
          {catTotal > 0 ? (
            <ClipPaginationBar
              curPageSafe={catPageSafe}
              totalPg={catTotalPg}
              loading={catLoading}
              block={catBlock}
              onPage={setCatPage}
            />
          ) : null}
        </CasCard>

        <CasCard
          title={
            selected
              ? `${displayName(selected)} 통계부호 상세`
              : "통계부호 상세"
          }
          className="flex min-w-0 flex-col"
        >
          <div className="mb-2 flex flex-wrap items-end justify-end gap-2">
            <input
              type="text"
              className={`${CLASSIFICATION_FORM_INPUT_CLASS} min-w-[8rem] flex-1 sm:max-w-[14rem]`}
              placeholder="부호·명칭 필터"
              value={detailDraft}
              disabled={!selected}
              onChange={(e) => setDetailDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onDetailFilter();
              }}
            />
            <CasSearchButton
              onClick={onDetailFilter}
              disabled={detLoading || !selected}
            />
            <CasResetButton
              onClick={onDetailReset}
              disabled={detLoading || !selected}
            />
          </div>

          <ClipGridStatsBar
            total={detTotal}
            pageSize={detPageSize}
            onPageSizeChange={(size) => {
              setDetPage(1);
              setDetPageSize(size);
            }}
          />

          <ClipGridTable>
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "34%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "18%" }} />
            </colgroup>
            <thead>
              <tr>
                <ClipGridTh className="text-center">부호</ClipGridTh>
                <ClipGridTh>한글명</ClipGridTh>
                <ClipGridTh>한글약어명</ClipGridTh>
                <ClipGridTh>영문약어명</ClipGridTh>
                <ClipGridTh>영문명</ClipGridTh>
              </tr>
            </thead>
            <tbody>
              {!selected && !detLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[13px] text-[#666]">
                    왼쪽에서 통계부호를 선택하세요.
                  </td>
                </tr>
              ) : null}
              {selected && (detLoading || details.length === 0) ? (
                <ClipGridEmptyRow colSpan={5} loading={detLoading} />
              ) : null}
              {!detLoading &&
                selected &&
                details.map((row, idx) => (
                  <tr key={`${row.detail_code}-${idx}`} className={clipGridRowHoverClass}>
                    <ClipGridTd className={`${clipGridSeqClass} text-center`}>
                      {cell(row.detail_code)}
                    </ClipGridTd>
                    <ClipGridTruncateCell title={row.name_kr}>
                      {cell(row.name_kr)}
                    </ClipGridTruncateCell>
                    <ClipGridTruncateCell title={row.abbr_kr}>
                      {cell(row.abbr_kr)}
                    </ClipGridTruncateCell>
                    <ClipGridTruncateCell title={row.abbr_en}>
                      {cell(row.abbr_en)}
                    </ClipGridTruncateCell>
                    <ClipGridTruncateCell title={row.name_en}>
                      {cell(row.name_en)}
                    </ClipGridTruncateCell>
                  </tr>
                ))}
            </tbody>
          </ClipGridTable>

          {detTotal > 0 ? (
            <ClipPaginationBar
              curPageSafe={detPageSafe}
              totalPg={detTotalPg}
              loading={detLoading}
              block={detBlock}
              onPage={setDetPage}
            />
          ) : null}
        </CasCard>
      </div>
    </CasPageShell>
  );
}
