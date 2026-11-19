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
  DualUseHskDetailRow,
  DualUseHskListRow,
} from "@/app/lib/dual-use-hsk-shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;
const SOURCE_URL = "https://www.yestrade.go.kr/hsk-control-search";

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

function formatItemName(row: DualUseHskListRow): string {
  const ko = row.hsk_nm.trim();
  const en = row.hsk_eng_nm.trim();
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

export function DualUseHskView() {
  const [dbReady, setDbReady] = useState(true);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywordApplied, setKeywordApplied] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<DualUseHskListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<DualUseHskListRow | null>(null);
  const [detailItems, setDetailItems] = useState<DualUseHskDetailRow[]>([]);
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
        rows: DualUseHskListRow[];
        total: number;
        ready: boolean;
        itemCount?: number;
      }>(`/api/dual-use-hsk/list?${u}`);
      setDbReady(data.ready);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setItemCount(data.itemCount ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록 조회 실패");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [keywordApplied, page, pageSize]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(async (hsCode: string) => {
    setDetailLoading(true);
    try {
      const data = await fetchJson<{ rows: DualUseHskDetailRow[] }>(
        `/api/dual-use-hsk/by-hs?hsCode=${encodeURIComponent(hsCode)}`,
      );
      setDetailItems(data.rows ?? []);
    } catch (e) {
      setDetailItems([]);
      setError(e instanceof Error ? e.message : "상세 조회 실패");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const onSearch = () => {
    setPage(1);
    setKeywordApplied(keywordDraft.trim());
    setSelected(null);
    setDetailItems([]);
  };

  const onReset = () => {
    setKeywordDraft("");
    setKeywordApplied("");
    setPage(1);
    setSelected(null);
    setDetailItems([]);
    setHighlightControl("");
  };

  const totalPg = Math.max(1, Math.ceil(total / pageSize) || 1);
  const pageSafe = Math.min(Math.max(1, page), totalPg);
  const block = useMemo(
    () => visiblePageBlock(pageSafe, totalPg),
    [pageSafe, totalPg],
  );

  const selectedTitle = selected
    ? `통제 상세 · HS ${selected.hsk_cd}`
    : "통제 상세";

  const selectRow = (row: DualUseHskListRow) => {
    setSelected(row);
    setHighlightControl(row.cntrl_no);
    void loadDetail(row.hsk_cd);
  };

  return (
    <CasPageShell>
      <CasPageHeader title="이중용도" />

      <p className="text-[12px] text-slate-600">
        전략물자관리시스템 · 전략물자(이중용도) HSK 연계표(
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1e2f4f] underline"
        >
          원본 사이트
        </a>
        ). DB:{" "}
        <code className="rounded bg-slate-100 px-1">crawl_hsk_control_*</code>
        {itemCount != null ? (
          <>
            {" "}
            · 적재 <strong>{itemCount.toLocaleString("ko-KR")}</strong>건
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
          이중용도 데이터가 없습니다. 가이드라인 크롤러로{" "}
          <code className="rounded bg-amber-50 px-1">crawl_hsk_control_item</code>{" "}
          등을 <code className="rounded bg-amber-50 px-1">smart_law_ai.db</code>에
          적재해 주세요.
        </p>
      ) : null}
      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}

      <div className="grid min-h-0 gap-3 lg:grid-cols-2">
        <CasCard title="이중용도 HSK 연계표" className="flex min-w-0 flex-col">
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
              <col style={{ width: "26%" }} />
              <col style={{ width: "46%" }} />
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
                rows.map((row, idx) => {
                  const active =
                    selected?.hsk_cd === row.hsk_cd &&
                    selected?.cntrl_no === row.cntrl_no;
                  return (
                    <tr
                      key={`${row.hsk_cd}-${row.cntrl_no}-${idx}`}
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
                        {row.hsk_cd}
                      </ClipGridTd>
                      <ClipGridTruncateCell title={formatItemName(row)}>
                        {formatItemName(row)}
                      </ClipGridTruncateCell>
                      <ClipGridTd
                        className={`${clipGridMonoClass} text-center ${
                          active ? "font-semibold text-[#1e2f4f]" : ""
                        }`}
                      >
                        {row.cntrl_no || "—"}
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
                detailItems.map((item, idx) => {
                  const active = item.cntrl_no === highlightControl;
                  return (
                    <section
                      key={`${item.cntrl_no}-${idx}`}
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
                          {item.cntrl_no || "(통제번호 없음)"}
                        </p>
                        {item.up_cntrl_no ? (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            상위: {item.up_cntrl_no}
                          </p>
                        ) : null}
                      </header>
                      <div className="space-y-2 px-3 py-3 text-[12px] leading-relaxed text-slate-800">
                        {item.ko_expl ? <p>{item.ko_expl}</p> : null}
                        {item.en_expl ? (
                          <p className="text-slate-600">{item.en_expl}</p>
                        ) : null}
                        {!item.ko_expl && !item.en_expl ? (
                          <p className="text-slate-500">상세 설명이 없습니다.</p>
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
