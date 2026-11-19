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
  clipGridMonoClass,
  clipGridRowHoverClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import type {
  KitaStrategicMaterialDetailRow,
  KitaStrategicMaterialListRow,
} from "@/app/lib/kita-strategic-material-shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;
const KITA_SOURCE_URL =
  "https://www.kita.net/tradeNavi/strategicMaterial/strategicMaterialList.do";

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

function formatItemName(row: KitaStrategicMaterialListRow): string {
  const ko = row.hs_name_ko.trim();
  const en = row.hs_name_en.trim();
  if (ko && en) return `${ko} ${en}`;
  return ko || en || "\u00a0";
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export function KitaStrategicMaterialView() {
  const [dbReady, setDbReady] = useState(true);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywordApplied, setKeywordApplied] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<KitaStrategicMaterialListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [mappingCount, setMappingCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<KitaStrategicMaterialListRow | null>(
    null,
  );
  const [detailItems, setDetailItems] = useState<KitaStrategicMaterialDetailRow[]>(
    [],
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [highlightControl, setHighlightControl] = useState("");

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const u = new URLSearchParams();
      u.set("page", String(page));
      u.set("pageSize", String(pageSize));
      if (keywordApplied.trim()) u.set("keyword", keywordApplied.trim());
      const data = await fetchJson<{
        rows: KitaStrategicMaterialListRow[];
        total: number;
        ready: boolean;
        mappingCount?: number;
      }>(`/api/kita-strategic-material/list?${u}`);
      setDbReady(data.ready);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setMappingCount(data.mappingCount ?? null);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "목록 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keywordApplied]);

  const loadDetail = useCallback(async (hsCode: string) => {
    setDetailLoading(true);
    try {
      const data = await fetchJson<{
        items: KitaStrategicMaterialDetailRow[];
      }>(
        `/api/kita-strategic-material/by-hs?hsCode=${encodeURIComponent(hsCode)}`,
      );
      setDetailItems(data.items ?? []);
    } catch (e) {
      setDetailItems([]);
      setError(e instanceof Error ? e.message : "상세 조회 실패");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (rows.length === 0) {
      setSelected(null);
      setDetailItems([]);
      return;
    }
    setSelected((prev) => {
      if (
        prev &&
        rows.some(
          (r) => r.hs_code === prev.hs_code && r.control_no === prev.control_no,
        )
      ) {
        return prev;
      }
      return rows[0] ?? null;
    });
  }, [rows]);

  useEffect(() => {
    if (!selected?.hs_code) {
      setDetailItems([]);
      return;
    }
    setHighlightControl(selected.control_no);
    void loadDetail(selected.hs_code);
  }, [selected, loadDetail]);

  const totalPg = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(page, totalPg);
  const block = visiblePageBlock(pageSafe, totalPg);

  const selectedTitle = useMemo(() => {
    if (!selected) return "통제번호 상세";
    return `${selected.hs_code} · ${formatItemName(selected)}`;
  }, [selected]);

  const onSearch = () => {
    setKeywordApplied(keywordDraft);
    setPage(1);
  };

  const onReset = () => {
    setKeywordDraft("");
    setKeywordApplied("");
    setPage(1);
  };

  const selectRow = (row: KitaStrategicMaterialListRow) => {
    setSelected(row);
    setHighlightControl(row.control_no);
  };

  return (
    <CasPageShell>
      <CasPageHeader title="전략물자HS" />

      <p className="text-[12px] text-slate-600">
        KITA 비관세장벽 · 전략물자 HS–통제번호 매핑(
        <a
          href={KITA_SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1e2f4f] underline"
        >
          원본 사이트
        </a>
        ). DB: <code className="rounded bg-slate-100 px-1">kita_strategic_material_*</code>
        {mappingCount != null ? (
          <>
            {" "}
            · 적재 <strong>{mappingCount.toLocaleString("ko-KR")}</strong>건
          </>
        ) : null}
      </p>

      <CasCard title="검색">
        <ClassificationFormSplitField label="HS·품목명·통제번호">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              type="search"
              className={`${CLASSIFICATION_FORM_INPUT_CLASS} min-w-[12rem] flex-1`}
              value={keywordDraft}
              placeholder="HS코드, 품목명, 통제번호"
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
            <CasResetButton onClick={onReset} disabled={loading} />
            <CasSearchButton onClick={onSearch} disabled={loading} />
          </div>
        </ClassificationFormSplitField>
      </CasCard>

      {!dbReady ? (
        <p className="text-[12px] text-amber-800">
          전략물자 데이터가 없습니다. KITA 크롤러로{" "}
          <code className="rounded bg-amber-50 px-1">kita_strategic_material_*</code>{" "}
          테이블을 적재해 주세요.
        </p>
      ) : null}
      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}

      <div className="grid min-h-0 gap-3 lg:grid-cols-2">
        <CasCard title="전략물자 목록" className="flex min-w-0 flex-col">
          <ClipGridStatsBar
            total={total}
            pageSize={pageSize}
            onPageSizeChange={(size) => {
              setPage(1);
              setPageSize(size);
            }}
          />
          <ClipGridTable>
            <colgroup>
              <col style={{ width: "28%" }} />
              <col style={{ width: "44%" }} />
              <col style={{ width: "28%" }} />
            </colgroup>
            <thead>
              <tr>
                <ClipGridTh className="text-center">품목분류(HS)</ClipGridTh>
                <ClipGridTh>품목명</ClipGridTh>
                <ClipGridTh className="text-center">통제번호</ClipGridTh>
              </tr>
            </thead>
            <tbody>
              {(loading || rows.length === 0) && (
                <ClipGridEmptyRow colSpan={3} loading={loading} />
              )}
              {!loading &&
                rows.map((row) => {
                  const active =
                    selected?.hs_code === row.hs_code &&
                    selected?.control_no === row.control_no;
                  return (
                    <tr
                      key={`${row.hs_code}-${row.control_no}`}
                      className={`cursor-pointer ${clipGridRowHoverClass} ${
                        active ? "bg-[#e8eef7]" : ""
                      }`}
                      onClick={() => selectRow(row)}
                    >
                      <ClipGridTd
                        className={`${clipGridMonoClass} text-center ${
                          active ? "font-semibold text-[#1e2f4f]" : ""
                        }`}
                      >
                        {row.hs_code}
                      </ClipGridTd>
                      <ClipGridTruncateCell title={formatItemName(row)}>
                        {formatItemName(row)}
                      </ClipGridTruncateCell>
                      <ClipGridTd
                        className={`${clipGridMonoClass} text-center ${
                          active ? "font-semibold text-[#1e2f4f]" : ""
                        }`}
                      >
                        {row.control_no}
                      </ClipGridTd>
                    </tr>
                  );
                })}
            </tbody>
          </ClipGridTable>
          {total > 0 ? (
            <ClipPaginationBar
              curPageSafe={pageSafe}
              totalPg={totalPg}
              loading={loading}
              block={block}
              onPage={setPage}
            />
          ) : null}
        </CasCard>

        <CasCard title={selectedTitle} className="flex min-w-0 flex-col">
          {!selected && !detailLoading ? (
            <p className="py-12 text-center text-[13px] text-[#666]">
              왼쪽 목록에서 HS 행을 선택하세요.
            </p>
          ) : null}
          {detailLoading ? (
            <p className="py-8 text-center text-[13px] text-slate-500">
              불러오는 중…
            </p>
          ) : null}
          {!detailLoading && selected ? (
            <div className="flex max-h-[min(70vh,720px)] min-h-0 flex-col gap-3 overflow-y-auto pr-1">
              {detailItems.length === 0 ? (
                <p className="text-[13px] text-slate-500">
                  해당 HS에 대한 통제 상세가 없습니다.
                </p>
              ) : (
                detailItems.map((item) => {
                  const active = item.control_no === highlightControl;
                  return (
                    <section
                      key={item.control_no}
                      className={`rounded-lg border ${
                        active
                          ? "border-[#1e2f4f] bg-[#f4f7fb]"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <header className="border-b border-slate-100 bg-[#eef2f6] px-3 py-2">
                        <p
                          className={`font-mono text-[13px] ${
                            active ? "font-bold text-[#1e2f4f]" : "text-slate-800"
                          }`}
                        >
                          {item.control_no}
                        </p>
                      </header>
                      <div className="space-y-2 px-3 py-3 text-[12px] leading-relaxed text-slate-800">
                        {item.content_ko ? <p>{item.content_ko}</p> : null}
                        {item.content_en ? (
                          <p className="text-slate-600">{item.content_en}</p>
                        ) : null}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          ) : null}
        </CasCard>
      </div>
    </CasPageShell>
  );
}
