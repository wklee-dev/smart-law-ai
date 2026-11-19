"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasResetButton,
  CasSearchButton,
  CasSubNavTabs,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { ClipPortalHtmlPanel } from "@/app/(ai)/customs-law-portal/clearance-info/clip-portal-html-panel";
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
  clipGridLinkClass,
  clipGridMonoClass,
  clipGridRowHoverClass,
  clipGridSeqClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import {
  formatClipCustomsChiefHsInput,
  formatClipCustomsChiefHsSgn,
} from "@/app/lib/clip-customs-chief-shared";
import {
  formatClipIntegratedNoticeIssueLabel,
  type ClipIntegratedNoticeDirectionFilter,
  type ClipIntegratedNoticeIssueRow,
  type ClipIntegratedNoticeListRow,
  type ClipIntegratedNoticeSortKey,
  type ClipIntegratedNoticeSummary,
  type ClipIntegratedNoticeTab,
} from "@/app/lib/clip-integrated-notice-shared";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;

const TABS: { key: ClipIntegratedNoticeTab; label: string }[] = [
  { key: "items", label: "수출입요령" },
  { key: "integrated", label: "종합정보" },
];

const SORT_COLUMNS: { key: ClipIntegratedNoticeSortKey; label: string }[] = [
  { key: "hs_code", label: "품목번호" },
  { key: "product_name", label: "품명" },
  { key: "related_law_name", label: "관련법령" },
  { key: "guidance_type_name", label: "수출입구분" },
];

const GUIDANCE_COLUMN = { label: "수출입요령" };

function visiblePageBlock(currentPage: number, totalPages: number): number[] {
  const tp = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(Math.max(1, Math.floor(currentPage)), tp);
  const start = Math.floor((cur - 1) / PAGE_NUMBER_WINDOW) * PAGE_NUMBER_WINDOW + 1;
  const end = Math.min(start + PAGE_NUMBER_WINDOW - 1, tp);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function str(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  return String(v);
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export default function IntegratedNoticeView() {
  const [activeTab, setActiveTab] = useState<ClipIntegratedNoticeTab>("items");
  const [issues, setIssues] = useState<ClipIntegratedNoticeIssueRow[]>([]);
  const [issueCode, setIssueCode] = useState("");

  const [draft, setDraft] = useState({
    hsCode: "",
    keyword: "",
    direction: "" as ClipIntegratedNoticeDirectionFilter,
  });
  const [applied, setApplied] = useState({ ...draft });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<ClipIntegratedNoticeSortKey>("hs_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const [rows, setRows] = useState<ClipIntegratedNoticeListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [dbTotal, setDbTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<ClipIntegratedNoticeSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("issueCode", issueCode);
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (applied.hsCode.trim()) u.set("hsCode", applied.hsCode.trim());
    if (applied.keyword.trim()) u.set("keyword", applied.keyword.trim());
    if (applied.direction) u.set("direction", applied.direction);
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-integrated-notice/query?${u}`;
  }, [applied, issueCode, page, pageSize, sort, sortDir]);

  useEffect(() => {
    void fetchJson<{ issues: ClipIntegratedNoticeIssueRow[] }>(
      "/api/clip-integrated-notice/issues",
    )
      .then((data) => {
        const list = data.issues ?? [];
        setIssues(list);
        if (list[0]?.issue_code) setIssueCode(list[0].issue_code);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "발령번호 조회 실패"));
  }, []);

  const loadRows = useCallback(async () => {
    if (!issueCode || activeTab !== "items") return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: ClipIntegratedNoticeListRow[];
        total: number;
        dbTotal: number;
      }>(buildQueryUrl());
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setDbTotal(data.dbTotal ?? 0);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [activeTab, buildQueryUrl, issueCode]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const loadSummary = useCallback(async () => {
    if (activeTab !== "integrated") return;
    setSummaryLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ summary: ClipIntegratedNoticeSummary | null }>(
        "/api/clip-integrated-notice/summary",
      );
      setSummary(data.summary ?? null);
    } catch (e) {
      setSummary(null);
      setError(e instanceof Error ? e.message : "종합정보 조회 실패");
    } finally {
      setSummaryLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

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
      keyword: "",
      direction: "" as ClipIntegratedNoticeDirectionFilter,
    };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
    setSort("hs_code");
    setSortDir("asc");
  };

  const onHeaderSort = (key: ClipIntegratedNoticeSortKey) => {
    if (sortRef.current === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  return (
    <CasPageShell>
      <CasPageHeader title="통합공고" />

      <CasSubNavTabs
        tabs={TABS}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as ClipIntegratedNoticeTab)}
      />

      {activeTab === "items" && (
        <>
          <CasCard title="검색">
            <div className="grid gap-3 lg:grid-cols-2">
              <ClassificationFormSplitField
                label="발령번호(발령일자)"
                labelClassName="w-[8.75rem] whitespace-nowrap sm:w-[9.25rem]"
              >
                <select
                  className={CLASSIFICATION_FORM_INPUT_CLASS}
                  value={issueCode}
                  onChange={(e) => {
                    setIssueCode(e.target.value);
                    setPage(1);
                  }}
                >
                  {issues.length === 0 ? (
                    <option value="">발령번호 없음</option>
                  ) : (
                    issues.map((issue) => (
                      <option key={issue.issue_code} value={issue.issue_code}>
                        {formatClipIntegratedNoticeIssueLabel(issue)}
                      </option>
                    ))
                  )}
                </select>
              </ClassificationFormSplitField>

              <ClassificationFormSplitField label="수출입구분">
                <div className="flex flex-wrap items-center gap-4 px-1 py-1 text-[12px] text-[#333]">
                  {(
                    [
                      ["", "전체"],
                      ["11", "수출요령"],
                      ["12", "수입요령"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value || "all"} className="inline-flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="direction"
                        checked={draft.direction === value}
                        onChange={() =>
                          setDraft((p) => ({ ...p, direction: value }))
                        }
                        className="h-3.5 w-3.5 border-[#d8dee6]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </ClassificationFormSplitField>

              <ClassificationFormSplitField label="품목번호">
                <input
                  type="text"
                  className={`${CLASSIFICATION_FORM_INPUT_CLASS} font-mono`}
                  value={draft.hsCode}
                  placeholder="예: 0101.21-1000"
                  inputMode="numeric"
                  maxLength={13}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      hsCode: formatClipCustomsChiefHsInput(e.target.value),
                    }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && onSearch()}
                />
              </ClassificationFormSplitField>

              <ClassificationFormSplitField label="수출입요령">
                <input
                  type="text"
                  className={CLASSIFICATION_FORM_INPUT_CLASS}
                  value={draft.keyword}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, keyword: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && onSearch()}
                />
              </ClassificationFormSplitField>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-[#f8f6f2] px-3 py-2.5">
              <CasResetButton onClick={onReset} disabled={loading} />
              <CasSearchButton onClick={onSearch} disabled={loading} />
            </div>
          </CasCard>

          <CasCard title="조회 결과" className="flex min-w-0 flex-col">
            {dbTotal === 0 && !loading ? (
              <p className="mb-2 text-[12px] leading-relaxed text-[#666]">
                수집된 데이터가 없습니다.{" "}
                <code className="text-[11px]">clip_crawler.py</code>로 통합공고를
                수집하면{" "}
                <code className="text-[11px]">clip_integrated_notice_items</code>{" "}
                테이블에 적재됩니다.
              </p>
            ) : null}
            {error ? <p className="mb-2 text-[12px] text-red-600">{error}</p> : null}

            <ClipGridStatsBar
              total={total}
              pageSize={pageSize}
              onPageSizeChange={(size) => {
                setPage(1);
                setPageSize(size);
              }}
            />

            <ClipGridTable fixedLayout={false} minWidth="980px">
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "38%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "13%" }} />
              </colgroup>
              <thead>
                <tr>
                  <ClipGridTh className="px-1">번호</ClipGridTh>
                  {SORT_COLUMNS.slice(0, 2).map(({ key, label }) => (
                    <ClipGridTh key={key}>
                      <ClipSortThButton
                        label={label}
                        active={sort === key}
                        sortDir={sortDir}
                        align="left"
                        onClick={() => onHeaderSort(key)}
                      />
                    </ClipGridTh>
                  ))}
                  <ClipGridTh className="text-left">{GUIDANCE_COLUMN.label}</ClipGridTh>
                  {SORT_COLUMNS.slice(2).map(({ key, label }) => (
                    <ClipGridTh key={key}>
                      <ClipSortThButton
                        label={label}
                        active={sort === key}
                        sortDir={sortDir}
                        align={key === "related_law_name" ? "left" : "center"}
                        onClick={() => onHeaderSort(key)}
                      />
                    </ClipGridTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(loading || rows.length === 0) && (
                  <ClipGridEmptyRow colSpan={6} loading={loading} />
                )}
                {!loading &&
                  rows.map((r, idx) => {
                    const seq = (curPageSafe - 1) * pageSize + idx + 1;
                    return (
                      <tr key={r.item_id} className={clipGridRowHoverClass}>
                        <ClipGridTd className={clipGridSeqClass}>{seq}</ClipGridTd>
                        <ClipGridLabelCell
                          className={clipGridMonoClass}
                          title={formatClipCustomsChiefHsSgn(r.hs_code, "")}
                        >
                          {formatClipCustomsChiefHsSgn(r.hs_code, "")}
                        </ClipGridLabelCell>
                        <ClipGridTruncateCell
                          align="left"
                          title={str(r.product_name)}
                        >
                          {str(r.product_name)}
                        </ClipGridTruncateCell>
                        <ClipGridTd align="left" className="align-top">
                          <span className="whitespace-pre-wrap text-[12px] leading-relaxed">
                            {str(r.import_export_guidance)}
                          </span>
                        </ClipGridTd>
                        <ClipGridTd align="left" className="align-top">
                          {r.related_link?.trim() ? (
                            <a
                              href={r.related_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`${clipGridLinkClass} text-[12px]`}
                            >
                              {str(r.related_law_name)}
                            </a>
                          ) : (
                            <span className="text-[12px]">{str(r.related_law_name)}</span>
                          )}
                        </ClipGridTd>
                        <ClipGridLabelCell title={str(r.guidance_type_name)}>
                          {str(r.guidance_type_name)}
                        </ClipGridLabelCell>
                      </tr>
                    );
                  })}
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
        </>
      )}

      {activeTab === "integrated" && (
        <CasCard title="종합정보">
          {error ? <p className="mb-2 text-[12px] text-red-600">{error}</p> : null}
          <ClipPortalHtmlPanel
            html={summary?.body_html}
            text={summary?.body_text}
            loading={summaryLoading}
            emptyMessage="종합정보가 없습니다. clip_crawler.py --no-import-export 수집 후 clip_integrated_notice_general_info에 표시됩니다."
          />
        </CasCard>
      )}
    </CasPageShell>
  );
}
