"use client";

import { CasResetButton, CasSearchButton } from "@/app/components/search-action-buttons";
import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasSecondaryButton,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  ClipGridDateCell,
  ClipGridEmptyRow,
  ClipGridLinkCell,
  ClipGridStatsBar,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipGridTruncateCell,
  ClipPaginationBar,
  ClipSortThButton,
  clipGridRowHoverClass,
  clipGridSeqClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import {
  CLIP_LATEST_LAW_TYPE_TABS,
  clipLatestLawRowKey,
  type ClipLatestLawDetail,
  type ClipLatestLawListRow,
  type ClipLatestLawSortKey,
  type ClipLatestLawTabCounts,
  type ClipLatestLawTypeCode,
} from "@/app/lib/clip-latest-law-shared";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;

type UiTabKey = "ALL" | ClipLatestLawTypeCode;

const SORT_COLUMNS: { key: ClipLatestLawSortKey; label: string }[] = [
  { key: "law_name", label: "법령명" },
  { key: "category_name", label: "분야" },
  { key: "law_type_name", label: "종류" },
  { key: "jurisdiction_name", label: "소관부처명" },
  { key: "enforcement_date", label: "시행일자" },
  { key: "promulgation_date", label: "공포일자" },
  { key: "revision_type_name", label: "제개정구분" },
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
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export default function ClipLatestLawsPage() {
  const [dbReady, setDbReady] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);

  const [draft, setDraft] = useState({
    category: "",
    jurisdiction: "",
    lawName: "",
  });
  const [applied, setApplied] = useState({ ...draft });
  const [activeTab, setActiveTab] = useState<UiTabKey>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<ClipLatestLawSortKey>("promulgation_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [tabCounts, setTabCounts] = useState<ClipLatestLawTabCounts | null>(
    null,
  );
  const [rows, setRows] = useState<ClipLatestLawListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClipLatestLawDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchJson<{ ready: boolean; categories: string[]; jurisdictions: string[] }>(
      "/api/clip-latest-law/filters",
    )
      .then((data) => {
        setDbReady(data.ready);
        setCategories(data.categories ?? []);
        setJurisdictions(data.jurisdictions ?? []);
      })
      .catch(() => setDbReady(false));
  }, []);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("tab", activeTab);
    if (applied.category.trim()) u.set("category", applied.category.trim());
    if (applied.jurisdiction.trim()) {
      u.set("jurisdiction", applied.jurisdiction.trim());
    }
    if (applied.lawName.trim()) u.set("lawName", applied.lawName.trim());
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-latest-law/query?${u}`;
  }, [page, pageSize, activeTab, applied, sort, sortDir]);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        tabCounts: ClipLatestLawTabCounts;
        rows: ClipLatestLawListRow[];
        total: number;
      }>(buildQueryUrl());
      setTabCounts(data.tabCounts);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [buildQueryUrl]);

  useEffect(() => {
    void runQuery();
  }, [runQuery]);

  const openDetail = useCallback(async (row: ClipLatestLawListRow) => {
    const key = clipLatestLawRowKey(row.law_id, row.pmgt_dt_tp_no);
    setSelectedKey(key);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const data = await fetchJson<{ detail: ClipLatestLawDetail }>(
        `/api/clip-latest-law/detail?key=${encodeURIComponent(key)}`,
      );
      setDetail(data.detail);
      requestAnimationFrame(() => {
        detailAnchorRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const onHeaderSort = (key: ClipLatestLawSortKey) => {
    if (sort === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir(key === "law_name" ? "asc" : "desc");
    }
    setPage(1);
  };

  const resetForm = () => {
    const empty = { category: "", jurisdiction: "", lawName: "" };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
    setActiveTab("ALL");
    setSort("promulgation_date");
    setSortDir("desc");
  };

  const totalPg = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const curPageSafe = Math.min(Math.max(1, page), totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  function tabBadgeCount(key: UiTabKey): number {
    if (!tabCounts) return 0;
    if (key === "ALL") return tabCounts.전체;
    if (key === "A01") return tabCounts.법률;
    if (key === "A02") return tabCounts.시행령;
    if (key === "A03") return tabCounts.시행규칙;
    return 0;
  }

  const typeTabs: { key: UiTabKey; label: string }[] = [
    { key: "ALL", label: "전체" },
    ...CLIP_LATEST_LAW_TYPE_TABS.map((t) => ({
      key: t.code as UiTabKey,
      label: t.label,
    })),
  ];

  return (
    <CasPageShell>
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-4">
        <CasPageHeader title="최신법령" />

        {!dbReady ? (
          <p className="text-[12px] text-amber-800">
            `latest_laws` 데이터가 없습니다. Manus 크롤러(`crawl_latest_laws.py`)로
            `C:/SQLiteDB/smart_law_ai.db`에 수집해 주세요.
          </p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-stone-300 bg-[#f5f2ea] shadow-sm ring-1 ring-stone-200/80">
          <div className="divide-y divide-stone-300 bg-white">
            <ClassificationFormSplitField label="분야">
              <select
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={draft.category}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, category: e.target.value }))
                }
              >
                <option value="">— 전체 —</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </ClassificationFormSplitField>

            <ClassificationFormSplitField label="소관부처">
              <select
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={draft.jurisdiction}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, jurisdiction: e.target.value }))
                }
              >
                <option value="">— 전체 —</option>
                {jurisdictions.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </ClassificationFormSplitField>

            <ClassificationFormSplitField label="법령명">
              <input
                type="text"
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={draft.lawName}
                placeholder="법령명"
                onChange={(e) =>
                  setDraft((p) => ({ ...p, lawName: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setApplied({ ...draft });
                    setPage(1);
                  }
                }}
              />
            </ClassificationFormSplitField>

            <div className="flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-[#f8f6f2] px-3 py-2.5">
              <CasResetButton
                type="button"
                disabled={loading}
                onClick={resetForm}
              />
              <CasSearchButton
                type="button"
                disabled={loading}
                onClick={() => {
                  setApplied({ ...draft });
                  setPage(1);
                }}
              >
                {loading ? "조회 중…" : "조회"}
              </CasSearchButton>
            </div>
          </div>
        </div>

        <div className="flex overflow-x-auto rounded-t-md border border-stone-300 bg-stone-200/70 shadow-inner">
          {typeTabs.map((t, i, arr) => {
            const sel = activeTab === t.key;
            const n = tabBadgeCount(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setActiveTab(t.key);
                  setPage(1);
                }}
                className={`min-w-0 shrink-0 whitespace-nowrap border-stone-300 px-3 py-2.5 text-xs font-semibold sm:px-5 sm:text-sm ${
                  i < arr.length - 1 ? "border-r" : ""
                } ${
                  sel
                    ? "bg-[#1e2f4f] text-white shadow-sm"
                    : "bg-stone-100 text-slate-800 hover:bg-white"
                }`}
              >
                {t.label}{" "}
                <span className={sel ? "opacity-95" : "text-slate-600"}>
                  [{n}]
                </span>
              </button>
            );
          })}
        </div>

        <CasCard title="조회 결과" className="flex min-w-0 flex-col">
          {error ? (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <ClipGridStatsBar
            total={total}
            pageSize={pageSize}
            loading={loading}
            onPageSizeChange={(size) => {
              setPage(1);
              setPageSize(size);
            }}
          />

          <ClipGridTable>
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: "28%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <tr>
                <ClipGridTh className="text-center">번호</ClipGridTh>
                {SORT_COLUMNS.map(({ key, label }) => (
                  <ClipGridTh key={key}>
                    <ClipSortThButton
                      label={label}
                      active={sort === key}
                      sortDir={sortDir}
                      align={key === "law_name" ? "left" : "center"}
                      onClick={() => onHeaderSort(key)}
                    />
                  </ClipGridTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {(loading || rows.length === 0) && (
                <ClipGridEmptyRow colSpan={8} loading={loading} />
              )}
              {!loading &&
                rows.map((row, idx) => {
                  const key = clipLatestLawRowKey(row.law_id, row.pmgt_dt_tp_no);
                  const active = selectedKey === key;
                  return (
                    <tr
                      key={key}
                      className={`${clipGridRowHoverClass} ${active ? "bg-[#e8eef7]/60" : ""}`}
                    >
                      <ClipGridTd className={`${clipGridSeqClass} text-center`}>
                        {(curPageSafe - 1) * pageSize + idx + 1}
                      </ClipGridTd>
                      <ClipGridLinkCell
                        label={row.law_name}
                        title={row.law_name}
                        onClick={() => void openDetail(row)}
                      />
                      <ClipGridTruncateCell title={row.category_name}>
                        {str(row.category_name)}
                      </ClipGridTruncateCell>
                      <ClipGridTd align="center">{str(row.law_type_name)}</ClipGridTd>
                      <ClipGridTruncateCell title={row.jurisdiction_name}>
                        {str(row.jurisdiction_name)}
                      </ClipGridTruncateCell>
                      <ClipGridDateCell>{row.enforcement_date}</ClipGridDateCell>
                      <ClipGridDateCell>{row.promulgation_date}</ClipGridDateCell>
                      <ClipGridTd align="center">
                        {str(row.revision_type_name)}
                      </ClipGridTd>
                    </tr>
                  );
                })}
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

        {(detailLoading || detail || detailError) && (
          <div ref={detailAnchorRef}>
            <CasCard title="법령 상세" className="flex min-w-0 flex-col">
              {detailLoading ? (
                <p className="text-[13px] text-[#666]">불러오는 중…</p>
              ) : null}
              {detailError ? (
                <p className="text-[13px] text-red-600">{detailError}</p>
              ) : null}
              {detail ? (
                <div className="space-y-4">
                  <table className="w-full border-collapse text-left text-[13px]">
                    <tbody>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="w-28 bg-[#f8fafc] px-3 py-2 font-semibold">
                          법령명
                        </th>
                        <td className="px-3 py-2">{detail.law_name}</td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          분야
                        </th>
                        <td className="px-3 py-2">{str(detail.category_name)}</td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          종류
                        </th>
                        <td className="px-3 py-2">{str(detail.law_type_name)}</td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          소관부처
                        </th>
                        <td className="px-3 py-2">
                          {str(detail.jurisdiction_name)}
                        </td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          시행일자
                        </th>
                        <td className="px-3 py-2">{detail.enforcement_date}</td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          공포일자
                        </th>
                        <td className="px-3 py-2">{detail.promulgation_date}</td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          제개정구분
                        </th>
                        <td className="px-3 py-2">
                          {str(detail.revision_type_name)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {detail.attachments.length > 0 ? (
                    <div>
                      <p className="mb-2 text-[12px] font-semibold text-[#1e2f4f]">
                        첨부파일
                      </p>
                      <ul className="space-y-1 text-[13px]">
                        {detail.attachments.map((a) => (
                          <li key={a.attachment_id}>
                            {a.has_local_file ? (
                              <a
                                href={`/api/clip-latest-law/download?attachmentId=${encodeURIComponent(a.attachment_id)}`}
                                className="text-[#1e2f4f] underline"
                              >
                                {a.attachment_label || a.original_filename}
                              </a>
                            ) : (
                              <span className="text-[#666]">
                                {a.attachment_label || a.original_filename} — 로컬
                                없음
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="max-h-[520px] overflow-auto rounded border border-[#e5e9ef] bg-[#fafafa] p-3">
                    {detail.law_body_html ? (
                      <div
                        className="prose prose-sm max-w-none text-[13px] leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: detail.law_body_html }}
                      />
                    ) : detail.law_body_text ? (
                      <pre className="whitespace-pre-wrap font-sans text-[13px]">
                        {detail.law_body_text}
                      </pre>
                    ) : (
                      <p className="text-[#666]">본문이 없습니다.</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {detail.detail_url ? (
                      <a
                        href={detail.detail_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-[#1e2f4f] underline"
                      >
                        CLIP 원본 화면
                      </a>
                    ) : null}
                    <CasSecondaryButton
                      type="button"
                      onClick={() => {
                        setDetail(null);
                        setSelectedKey(null);
                        setDetailError(null);
                      }}
                    >
                      닫기
                    </CasSecondaryButton>
                  </div>
                </div>
              ) : null}
            </CasCard>
          </div>
        )}
      </div>
    </CasPageShell>
  );
}
