"use client";

import { CasResetButton, CasSearchButton } from "@/app/components/search-action-buttons";
import {
  CasCard,
  CasPageHeader,
  CasPageShell,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  ClipGridDateCell,
  ClipGridEmptyRow,
  ClipGridLabelCell,
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
  clipGridMonoClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import {
  CLIP_RULE_TYPE_TABS,
  formatClipIssueDate,
  type ClipAdminRuleDetail,
  type ClipAdminRuleListRow,
  type ClipAdminRuleSortKey,
  type ClipSatelliteUiRow,
  type ClipTabCounts,
} from "@/app/lib/clip-admin-rule-shared";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

/** 포털·품목분류와 동일: 10페이지 단위 번호 구간 */
const PAGE_NUMBER_WINDOW = 10;

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

type UiTabKey = "ALL" | "고시" | "훈령" | "예규" | "공고";

const SORT_COLUMNS: {
  key: ClipAdminRuleSortKey;
  label: string;
}[] = [
  { key: "rule_name", label: "행정규칙명" },
  { key: "rule_type", label: "종류" },
  { key: "dept_name", label: "소관부처명" },
  { key: "manager_name", label: "담당부서명" },
  { key: "issue_no", label: "발령번호" },
  { key: "issue_date", label: "발령일자" },
  { key: "revision_type", label: "개정유형" },
];

function str(v: unknown): string {
  if (v === null || v === undefined) return "—";
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

type DetailModalKind = null | "history" | "annex" | "attachment";

export default function CustomsLawPortalAdminRulesPage() {
  const [deptOpts, setDeptOpts] = useState<string[]>([]);
  const [managerOpts, setManagerOpts] = useState<string[]>([]);
  const [draft, setDraft] = useState({
    dept: "",
    manager: "",
    ruleName: "",
    includeAbolished: true,
  });
  const [applied, setApplied] = useState({
    dept: "",
    manager: "",
    ruleName: "",
    includeAbolished: true,
  });
  const [activeTab, setActiveTab] = useState<UiTabKey>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [sort, setSort] = useState<ClipAdminRuleSortKey>("issue_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const [tabCounts, setTabCounts] = useState<ClipTabCounts | null>(null);
  const [rows, setRows] = useState<ClipAdminRuleListRow[]>([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detail, setDetail] = useState<ClipAdminRuleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);

  const detailAnchorRef = useRef<HTMLDivElement>(null);
  const modalScrollRef = useRef<HTMLDivElement>(null);

  const [detailModal, setDetailModal] = useState<DetailModalKind>(null);
  const [annexRows, setAnnexRows] = useState<ClipSatelliteUiRow[]>([]);
  const [attachRows, setAttachRows] = useState<ClipSatelliteUiRow[]>([]);
  const [satBusy, setSatBusy] = useState(false);
  const [satErrorModal, setSatErrorModal] = useState<string | null>(null);

  const closeDetailModal = useCallback(() => {
    setDetailModal(null);
    setSatErrorModal(null);
    setSatBusy(false);
  }, []);

  useEffect(() => {
    if (!detailModal) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetailModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailModal, closeDetailModal]);

  const openHistoryModal = useCallback(() => {
    setDetailModal("history");
    setSatErrorModal(null);
  }, []);

  const openAnnexModal = useCallback(async () => {
    if (!detail?.rule_id) return;
    setDetailModal("annex");
    setSatBusy(true);
    setSatErrorModal(null);
    setAnnexRows([]);
    try {
      const data = await fetchJson<{ rows: ClipSatelliteUiRow[] }>(
        `/api/clip-admin-rule/satellite?ruleId=${encodeURIComponent(detail.rule_id)}&kind=annex`,
      );
      setAnnexRows(data.rows);
    } catch (e) {
      setSatErrorModal(e instanceof Error ? e.message : String(e));
    } finally {
      setSatBusy(false);
    }
  }, [detail?.rule_id]);

  const openAttachModal = useCallback(async () => {
    if (!detail?.rule_id) return;
    setDetailModal("attachment");
    setSatBusy(true);
    setSatErrorModal(null);
    setAttachRows([]);
    try {
      const data = await fetchJson<{ rows: ClipSatelliteUiRow[] }>(
        `/api/clip-admin-rule/satellite?ruleId=${encodeURIComponent(detail.rule_id)}&kind=attachment`,
      );
      setAttachRows(data.rows);
    } catch (e) {
      setSatErrorModal(e instanceof Error ? e.message : String(e));
    } finally {
      setSatBusy(false);
    }
  }, [detail?.rule_id]);

  const loadFilters = useCallback(async () => {
    const data = await fetchJson<{
      dept_names: string[];
      manager_names: string[];
    }>("/api/clip-admin-rule/filters");
    setDeptOpts(data.dept_names);
    setManagerOpts(data.manager_names);
  }, []);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("tab", activeTab === "ALL" ? "ALL" : activeTab);
    if (applied.ruleName.trim()) u.set("ruleName", applied.ruleName.trim());
    if (applied.dept.trim()) u.set("dept", applied.dept.trim());
    if (applied.manager.trim()) u.set("manager", applied.manager.trim());
    if (applied.includeAbolished) u.set("includeAbolished", "1");
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-admin-rule/query?${u}`;
  }, [page, pageSize, activeTab, applied, sort, sortDir]);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        tabCounts: ClipTabCounts;
        rows: ClipAdminRuleListRow[];
        total: number;
      }>(buildQueryUrl());
      setTabCounts(data.tabCounts);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [buildQueryUrl]);

  useEffect(() => {
    void (async () => {
      try {
        await loadFilters();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [loadFilters]);

  useEffect(() => {
    void runQuery();
  }, [runQuery]);

  const onHeaderSort = useCallback((key: ClipAdminRuleSortKey) => {
    setPage(1);
    if (sortRef.current === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir("asc");
    }
  }, []);

  const resetForm = useCallback(() => {
    const empty = {
      dept: "",
      manager: "",
      ruleName: "",
      includeAbolished: true,
    };
    setDraft(empty);
    setApplied(empty);
    setActiveTab("ALL");
    setPage(1);
    setSort("issue_date");
    setSortDir("desc");
  }, []);

  const openDetail = useCallback(async (ruleId: string) => {
    closeDetailModal();
    setSelectedRuleId(ruleId);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const d = await fetchJson<ClipAdminRuleDetail>(
        `/api/clip-admin-rule/detail?ruleId=${encodeURIComponent(ruleId)}`,
      );
      setDetail(d);
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
  }, [closeDetailModal]);

  const totalPg = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const curPageSafe = Math.min(Math.max(1, page), totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  function tabBadgeCount(key: UiTabKey): number {
    if (!tabCounts) return 0;
    if (key === "ALL") return tabCounts.전체;
    return tabCounts[key];
  }

  return (
    <CasPageShell>
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-4">
        <CasPageHeader title="행정규칙" />

        <div className="overflow-hidden rounded-lg border border-stone-300 bg-[#f5f2ea] shadow-sm ring-1 ring-stone-200/80">
          <div className="divide-y divide-stone-300 bg-white">
            {/* 소관부처 / 담당부서 한 줄 레퍼런스 패턴 */}
            <div className="flex min-h-[2.75rem] items-stretch bg-white">
              <div className="flex w-[6.65rem] shrink-0 items-center justify-end border-r border-stone-300 bg-[#ebe8e0] px-2 py-2 text-[11px] font-semibold text-slate-800 sm:w-52 sm:text-[12px]">
                소관부처 / 담당부서
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 px-3 py-2">
                <select
                  className={`${CLASSIFICATION_FORM_INPUT_CLASS} w-[min(100%,13rem)] sm:max-w-[14rem]`}
                  value={draft.dept}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, dept: e.target.value }))
                  }
                >
                  <option value="">— 전체 —</option>
                  {deptOpts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select
                  className={`${CLASSIFICATION_FORM_INPUT_CLASS} w-[min(100%,13rem)] sm:max-w-[14rem]`}
                  value={draft.manager}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, manager: e.target.value }))
                  }
                >
                  <option value="">— 전체 —</option>
                  {managerOpts.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    className="rounded border-stone-400"
                    checked={draft.includeAbolished}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        includeAbolished: e.target.checked,
                      }))
                    }
                  />
                  폐지규칙 포함
                </label>
              </div>
            </div>

            <ClassificationFormSplitField label="행정규칙명">
              <input
                type="text"
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={draft.ruleName}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, ruleName: e.target.value }))
                }
                placeholder="행정규칙명 키워드"
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

        {/* 종류 탭 — 레퍼런스: 검색 블록 아래 */}
        <div className="flex overflow-x-auto rounded-t-md border border-stone-300 bg-stone-200/70 shadow-inner">
          {(
            [
              { key: "ALL", label: "전체" },
              ...CLIP_RULE_TYPE_TABS.map((t) => ({ key: t, label: t })),
            ] as { key: UiTabKey; label: string }[]
          ).map((t, i, arr) => {
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
                <span
                  className={
                    sel ? "opacity-95" : "text-slate-600"
                  }
                >
                  [{n}]
                </span>
              </button>
            );
          })}
        </div>

        <CasCard title="조회 결과" className="flex min-w-0 flex-col">
          {error && (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

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
              <col style={{ width: "37%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <tr>
                <ClipGridTh>번호</ClipGridTh>
                {SORT_COLUMNS.map(({ key, label }) => (
                  <ClipGridTh key={key}>
                    <ClipSortThButton
                      label={label}
                      active={sort === key}
                      sortDir={sortDir}
                      align={key === "rule_name" ? "left" : "center"}
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
                rows.map((r, idx) => {
                  const seq = (curPageSafe - 1) * pageSize + idx + 1;
                  const sel = selectedRuleId === r.rule_id;
                  const ruleName = str(r.rule_name);
                  return (
                    <tr
                      key={r.rule_id}
                      className={`${clipGridRowHoverClass} ${
                        sel ? "bg-[#1e2f4f]/5" : ""
                      }`}
                    >
                      <ClipGridTd className={clipGridSeqClass}>
                        {seq}
                      </ClipGridTd>
                      <ClipGridLinkCell
                        label={ruleName}
                        title={ruleName}
                        onClick={() => void openDetail(r.rule_id)}
                      />
                      <ClipGridTruncateCell align="center" title={str(r.rule_type)}>
                        {str(r.rule_type)}
                      </ClipGridTruncateCell>
                      <ClipGridTruncateCell align="center" title={str(r.dept_name)}>
                        {str(r.dept_name)}
                      </ClipGridTruncateCell>
                      <ClipGridTruncateCell align="center" title={str(r.manager_name)}>
                        {str(r.manager_name)}
                      </ClipGridTruncateCell>
                      <ClipGridTruncateCell
                        align="center"
                        className={clipGridMonoClass}
                        title={str(r.issue_no)}
                      >
                        {str(r.issue_no)}
                      </ClipGridTruncateCell>
                      <ClipGridDateCell title={formatClipIssueDate(r.issue_date)}>
                        {formatClipIssueDate(r.issue_date)}
                      </ClipGridDateCell>
                      <ClipGridLabelCell title={str(r.revision_type)}>
                        {str(r.revision_type)}
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

        <div ref={detailAnchorRef}>
          {(detailLoading || detailError || detail) && (
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
                <h2 className="text-sm font-bold text-slate-900">
                  행정규칙 본문
                </h2>
                <button
                  type="button"
                  disabled={!detail}
                  onClick={() =>
                    typeof window !== "undefined" && window.print()
                  }
                  className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-white disabled:opacity-40 print:hidden"
                >
                  인쇄
                </button>
              </div>

              {detailLoading && (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  불러오는 중…
                </p>
              )}
              {detailError && (
                <p className="border-l-4 border-red-400 px-4 py-3 text-sm text-red-800">
                  {detailError}
                </p>
              )}
              {detail && !detailLoading && (
                <div className="px-4 py-5">
                  <h3 className="text-lg font-semibold tracking-tight text-blue-700 sm:text-xl">
                    {detail.rule_name || "—"}
                  </h3>
                  <p className="mt-2 text-sm text-slate-700">
                    {detail.dept_name}
                    {detail.manager_name ? ` (${detail.manager_name})` : ""}
                    · <span className="text-slate-500">{detail.rule_type}</span>
                    {detail.issue_no ? (
                      <>
                        {" "}
                        · 제{detail.issue_no}호 ·{" "}
                        {formatClipIssueDate(detail.issue_date)}
                      </>
                    ) : null}
                    {detail.revision_type ? (
                      <span className="text-slate-500">
                        {" "}
                        · {detail.revision_type}
                      </span>
                    ) : null}
                  </p>

                  <div className="mt-5 overflow-hidden rounded-md border border-stone-200 bg-white shadow-sm">
                    <div className="flex flex-wrap divide-x divide-stone-300 border-b border-stone-300 bg-[#f8fafc] text-[13px] text-slate-800">
                      <button
                        type="button"
                        onClick={() => openHistoryModal()}
                        className="flex min-h-[2.75rem] items-center gap-2 px-4 py-2 hover:bg-blue-50/90"
                      >
                        <svg
                          className="size-5 shrink-0 text-blue-600"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          aria-hidden
                        >
                          <path
                            d="M9 11h6M9 15h4M9 7h8M7 5h10a2 2 0 012 2v12l-4-2H7a2 2 0 01-2-2V7a2 2 0 012-2z"
                            strokeWidth="1.6"
                          />
                          <path
                            d="M11 13l2 2 3-4"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                        연혁
                      </button>
                      <button
                        type="button"
                        onClick={() => void openAnnexModal()}
                        disabled={!detail.rule_id}
                        className="flex min-h-[2.75rem] items-center gap-2 px-4 py-2 hover:bg-blue-50/90 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <svg
                          className="size-5 shrink-0 text-blue-600"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden
                        >
                          <path d="M6 4h11a3 3 0 013 3v13H9a3 3 0 01-3-3V6a2 2 0 012-2z" />
                          <path
                            d="M6 18V7c0-.6.4-1 1-1h9v12H7a1 1 0 01-1-1z"
                            className="text-white opacity-95"
                          />
                        </svg>
                        별표/서식
                      </button>
                      <button
                        type="button"
                        onClick={() => void openAttachModal()}
                        disabled={!detail.rule_id}
                        className="flex min-h-[2.75rem] items-center gap-2 px-4 py-2 hover:bg-blue-50/90 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <svg
                          className="size-5 shrink-0 text-blue-600"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          aria-hidden
                        >
                          <path
                            d="M14 2H8a2 2 0 00-2 2v16a2 2 0 002 2h8a2 2 0 002-2V7l-5-5z"
                            strokeWidth="1.6"
                          />
                          <path
                            d="M14 2v5h5M12 18h5M12 14h5M12 10h5"
                            strokeWidth="1.6"
                          />
                          <circle cx="8" cy="10" r="1" fill="currentColor" />
                        </svg>
                        첨부파일
                      </button>
                    </div>

                    <div className="max-w-none px-3 py-4 text-[13px] leading-relaxed text-slate-900 [&_.lawcon]:text-inherit [&_h1]:text-lg [&_h2]:text-base [&_img]:max-w-full [&_p]:leading-relaxed">
                      {/* 로컬 DB HTML — 신뢰 경로 */}
                      {/* eslint-disable-next-line react/no-danger */}
                      <div
                        dangerouslySetInnerHTML={{ __html: detail.content }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {detailModal && detail && !detailLoading && (
          <div
            role="presentation"
            className="fixed inset-0 z-[340] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-14 pb-12"
            onClick={() => closeDetailModal()}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeDetailModal();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="clip-detail-modal-title"
              className="relative w-full max-w-3xl rounded-lg border border-slate-200 bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <h3
                  id="clip-detail-modal-title"
                  className="text-sm font-bold text-slate-900"
                >
                  {detailModal === "history" && "연혁"}
                  {detailModal === "annex" && "별표 / 서식"}
                  {detailModal === "attachment" && "첨부파일"}
                </h3>
                <button
                  type="button"
                  className="rounded border border-transparent px-2 py-1 text-lg leading-none text-slate-600 hover:bg-slate-100"
                  onClick={() => closeDetailModal()}
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>

              <div
                ref={modalScrollRef}
                className="max-h-[min(72vh,720px)] overflow-y-auto px-4 py-4"
              >
                {satErrorModal && (
                  <p className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-800">
                    {satErrorModal}
                  </p>
                )}
                {(detailModal === "annex" || detailModal === "attachment") &&
                  satBusy && (
                    <p className="py-10 text-center text-sm text-slate-500">
                      불러오는 중…
                    </p>
                  )}

                {detailModal === "history" && (
                  <>
                    <p className="mb-2 text-xs text-slate-600">
                      전체{" "}
                      <strong className="text-blue-700">
                        {detail.history.length}
                      </strong>{" "}
                      건
                    </p>
                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="min-w-[640px] w-full border-collapse text-[12px]">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="w-14 border-b border-slate-200 px-2 py-2 text-center font-semibold">
                              번호
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">
                              행정규칙명
                            </th>
                            <th className="w-28 border-b border-slate-200 px-2 py-2 text-center font-semibold whitespace-nowrap">
                              공고번호
                            </th>
                            <th className="w-28 border-b border-slate-200 px-2 py-2 text-center font-semibold whitespace-nowrap">
                              개정일자
                            </th>
                            <th className="w-28 border-b border-slate-200 px-2 py-2 text-center font-semibold whitespace-nowrap">
                              개정상태
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.history.map((h, idx) => (
                            <tr
                              key={h.history_id || idx}
                              className={`border-b border-slate-100 ${
                                idx === 0 ? "bg-amber-50/90" : ""
                              }`}
                            >
                              <td className="align-top px-2 py-2 text-center text-slate-600">
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2 align-top leading-snug">
                                <div className="font-medium text-slate-900">
                                  {str(h.rule_name)}
                                </div>
                              </td>
                              <td className="px-2 py-2 text-center align-top font-mono text-xs whitespace-nowrap">
                                {str(h.issue_no)}
                              </td>
                              <td className="px-2 py-2 text-center align-top whitespace-nowrap">
                                {formatClipIssueDate(h.revision_date)}
                              </td>
                              <td className="px-2 py-2 text-center align-top text-xs leading-snug">
                                {str(h.revision_status)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!detail.history.length && (
                      <p className="py-12 text-center text-sm text-slate-500">
                        등록된 연혁 정보가 없습니다.
                      </p>
                    )}
                  </>
                )}

                {detailModal === "annex" && !satBusy && (
                  <>
                    <p className="mb-2 text-xs text-slate-600">
                      전체{" "}
                      <strong className="text-blue-700">{annexRows.length}</strong>{" "}
                      건
                    </p>
                    {annexRows.length === 0 ? (
                      <p className="py-12 text-center text-sm text-slate-500">
                        등록된 별표·서식이 없습니다. (
                        <code className="text-[11px]">admin_rule_annex</code> 등 테이블
                        또는 저장 경로를 확인해 주세요.)
                      </p>
                    ) : (
                      <table className="w-full border-collapse overflow-hidden rounded border border-slate-200 text-[12px]">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="w-14 border-b border-slate-200 px-2 py-2 text-center font-semibold">
                              번호
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">
                              별표/서식
                            </th>
                            <th className="w-36 border-b border-slate-200 px-2 py-2 text-left font-semibold">
                              유형·시행
                            </th>
                            <th className="w-44 border-b border-slate-200 px-2 py-2 text-center font-semibold">
                              뷰어
                            </th>
                            <th className="w-44 border-b border-slate-200 px-2 py-2 text-center font-semibold">
                              다운로드
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {annexRows.map((r, i) => (
                            <tr key={r.recordId} className="border-b border-slate-100">
                              <td className="px-2 py-2 text-center text-slate-600">
                                {i + 1}
                              </td>
                              <td className="px-3 py-2 align-top leading-snug break-words text-slate-900">
                                {r.label}
                              </td>
                              <td className="px-2 py-2 align-top text-xs text-slate-600">
                                {r.subLabel ?? "—"}
                              </td>
                              <td className="px-2 py-2 text-center align-top">
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                  {r.pdfHref ? (
                                    <a
                                      className="text-xs font-semibold text-red-600 underline"
                                      href={r.pdfHref}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      PDF
                                    </a>
                                  ) : r.fileHref ? (
                                    <a
                                      className="text-xs text-blue-600 underline"
                                      href={r.fileHref}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      보기
                                    </a>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2 py-2 text-center align-top">
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                  {r.pdfHref ? (
                                    <a
                                      className="text-xs font-semibold text-red-600 underline"
                                      download
                                      href={r.pdfHref}
                                    >
                                      PDF
                                    </a>
                                  ) : null}
                                  {r.hwpHref ? (
                                    <a
                                      className="text-xs font-semibold text-blue-700 underline"
                                      download
                                      href={r.hwpHref}
                                    >
                                      HWP
                                    </a>
                                  ) : null}
                                  {!r.pdfHref &&
                                    !r.hwpHref &&
                                    r.fileHref && (
                                      <a
                                        className="text-xs text-blue-600 underline"
                                        download
                                        href={r.fileHref}
                                      >
                                        파일
                                      </a>
                                    )}
                                  {!r.pdfHref && !r.hwpHref && !r.fileHref && (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}

                {detailModal === "attachment" && !satBusy && (
                  <>
                    <p className="mb-2 text-xs text-slate-600">
                      전체{" "}
                      <strong className="text-blue-700">
                        {attachRows.length}
                      </strong>{" "}
                      건
                    </p>
                    {attachRows.length === 0 ? (
                      <p className="py-12 text-center text-sm text-slate-500">
                        등록된 첨부파일이 없습니다. (
                        <code className="text-[11px]">
                          admin_rule_attachment
                        </code>{" "}
                        테이블·경로를 확인해 주세요.)
                      </p>
                    ) : (
                      <table className="w-full border-collapse overflow-hidden rounded border border-slate-200 text-[12px]">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="w-14 border-b border-slate-200 px-2 py-2 text-center font-semibold">
                              번호
                            </th>
                            <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">
                              첨부파일명
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {attachRows.map((r, i) => {
                            const href =
                              r.fileHref ?? r.externalHref ?? null;
                            const isExternal = !r.fileHref && !!r.externalHref;
                            return (
                              <tr
                                key={r.recordId}
                                className="border-b border-slate-100"
                              >
                                <td className="px-2 py-2 text-center text-slate-600">
                                  {i + 1}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {href ? (
                                    <a
                                      href={href}
                                      className="text-blue-700 underline underline-offset-2"
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {r.label}
                                    </a>
                                  ) : (
                                    <span>{r.label}</span>
                                  )}
                                  {r.subLabel ? (
                                    <p className="mt-0.5 text-xs text-slate-500">
                                      {r.subLabel}
                                    </p>
                                  ) : null}
                                  {isExternal ? (
                                    <p className="mt-0.5 text-[11px] text-slate-400">
                                      외부 링크:{" "}
                                      <code className="break-all">
                                        {r.externalHref}
                                      </code>
                                    </p>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-2.5">
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50"
                  onClick={() =>
                    modalScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                  }
                >
                  TOP
                </button>
                <button
                  type="button"
                  className="rounded border border-slate-300 bg-white px-3 py-1 text-xs hover:bg-slate-50"
                  onClick={() => closeDetailModal()}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </CasPageShell>
  );
}
