"use client";

import { useCallback, useMemo, useState } from "react";
import { Cas3mDataGrid } from "@/app/(ai)/cas-api/3m-sap-if/cas-3m-data-grid";
import { fetchCasNcomSearch } from "@/app/(ai)/cas-ncom/cas-ncom-search-client";
import type { UseCasNcomAuthResult } from "@/app/(ai)/cas-ncom/use-cas-ncom-auth";
import {
  CasAlert,
  CasCard,
  CasCompactInput,
  CasInlineField,
  CasSearchButton,
  CasResultStats,
  CasSearchFormActions,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  CasSearchFieldsRow,
  CasSearchFormRow,
} from "@/app/(ai)/cas-ncom/cas-page-top-bar";
import {
  cellValue,
  HS_ORIGIN_DISPLAY_COLUMNS,
  HS_ORIGIN_SEARCH_MODES,
  type HsOriginRow,
  type HsOriginSearchMode,
} from "@/app/lib/cas-3m-hs-origin-columns";

export function HsOriginView({ auth }: { auth: UseCasNcomAuthResult }) {
  const defaultYear = useMemo(() => String(new Date().getFullYear()), []);
  const [year, setYear] = useState(defaultYear);
  const [searchMode, setSearchMode] = useState<HsOriginSearchMode>("");
  const [searchWord, setSearchWord] = useState("");

  const [items, setItems] = useState<HsOriginRow[]>([]);
  const [total, setTotal] = useState(0);
  const [tCnt, setTCnt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("yr", year.trim());
      if (searchMode) {
        params.set("search_mode", searchMode);
        params.set("search_word", searchWord.trim());
      }

      const result = await fetchCasNcomSearch<HsOriginRow>(
        "/api/cas-api/3m-hs-origin/search",
        params,
        auth.ensureSession,
        auth.handleAuthFailure,
      );

      setItems(result.items);
      setTotal(result.total);
      setTCnt(result.tCnt);
      setSearched(true);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setTCnt(0);
      setErr(e instanceof Error ? e.message : String(e));
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [
    auth.ensureSession,
    auth.handleAuthFailure,
    searchMode,
    searchWord,
    year,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <CasCard title="검색조건">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void loadList();
          }}
        >
          <CasSearchFormRow
            fields={
              <CasSearchFieldsRow>
                <CasInlineField label="조회년도" aligned>
                  <CasCompactInput
                    className="w-[72px]"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="YYYY"
                    maxLength={4}
                  />
                </CasInlineField>

                <CasInlineField label="검색구분" aligned>
                  <select
                    className="h-9 w-[140px] rounded-md border border-slate-200 bg-white px-2 text-[13px] text-slate-800 shadow-sm focus:border-[#1e2f4f] focus:outline-none focus:ring-2 focus:ring-[#1e2f4f]/20"
                    value={searchMode}
                    onChange={(e) =>
                      setSearchMode(e.target.value as HsOriginSearchMode)
                    }
                  >
                    {HS_ORIGIN_SEARCH_MODES.map((mode) => (
                      <option key={mode.value || "all"} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                </CasInlineField>

                <CasInlineField label="검색어" aligned>
                  <CasCompactInput
                    className="w-[200px]"
                    value={searchWord}
                    disabled={!searchMode}
                    placeholder={searchMode ? "검색어 입력" : "전체 조회"}
                    onChange={(e) => setSearchWord(e.target.value)}
                  />
                </CasInlineField>
              </CasSearchFieldsRow>
            }
            actions={
              <CasSearchFormActions inline>
                <CasSearchButton type="submit" disabled={loading || !auth.session}>
                  {loading ? "조회 중…" : "조회"}
                </CasSearchButton>
              </CasSearchFormActions>
            }
          />
        </form>
      </CasCard>

      <CasCard
        title="HS-원산지결정기준"
        className="flex min-h-[420px] flex-1 flex-col"
        bodyClassName="flex min-h-0 flex-1 flex-col px-3 py-2"
        action={
          searched && !loading ? (
            <CasResultStats total={total} tCnt={tCnt} />
          ) : undefined
        }
      >
        {err ? (
          <div className="mb-4">
            <CasAlert tone="error">{err}</CasAlert>
          </div>
        ) : null}

        <Cas3mDataGrid
          columns={HS_ORIGIN_DISPLAY_COLUMNS}
          rows={items}
          loading={loading}
          searched={searched}
          getCellValue={cellValue}
          rowKey={(row, idx) => `${row.ftaAgr ?? ""}-${row.hs ?? ""}-${idx}`}
        />
      </CasCard>
    </div>
  );
}
