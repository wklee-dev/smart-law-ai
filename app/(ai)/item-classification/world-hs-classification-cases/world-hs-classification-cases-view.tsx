"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasResetButton,
  CasSearchButton,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  ClipGridDateCell,
  ClipGridEmptyRow,
  ClipGridLinkCell,
  ClipGridStatsBar,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipPaginationBar,
  ClipSortThButton,
  clipGridRowHoverClass,
  clipGridSeqClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import { EnforcementDateRangePicker } from "@/app/(ai)/item-classification/domestic-cases/enforcement-date-range-picker";
import {
  CLIP_WORLD_HS_CLASSIFICATION_COUNTRY_FLAG,
  type ClipWorldHsClassificationCaseListRow,
  type ClipWorldHsClassificationCaseSortKey,
} from "@/app/lib/clip-world-hs-classification-cases-shared";
import {
  searchParamsToListState,
  worldHsClassificationCasesPageHref,
  type ClipWorldHsClassificationCasesListState,
} from "@/app/lib/clip-world-hs-classification-cases-url";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  WorldHsClassificationArchiveTabs,
  type WorldHsClassificationArchiveTabKey,
} from "./archive-tabs";
import { WorldHsClassificationCasesDetailPanel } from "./detail-panel";

const PAGE_NUMBER_WINDOW = 10;
const DETAIL_SIDEBAR_PAGE_SIZE = 5;

const DATE_PRESETS = [
  { key: "1m", label: "1개월", months: 1 },
  { key: "6m", label: "6개월", months: 6 },
  { key: "1y", label: "1년", months: 12 },
  { key: "3y", label: "3년", months: 36 },
  { key: "5y", label: "5년", months: 60 },
] as const;


function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function registrationRangeForMonths(months: number): {
  registeredFrom: string;
  registeredTo: string;
} {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  return { registeredFrom: toIsoDate(from), registeredTo: toIsoDate(to) };
}

function visiblePageBlock(currentPage: number, totalPages: number): number[] {
  const tp = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(Math.max(1, Math.floor(currentPage)), tp);
  const start = Math.floor((cur - 1) * PAGE_NUMBER_WINDOW) * PAGE_NUMBER_WINDOW + 1;
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

function CountryCell({ country }: { country: string }) {
  const name = country.trim();
  if (!name) {
    return <ClipGridTd align="center">{"\u00a0"}</ClipGridTd>;
  }
  const code = CLIP_WORLD_HS_CLASSIFICATION_COUNTRY_FLAG[name];
  return (
    <ClipGridTd align="center">
      <span className="inline-flex items-center justify-center gap-1.5">
        {code ? (
          <Image
            src={`https://flagcdn.com/w40/${code === "uk" ? "gb" : code}.png`}
            alt=""
            width={20}
            height={14}
            className="inline-block h-3.5 w-5 object-cover"
            unoptimized
          />
        ) : null}
        <span>{name}</span>
      </span>
    </ClipGridTd>
  );
}

export default function WorldHsClassificationCasesView() {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const urlHydrated = useRef(false);

  const initialRange = registrationRangeForMonths(12);
  const [activeTab, setActiveTab] =
    useState<WorldHsClassificationArchiveTabKey>("cases");
  const selectedCaseId = (urlSearchParams.get("caseId") ?? "").trim();
  const [datePreset, setDatePreset] = useState<string>("1y");
  const [countries, setCountries] = useState<string[]>([]);
  const [effectivePeriods, setEffectivePeriods] = useState<string[]>([]);
  const [dbReady, setDbReady] = useState(true);

  const [draft, setDraft] = useState({
    ...initialRange,
    country: "",
    effectivePeriod: "",
    keywordField: "title",
    keyword: "",
  });
  const [applied, setApplied] = useState({ ...draft });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] =
    useState<ClipWorldHsClassificationCaseSortKey>("registered_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [rows, setRows] = useState<ClipWorldHsClassificationCaseListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (urlHydrated.current) return;
    urlHydrated.current = true;
    const parsed = searchParamsToListState(urlSearchParams);
    if (!parsed) return;
    setApplied({
      registeredFrom: parsed.registeredFrom,
      registeredTo: parsed.registeredTo,
      country: parsed.country,
      effectivePeriod: parsed.effectivePeriod,
      keywordField: parsed.keywordField,
      keyword: parsed.keyword,
    });
    setDraft({
      registeredFrom: parsed.registeredFrom,
      registeredTo: parsed.registeredTo,
      country: parsed.country,
      effectivePeriod: parsed.effectivePeriod,
      keywordField: parsed.keywordField,
      keyword: parsed.keyword,
    });
    setPage(parsed.page);
    setPageSize(parsed.pageSize);
    setSort(parsed.sort);
    setSortDir(parsed.sortDir);
  }, [urlSearchParams]);

  useEffect(() => {
    void fetchJson<{
      countries: string[];
      effectivePeriods: string[];
      ready: boolean;
    }>("/api/clip-world-hs-classification-cases/filters")
      .then((data) => {
        setCountries(data.countries ?? []);
        setEffectivePeriods(data.effectivePeriods ?? []);
        setDbReady(data.ready);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "필터 목록 조회 실패"),
      );
  }, []);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (applied.registeredFrom) u.set("registeredFrom", applied.registeredFrom);
    if (applied.registeredTo) u.set("registeredTo", applied.registeredTo);
    if (applied.country) u.set("country", applied.country);
    if (applied.effectivePeriod) u.set("effectivePeriod", applied.effectivePeriod);
    if (applied.keyword.trim()) u.set("keyword", applied.keyword.trim());
    u.set("keywordField", applied.keywordField);
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-world-hs-classification-cases/query?${u}`;
  }, [applied, page, pageSize, sort, sortDir]);

  const loadRows = useCallback(async () => {
    if (activeTab !== "cases") return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: ClipWorldHsClassificationCaseListRow[];
        total: number;
        ready: boolean;
      }>(buildQueryUrl());
      setDbReady(data.ready);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [activeTab, buildQueryUrl]);

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
    const range = registrationRangeForMonths(12);
    const empty = {
      ...range,
      country: "",
      effectivePeriod: "",
      keywordField: "title",
      keyword: "",
    };
    setDatePreset("1y");
    setDraft(empty);
    setApplied(empty);
    setPage(1);
    setSort("registered_date");
    setSortDir("desc");
  };

  const applyDatePreset = (months: number, presetKey: string) => {
    const range = registrationRangeForMonths(months);
    setDatePreset(presetKey);
    setDraft((p) => ({ ...p, ...range }));
  };

  const onHeaderSort = (key: ClipWorldHsClassificationCaseSortKey) => {
    if (sort === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir(key === "title" ? "asc" : "desc");
    }
    setPage(1);
  };

  const listState = useCallback((): ClipWorldHsClassificationCasesListState => {
    return {
      ...applied,
      page: curPageSafe,
      pageSize,
      sort,
      sortDir,
    };
  }, [applied, curPageSafe, pageSize, sort, sortDir]);

  const goToDetail = (caseId: string, rowIndex: number) => {
    const globalIndex = (curPageSafe - 1) * pageSize + rowIndex;
    const sidePage =
      Math.floor(globalIndex / DETAIL_SIDEBAR_PAGE_SIZE) + 1;
    router.push(
      worldHsClassificationCasesPageHref(urlSearchParams, {
        caseId,
        listPage: curPageSafe,
        sidePage,
        state: listState(),
      }),
    );
  };

  const onArchiveTabChange = (key: WorldHsClassificationArchiveTabKey) => {
    setActiveTab(key);
    if (key !== "cases" && selectedCaseId) {
      router.replace(
        worldHsClassificationCasesPageHref(urlSearchParams, { caseId: null }),
      );
    }
  };

  return (
    <CasPageShell>
      <CasPageHeader title="품목분류 자료실" />

      <WorldHsClassificationArchiveTabs
        activeKey={activeTab}
        onChange={onArchiveTabChange}
      />

      {activeTab !== "cases" ? (
        <CasCard title="안내">
          <p className="text-[13px] text-[#666]">
            {activeTab === "tariff"
              ? "관세율표 자료실은 준비 중입니다."
              : "기타 자료실은 준비 중입니다."}
          </p>
        </CasCard>
      ) : selectedCaseId ? (
        <WorldHsClassificationCasesDetailPanel caseId={selectedCaseId} />
      ) : (
        <>
          <CasCard title="검색">
            <div className="space-y-3">
              <ClassificationFormSplitField label="등록일자">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <EnforcementDateRangePicker
                    from={draft.registeredFrom}
                    to={draft.registeredTo}
                    onConfirm={(from, to) => {
                      setDatePreset("");
                      setDraft((p) => ({
                        ...p,
                        registeredFrom: from,
                        registeredTo: to,
                      }));
                    }}
                  />
                  <div className="flex flex-wrap gap-1">
                    {DATE_PRESETS.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        className={`rounded border px-2 py-0.5 text-[11px] ${
                          datePreset === preset.key
                            ? "border-[#1e2f4f] bg-[#1e2f4f] text-white"
                            : "border-stone-300 bg-white text-[#333] hover:bg-stone-50"
                        }`}
                        onClick={() =>
                          applyDatePreset(preset.months, preset.key)
                        }
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </ClassificationFormSplitField>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ClassificationFormSplitField label="국가">
                  <select
                    className={CLASSIFICATION_FORM_INPUT_CLASS}
                    value={draft.country}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, country: e.target.value }))
                    }
                  >
                    <option value="">전체</option>
                    {countries.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </ClassificationFormSplitField>

                <ClassificationFormSplitField label="검색어">
                  <div className="flex min-w-0 gap-1">
                    <select
                      className={`${CLASSIFICATION_FORM_INPUT_CLASS} w-[5.5rem] shrink-0`}
                      value={draft.keywordField}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          keywordField: e.target.value,
                        }))
                      }
                    >
                      <option value="title">제목</option>
                    </select>
                    <input
                      type="text"
                      className={`${CLASSIFICATION_FORM_INPUT_CLASS} min-w-0 flex-1`}
                      value={draft.keyword}
                      placeholder="검색어"
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, keyword: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onSearch();
                      }}
                    />
                  </div>
                </ClassificationFormSplitField>

                <ClassificationFormSplitField label="시행년월">
                  <select
                    className={CLASSIFICATION_FORM_INPUT_CLASS}
                    value={draft.effectivePeriod}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        effectivePeriod: e.target.value,
                      }))
                    }
                  >
                    <option value="">전체</option>
                    {effectivePeriods.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </ClassificationFormSplitField>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-[#f8f6f2] px-3 py-2.5">
              <CasResetButton onClick={onReset} disabled={loading} />
              <CasSearchButton onClick={onSearch} disabled={loading} />
            </div>
          </CasCard>

          <CasCard title="조회 결과" className="flex min-w-0 flex-col">
            <ClipGridStatsBar
              total={total}
              pageSize={pageSize}
              onPageSizeChange={(size) => {
                setPage(1);
                setPageSize(size);
              }}
            />

            {!dbReady ? (
              <p className="mb-2 text-[12px] text-amber-800">
                품목분류사례 데이터가 없습니다. `world_hs_classification_crawler.py`
                로 수집해 주세요.
              </p>
            ) : null}
            {error ? (
              <p className="mb-2 text-[12px] text-red-600">{error}</p>
            ) : null}

            <ClipGridTable>
              <colgroup>
                <col style={{ width: "6%" }} />
                <col style={{ width: "38%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
              </colgroup>
              <thead>
                <tr>
                  <ClipGridTh className="px-1 text-center">번호</ClipGridTh>
                  <ClipGridTh>
                    <ClipSortThButton
                      label="제목"
                      active={sort === "title"}
                      sortDir={sortDir}
                      onClick={() => onHeaderSort("title")}
                    />
                  </ClipGridTh>
                  <ClipGridTh className="text-center">국가</ClipGridTh>
                  <ClipGridTh className="text-center">시행년월</ClipGridTh>
                  <ClipGridTh className="text-center">
                    <ClipSortThButton
                      label="등록일자"
                      active={sort === "registered_date"}
                      sortDir={sortDir}
                      onClick={() => onHeaderSort("registered_date")}
                    />
                  </ClipGridTh>
                  <ClipGridTh className="text-center">
                    <ClipSortThButton
                      label="조회수"
                      active={sort === "view_count"}
                      sortDir={sortDir}
                      onClick={() => onHeaderSort("view_count")}
                    />
                  </ClipGridTh>
                </tr>
              </thead>
              <tbody>
                {(loading || rows.length === 0) && (
                  <ClipGridEmptyRow colSpan={6} loading={loading} />
                )}
                {!loading &&
                  rows.map((row, idx) => (
                    <tr key={row.case_id} className={clipGridRowHoverClass}>
                      <ClipGridTd className={`${clipGridSeqClass} text-center`}>
                        {(curPageSafe - 1) * pageSize + idx + 1}
                      </ClipGridTd>
                      <ClipGridLinkCell
                        label={row.title}
                        title={row.title}
                        onClick={() => goToDetail(row.case_id, idx)}
                      />
                      <CountryCell country={row.country} />
                      <ClipGridTd align="center">{row.effective_period}</ClipGridTd>
                      <ClipGridDateCell>{row.registered_date}</ClipGridDateCell>
                      <ClipGridTd align="center" className="tabular-nums">
                        {row.view_count.toLocaleString()}
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
        </>
      )}

    </CasPageShell>
  );
}
