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
  ClipGridTruncateCell,
  ClipPaginationBar,
  clipGridRowHoverClass,
  clipGridSeqClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import {
  LAW_INFO_CENTER_CATEGORY_TABS,
  type LawInfoCenterCategoryCode,
  type LawInfoCenterDetail,
  type LawInfoCenterListRow,
  type LawInfoCenterTabCounts,
} from "@/app/lib/law-info-center-latest-shared";
import {
  formatFileSize,
  YestradeHtmlPanel,
} from "@/app/(ai)/kita/yestrade-content-panel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;
const SOURCE_URL = "https://www.law.go.kr/LSW/lawRvsRssR.do";

type UiTabKey = "ALL" | LawInfoCenterCategoryCode;
type DetailTab = "articles" | "addenda" | "annexes" | "attachments";

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

export function LawInfoCenterLatestView() {
  const [dbReady, setDbReady] = useState(true);
  const [ministries, setMinistries] = useState<string[]>([]);
  const [lawTypes, setLawTypes] = useState<string[]>([]);

  const [draft, setDraft] = useState({
    ministry: "",
    lawType: "",
    keyword: "",
  });
  const [applied, setApplied] = useState({ ...draft });
  const [activeTab, setActiveTab] = useState<UiTabKey>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [tabCounts, setTabCounts] = useState<LawInfoCenterTabCounts | null>(
    null,
  );
  const [rows, setRows] = useState<LawInfoCenterListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<LawInfoCenterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("articles");
  const detailAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchJson<{
      ready: boolean;
      ministries: string[];
      lawTypes: string[];
    }>("/api/law-info-center/latest-laws/filters")
      .then((data) => {
        setDbReady(data.ready);
        setMinistries(data.ministries ?? []);
        setLawTypes(data.lawTypes ?? []);
      })
      .catch(() => setDbReady(false));
  }, []);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (activeTab !== "ALL") u.set("category", activeTab);
    if (applied.ministry.trim()) u.set("ministry", applied.ministry.trim());
    if (applied.lawType.trim()) u.set("lawType", applied.lawType.trim());
    if (applied.keyword.trim()) u.set("keyword", applied.keyword.trim());
    return `/api/law-info-center/latest-laws/query?${u}`;
  }, [page, pageSize, activeTab, applied]);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        ready: boolean;
        tabCounts: LawInfoCenterTabCounts;
        rows: LawInfoCenterListRow[];
        total: number;
      }>(buildQueryUrl());
      setDbReady(data.ready);
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

  const openDetail = useCallback(async (row: LawInfoCenterListRow) => {
    setSelectedKey(row.key);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setDetailTab("articles");
    try {
      const data = await fetchJson<{ detail: LawInfoCenterDetail }>(
        `/api/law-info-center/latest-laws/detail?key=${encodeURIComponent(row.key)}`,
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

  const resetForm = () => {
    const empty = { ministry: "", lawType: "", keyword: "" };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
    setActiveTab("ALL");
  };

  const totalPg = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const curPageSafe = Math.min(Math.max(1, page), totalPg);
  const block = useMemo(
    () => visiblePageBlock(curPageSafe, totalPg),
    [curPageSafe, totalPg],
  );

  function tabBadgeCount(key: UiTabKey): number {
    if (!tabCounts) return 0;
    if (key === "ALL") return tabCounts.전체;
    return tabCounts[key] ?? 0;
  }

  const typeTabs: { key: UiTabKey; label: string }[] = [
    { key: "ALL", label: "전체" },
    ...LAW_INFO_CENTER_CATEGORY_TABS.map((t) => ({
      key: t.code as UiTabKey,
      label: t.label,
    })),
  ];

  const detailTabs: { key: DetailTab; label: string; count: number }[] = [
    {
      key: "articles",
      label: "본문",
      count: detail?.articles.length ?? 0,
    },
    {
      key: "addenda",
      label: "부칙",
      count: detail?.addenda.length ?? 0,
    },
    {
      key: "annexes",
      label: "별표/서식",
      count: detail?.annexes.length ?? 0,
    },
    {
      key: "attachments",
      label: "첨부",
      count: detail?.attachments.length ?? 0,
    },
  ];

  return (
    <CasPageShell>
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-4">
        <CasPageHeader title="최신법령" />
        <p className="text-[12px] text-slate-600">
          국가법령정보센터 ·{" "}
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#1e2f4f] underline"
          >
            법령 &gt; 최신법령
          </a>
          . 테이블{" "}
          <code className="rounded bg-slate-100 px-1">llc_v1_*</code>
        </p>

        {!dbReady || (tabCounts != null && tabCounts.전체 === 0) ? (
          <p className="text-[12px] text-amber-800">
            `llc_v1_list` 데이터가 없거나 비어 있습니다. LawLatestCrawler로
            `C:/SQLiteDB/smart_law_ai.db`에 수집해 주세요.
          </p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-stone-300 bg-[#f5f2ea] shadow-sm ring-1 ring-stone-200/80">
          <div className="divide-y divide-stone-300 bg-white">
            <ClassificationFormSplitField label="소관부처">
              <select
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={draft.ministry}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, ministry: e.target.value }))
                }
              >
                <option value="">— 전체 —</option>
                {ministries.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </ClassificationFormSplitField>

            <ClassificationFormSplitField label="법령종류">
              <select
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={draft.lawType}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, lawType: e.target.value }))
                }
              >
                <option value="">— 전체 —</option>
                {lawTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </ClassificationFormSplitField>

            <ClassificationFormSplitField label="법령명">
              <input
                type="text"
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={draft.keyword}
                placeholder="법령명 · 조문 · 매칭키워드"
                onChange={(e) =>
                  setDraft((p) => ({ ...p, keyword: e.target.value }))
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
                className={`min-w-0 shrink-0 whitespace-nowrap border-stone-300 px-3 py-2.5 text-xs font-semibold sm:px-4 sm:text-sm ${
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
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "14%" }} />
            </colgroup>
            <thead>
              <tr>
                <ClipGridTh className="text-center">번호</ClipGridTh>
                <ClipGridTh>법령명</ClipGridTh>
                <ClipGridTh className="text-center">구분</ClipGridTh>
                <ClipGridTh className="text-center">종류</ClipGridTh>
                <ClipGridTh className="text-center">소관부처</ClipGridTh>
                <ClipGridTh className="text-center">공포일자</ClipGridTh>
                <ClipGridTh className="text-center">시행일자</ClipGridTh>
                <ClipGridTh className="text-center">제개정</ClipGridTh>
              </tr>
            </thead>
            <tbody>
              {(loading || rows.length === 0) && (
                <ClipGridEmptyRow colSpan={8} loading={loading} />
              )}
              {!loading &&
                rows.map((row, idx) => {
                  const active = selectedKey === row.key;
                  return (
                    <tr
                      key={row.key}
                      className={`${clipGridRowHoverClass} ${active ? "bg-[#e8eef7]/60" : ""}`}
                    >
                      <ClipGridTd className={`${clipGridSeqClass} text-center`}>
                        {(curPageSafe - 1) * pageSize + idx + 1}
                      </ClipGridTd>
                      <ClipGridLinkCell
                        label={row.title}
                        title={row.title}
                        onClick={() => void openDetail(row)}
                      />
                      <ClipGridTd align="center">{str(row.category)}</ClipGridTd>
                      <ClipGridTd align="center">{str(row.lawType)}</ClipGridTd>
                      <ClipGridTruncateCell title={row.ministry}>
                        {str(row.ministry)}
                      </ClipGridTruncateCell>
                      <ClipGridDateCell>{row.announceDate}</ClipGridDateCell>
                      <ClipGridDateCell>{row.effectiveDate}</ClipGridDateCell>
                      <ClipGridTd align="center">
                        {str(row.revisionType)}
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
                        <td className="px-3 py-2">
                          {detail.title}
                          {detail.sourceUrl ? (
                            <>
                              {" · "}
                              <a
                                href={detail.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#1e2f4f] underline"
                              >
                                원본
                              </a>
                            </>
                          ) : null}
                        </td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          구분
                        </th>
                        <td className="px-3 py-2">{str(detail.category)}</td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          종류
                        </th>
                        <td className="px-3 py-2">{str(detail.lawType)}</td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          소관부처
                        </th>
                        <td className="px-3 py-2">{str(detail.ministry)}</td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          공포번호
                        </th>
                        <td className="px-3 py-2">{str(detail.announceNo)}</td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          공포일자
                        </th>
                        <td className="px-3 py-2">{str(detail.announceDate)}</td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          시행일자
                        </th>
                        <td className="px-3 py-2">
                          {str(detail.effectiveDate)}
                        </td>
                      </tr>
                      <tr className="border-b border-[#e5e9ef]">
                        <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                          제개정
                        </th>
                        <td className="px-3 py-2">
                          {str(detail.revisionType)}
                        </td>
                      </tr>
                      {detail.articleLabel ? (
                        <tr className="border-b border-[#e5e9ef]">
                          <th className="bg-[#f8fafc] px-3 py-2 font-semibold">
                            조문
                          </th>
                          <td className="px-3 py-2">{detail.articleLabel}</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>

                  <div className="flex flex-wrap gap-1 border-b border-[#e5e9ef] pb-2">
                    {detailTabs.map((t) => {
                      const on = detailTab === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setDetailTab(t.key)}
                          className={`rounded px-3 py-1.5 text-[12px] font-semibold ${
                            on
                              ? "bg-[#1e2f4f] text-white"
                              : "border border-[#d8dee6] bg-white text-[#333] hover:bg-[#f8fafc]"
                          }`}
                        >
                          {t.label} [{t.count}]
                        </button>
                      );
                    })}
                  </div>

                  {detailTab === "attachments" ? (
                    detail.attachments.length === 0 ? (
                      <p className="text-[13px] text-[#666]">첨부 없음</p>
                    ) : (
                      <ul className="space-y-1 text-[13px]">
                        {detail.attachments.map((a) => (
                          <li key={a.partId}>
                            {a.hasLocalFile ? (
                              <a
                                href={a.downloadUrl}
                                className="text-[#1e2f4f] underline"
                              >
                                {a.displayName}
                              </a>
                            ) : a.sourceUrl ? (
                              <a
                                href={a.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#1e2f4f] underline"
                              >
                                {a.displayName}
                              </a>
                            ) : (
                              <span className="text-[#666]">
                                {a.displayName}
                              </span>
                            )}
                            <span className="ml-2 text-[11px] text-[#888]">
                              {formatFileSize(a.sizeBytes)} · {a.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : (
                    (() => {
                      const parts =
                        detailTab === "articles"
                          ? detail.articles
                          : detailTab === "addenda"
                            ? detail.addenda
                            : detail.annexes;
                      if (parts.length === 0) {
                        return (
                          <p className="text-[13px] text-[#666]">내용 없음</p>
                        );
                      }
                      return (
                        <div className="max-h-[520px] space-y-4 overflow-auto rounded border border-[#e5e9ef] bg-[#fafafa] p-3">
                          {parts.map((p) => (
                            <div key={p.partId}>
                              {p.title ? (
                                <p className="mb-1 text-[13px] font-semibold text-[#1e2f4f]">
                                  {p.title}
                                </p>
                              ) : null}
                              <YestradeHtmlPanel
                                html={p.html}
                                text={p.text}
                                emptyMessage="—"
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })()
                  )}
                </div>
              ) : null}
            </CasCard>
          </div>
        )}
      </div>
    </CasPageShell>
  );
}
