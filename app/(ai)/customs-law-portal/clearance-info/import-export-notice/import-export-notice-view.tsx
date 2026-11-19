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
import type {
  ClipImexNoticeListRow,
  ClipImexNoticeMasterRow,
  ClipImexNoticeSortKey,
  ClipImexNoticeSummary,
  ClipImexNoticeTab,
  ClipImexNoticeTypeFilter,
} from "@/app/lib/clip-imex-notice-shared";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;

const TABS: { key: ClipImexNoticeTab; label: string }[] = [
  { key: "items", label: "물품목록" },
  { key: "integrated", label: "종합정보" },
];

const SORT_COLUMNS: { key: ClipImexNoticeSortKey; label: string }[] = [
  { key: "hs_code", label: "품목번호" },
  { key: "item_name", label: "품명" },
  { key: "imex_type_name", label: "수출입구분" },
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

function GuidanceCell({ row }: { row: ClipImexNoticeListRow }) {
  const html = row.guidance_html?.trim();
  if (html) {
    return (
      <div
        className="clip-ntx-content text-left text-[12px] leading-relaxed text-[#333] [&_ul]:list-none [&_ul]:pl-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  const text = row.guidance_text?.trim();
  if (!text) return null;
  return <span className="whitespace-pre-wrap">{text}</span>;
}

export default function ImportExportNoticeView() {
  const [activeTab, setActiveTab] = useState<ClipImexNoticeTab>("items");
  const [notices, setNotices] = useState<ClipImexNoticeMasterRow[]>([]);
  const [noticeKey, setNoticeKey] = useState("");

  const [draft, setDraft] = useState({
    hsCode: "",
    keyword: "",
    imexType: "" as ClipImexNoticeTypeFilter,
  });
  const [applied, setApplied] = useState({ ...draft });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<ClipImexNoticeSortKey>("hs_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const [rows, setRows] = useState<ClipImexNoticeListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [dbTotal, setDbTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [summary, setSummary] = useState<ClipImexNoticeSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("noticeKey", noticeKey);
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (applied.hsCode.trim()) u.set("hsCode", applied.hsCode.trim());
    if (applied.keyword.trim()) u.set("keyword", applied.keyword.trim());
    if (applied.imexType) u.set("imexType", applied.imexType);
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-imex-notice/query?${u}`;
  }, [applied, noticeKey, page, pageSize, sort, sortDir]);

  useEffect(() => {
    void fetchJson<{ notices: ClipImexNoticeMasterRow[] }>(
      "/api/clip-imex-notice/notices",
    )
      .then((data) => {
        const list = data.notices ?? [];
        setNotices(list);
        if (list[0]?.notice_key) setNoticeKey(list[0].notice_key);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "발령번호 조회 실패"));
  }, []);

  const loadRows = useCallback(async () => {
    if (!noticeKey || activeTab !== "items") return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: ClipImexNoticeListRow[];
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
  }, [activeTab, buildQueryUrl, noticeKey]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const loadSummary = useCallback(async () => {
    if (activeTab !== "integrated") return;
    const key = noticeKey || notices[0]?.notice_key;
    if (!key) return;
    setSummaryLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ summary: ClipImexNoticeSummary | null }>(
        `/api/clip-imex-notice/summary?noticeKey=${encodeURIComponent(key)}`,
      );
      setSummary(data.summary ?? null);
    } catch (e) {
      setSummary(null);
      setError(e instanceof Error ? e.message : "종합정보 조회 실패");
    } finally {
      setSummaryLoading(false);
    }
  }, [activeTab, noticeKey, notices]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const totalPg = Math.max(1, Math.ceil(total / pageSize));
  const curPageSafe = Math.min(page, totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  const onSearch = () => {
    setApplied({ ...draft, imexType: draft.imexType });
    setPage(1);
  };

  const onReset = () => {
    const empty = { hsCode: "", keyword: "", imexType: "" as ClipImexNoticeTypeFilter };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
    setSort("hs_code");
    setSortDir("asc");
  };

  const onHeaderSort = (key: ClipImexNoticeSortKey) => {
    if (sortRef.current === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const noticeLabel = (n: ClipImexNoticeMasterRow) => {
    const no = n.notice_no.trim();
    const date = n.notice_date.trim();
    if (no && date) return `${no} (${date})`;
    return no || date || n.notice_key;
  };

  return (
    <CasPageShell>
      <CasPageHeader title="수출입공고" />

      <CasSubNavTabs
        tabs={TABS}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as ClipImexNoticeTab)}
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
                  value={noticeKey}
                  onChange={(e) => {
                    setNoticeKey(e.target.value);
                    setPage(1);
                  }}
                >
                  {notices.length === 0 ? (
                    <option value="">발령번호 없음</option>
                  ) : (
                    notices.map((n) => (
                      <option key={n.notice_key} value={n.notice_key}>
                        {noticeLabel(n)}
                      </option>
                    ))
                  )}
                </select>
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

              <ClassificationFormSplitField label="수출입구분">
                <div className="flex flex-wrap items-center gap-4 px-1 py-1 text-[12px] text-[#333]">
                  {(
                    [
                      ["", "전체"],
                      ["01", "수출금지"],
                      ["02", "수출제한"],
                      ["03", "수입제한"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value || "all"} className="inline-flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="imexType"
                        checked={draft.imexType === value}
                        onChange={() =>
                          setDraft((p) => ({ ...p, imexType: value }))
                        }
                        className="h-3.5 w-3.5 border-[#d8dee6]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
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
                <code className="text-[11px]">customs_notice_crawler.py</code>로
                수출입공고를 수집하면{" "}
                <code className="text-[11px]">imex_notice_item</code> 테이블에
                적재됩니다.
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

            <ClipGridTable fixedLayout={false} minWidth="920px">
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "48%" }} />
                <col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr>
                  <ClipGridTh className="px-1">번호</ClipGridTh>
                  {SORT_COLUMNS.filter((c) => c.key !== "imex_type_name").map(
                    ({ key, label }) => (
                      <ClipGridTh key={key}>
                        <ClipSortThButton
                          label={label}
                          active={sort === key}
                          sortDir={sortDir}
                          align={key === "item_name" ? "left" : "center"}
                          onClick={() => onHeaderSort(key)}
                        />
                      </ClipGridTh>
                    ),
                  )}
                  <ClipGridTh className="text-left">수출입요령</ClipGridTh>
                  <ClipGridTh>
                    <ClipSortThButton
                      label="수출입구분"
                      active={sort === "imex_type_name"}
                      sortDir={sortDir}
                      onClick={() => onHeaderSort("imex_type_name")}
                    />
                  </ClipGridTh>
                </tr>
              </thead>
              <tbody>
                {(loading || rows.length === 0) && (
                  <ClipGridEmptyRow colSpan={5} loading={loading} />
                )}
                {!loading &&
                  rows.map((r, idx) => {
                    const seq = (curPageSafe - 1) * pageSize + idx + 1;
                    return (
                      <tr key={r.notice_item_key} className={clipGridRowHoverClass}>
                        <ClipGridTd className={clipGridSeqClass}>{seq}</ClipGridTd>
                        <ClipGridLabelCell
                          className={clipGridMonoClass}
                          title={formatClipCustomsChiefHsSgn(r.hs_code, "")}
                        >
                          {formatClipCustomsChiefHsSgn(r.hs_code, "")}
                        </ClipGridLabelCell>
                        <ClipGridTruncateCell align="left" title={str(r.item_name)}>
                          {str(r.item_name)}
                        </ClipGridTruncateCell>
                        <ClipGridTd align="left" className="align-top">
                          <GuidanceCell row={r} />
                        </ClipGridTd>
                        <ClipGridLabelCell title={str(r.imex_type_name)}>
                          {str(r.imex_type_name)}
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
            html={summary?.content_html}
            text={summary?.content_text}
            loading={summaryLoading}
            emptyMessage="종합정보가 없습니다. customs_notice_crawler.py 수집 후 imex_notice_summary에 표시됩니다."
          />
        </CasCard>
      )}
    </CasPageShell>
  );
}
