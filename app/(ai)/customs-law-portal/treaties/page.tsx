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
  CLIP_TREATY_CATEGORY_TABS,
  type ClipFtaAgreementDocDetail,
  type ClipFtaAgreementDocSummary,
  type ClipTreatyDetail,
  type ClipTreatyListRow,
  type ClipTreatySortKey,
  type ClipTreatyTabCounts,
  type ClipTreatyTabKey,
} from "@/app/lib/clip-treaty-shared";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

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

const SORT_COLUMNS: { key: ClipTreatySortKey; label: string }[] = [
  { key: "treaty_name", label: "조약명" },
  { key: "category_name", label: "분야" },
  { key: "countries", label: "조약체결국가명" },
  { key: "treaty_number", label: "조약번호" },
  { key: "effective_date", label: "발효일자" },
];

function str(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
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

function MetaCell({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: ReactNode;
}) {
  return (
    <div className="min-w-0 border border-stone-200 bg-white px-3 py-2">
      <div className="text-[10px] font-semibold text-[#94a3b8]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] text-[#333]">
        {children ?? value ?? "—"}
      </div>
    </div>
  );
}

function pickPreferredAgreementDoc(
  docs: ClipFtaAgreementDocSummary[],
): ClipFtaAgreementDocSummary | null {
  const ok = docs.filter((d) => d.extract_status === "ok" && d.content_chars > 0);
  const pool = ok.length ? ok : docs;
  if (!pool.length) return null;
  return (
    pool.find((d) => d.lang.toUpperCase() === "KO") ??
    pool.find((d) => d.lang.toUpperCase() === "EN") ??
    pool[0]
  );
}

export default function CustomsLawPortalTreatiesPage() {
  const [draft, setDraft] = useState({ treatyName: "", countryName: "" });
  const [applied, setApplied] = useState({ treatyName: "", countryName: "" });
  const [activeTab, setActiveTab] = useState<ClipTreatyTabKey>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<ClipTreatySortKey>("effective_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const [tabCounts, setTabCounts] = useState<ClipTreatyTabCounts | null>(null);
  const [rows, setRows] = useState<ClipTreatyListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClipTreatyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailAnchorRef = useRef<HTMLDivElement>(null);
  const agreementAnchorRef = useRef<HTMLDivElement>(null);

  const [agreementDoc, setAgreementDoc] =
    useState<ClipFtaAgreementDocDetail | null>(null);
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [agreementError, setAgreementError] = useState<string | null>(null);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [bodyLang, setBodyLang] = useState<"KO" | "EN" | "BOTH">("KO");
  const bodyInfoRef = useRef<HTMLDivElement>(null);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("tab", activeTab === "ALL" ? "ALL" : activeTab);
    if (applied.treatyName.trim()) u.set("treatyName", applied.treatyName.trim());
    if (applied.countryName.trim()) u.set("countryName", applied.countryName.trim());
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-treaty/query?${u}`;
  }, [page, pageSize, activeTab, applied, sort, sortDir]);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        tabCounts: ClipTreatyTabCounts;
        rows: ClipTreatyListRow[];
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
    void runQuery();
  }, [runQuery]);

  const onHeaderSort = useCallback((key: ClipTreatySortKey) => {
    setPage(1);
    if (sortRef.current === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir("asc");
    }
  }, []);

  const resetForm = useCallback(() => {
    const empty = { treatyName: "", countryName: "" };
    setDraft(empty);
    setApplied(empty);
    setActiveTab("ALL");
    setPage(1);
    setSort("effective_date");
    setSortDir("desc");
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setAgreementOpen(false);
    setAgreementDoc(null);
    setAgreementError(null);
  }, []);

  const openDetail = useCallback(async (trtySrno: string) => {
    setSelectedId(trtySrno);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    setAgreementOpen(false);
    setAgreementDoc(null);
    setAgreementError(null);
    setBodyLang("KO");
    try {
      const d = await fetchJson<ClipTreatyDetail>(
        `/api/clip-treaty/detail?trtySrno=${encodeURIComponent(trtySrno)}`,
      );
      setDetail({
        ...d,
        agreement_docs: d.agreement_docs ?? [],
      });
      if (d.korean_content?.trim()) setBodyLang("KO");
      else if (d.english_content?.trim()) setBodyLang("EN");
      requestAnimationFrame(() => {
        detailAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openAgreementBody = useCallback(
    async (docs: ClipFtaAgreementDocSummary[]) => {
      const preferred = pickPreferredAgreementDoc(
        docs.filter((d) => d.extract_status === "ok" && d.content_chars > 0),
      );
      // 추출 본문이 있으면 패널로, 없으면 포털 본문정보로 스크롤
      if (!preferred) {
        setAgreementOpen(false);
        setAgreementDoc(null);
        setAgreementError(null);
        requestAnimationFrame(() => {
          bodyInfoRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
        return;
      }
      setAgreementOpen(true);
      setAgreementLoading(true);
      setAgreementError(null);
      try {
        const data = await fetchJson<{
          ok: boolean;
          doc: ClipFtaAgreementDocDetail;
        }>(
          `/api/clip-treaty/agreement-doc?docId=${encodeURIComponent(String(preferred.doc_id))}`,
        );
        setAgreementDoc(data.doc);
        requestAnimationFrame(() => {
          agreementAnchorRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      } catch (e) {
        setAgreementDoc(null);
        setAgreementError(e instanceof Error ? e.message : String(e));
      } finally {
        setAgreementLoading(false);
      }
    },
    [],
  );

  const totalPg = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const curPageSafe = Math.min(Math.max(1, page), totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  function tabBadgeCount(key: ClipTreatyTabKey): number {
    if (!tabCounts) return 0;
    return tabCounts[key];
  }

  const koBody = detail?.korean_content?.trim() || "";
  const enBody = detail?.english_content?.trim() || "";
  const fallbackBody = detail?.detail_text?.trim() || "";
  const bodyText =
    bodyLang === "EN"
      ? enBody || koBody || fallbackBody
      : bodyLang === "BOTH"
        ? [koBody && `[국문]\n${koBody}`, enBody && `[영문]\n${enBody}`]
            .filter(Boolean)
            .join("\n\n") || fallbackBody
        : koBody || enBody || fallbackBody;

  return (
    <CasPageShell>
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-4">
        <CasPageHeader title="조약/협정" />

        <div className="overflow-hidden rounded-lg border border-stone-300 bg-[#f5f2ea] shadow-sm ring-1 ring-stone-200/80">
          <div className="divide-y divide-stone-300 bg-white">
            <ClassificationFormSplitField label="조약명">
              <input
                type="text"
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={draft.treatyName}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, treatyName: e.target.value }))
                }
                placeholder="조약명 키워드"
              />
            </ClassificationFormSplitField>
            <ClassificationFormSplitField label="조약체결국가명">
              <input
                type="text"
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={draft.countryName}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, countryName: e.target.value }))
                }
                placeholder="체결국가명"
              />
            </ClassificationFormSplitField>
            <div className="flex flex-wrap justify-end gap-2 border-t border-stone-300 bg-[#f8f6f2] px-3 py-2.5">
              <CasResetButton type="button" disabled={loading} onClick={resetForm} />
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
          {(
            [
              { key: "ALL" as const, label: "전체" },
              ...CLIP_TREATY_CATEGORY_TABS.map((t) => ({ key: t, label: t })),
            ] as { key: ClipTreatyTabKey; label: string }[]
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
                <span className={sel ? "opacity-95" : "text-slate-600"}>[{n}]</span>
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
              <col style={{ width: "42%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "8%" }} />
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
                      align={
                        key === "treaty_name" || key === "countries"
                          ? "left"
                          : "center"
                      }
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
                  const sel = selectedId === r.trty_srno;
                  const treatyName = str(r.treaty_name);
                  return (
                    <tr
                      key={r.trty_srno}
                      className={`${clipGridRowHoverClass} ${
                        sel ? "bg-[#1e2f4f]/5" : ""
                      }`}
                    >
                      <ClipGridTd className={clipGridSeqClass}>
                        {seq}
                      </ClipGridTd>
                      <ClipGridLinkCell
                        label={treatyName}
                        title={treatyName}
                        onClick={() => void openDetail(r.trty_srno)}
                      />
                      <ClipGridTruncateCell align="center" title={str(r.category_name)}>
                        {str(r.category_name)}
                      </ClipGridTruncateCell>
                      <ClipGridTruncateCell align="left" title={str(r.countries)}>
                        {str(r.countries)}
                      </ClipGridTruncateCell>
                      <ClipGridTruncateCell align="center" title={str(r.treaty_number)}>
                        {str(r.treaty_number)}
                      </ClipGridTruncateCell>
                      <ClipGridDateCell title={str(r.effective_date)}>
                        {str(r.effective_date)}
                      </ClipGridDateCell>
                    </tr>
                  );
                })}
            </tbody>
          </ClipGridTable>

          <ClipPaginationBar
            curPageSafe={curPageSafe}
            totalPg={totalPg}
            loading={loading}
            block={block}
            onPage={setPage}
          />
        </CasCard>

        {(selectedId || detailLoading || detail || detailError) && (
          <div ref={detailAnchorRef}>
            <CasCard title="조약/협정 상세">
              {detailLoading && (
                <p className="py-8 text-center text-sm text-[#666]">상세 조회 중…</p>
              )}
              {detailError && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {detailError}
                </p>
              )}
              {detail && !detailLoading && (
                <div className="flex flex-col gap-4">
                  <h2 className="text-[15px] font-bold leading-snug text-[#1e2f4f]">
                    {detail.treaty_name}
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <MetaCell label="분야" value={str(detail.category_name)} />
                    <MetaCell label="조약체결국가명" value={str(detail.countries)} />
                    <MetaCell label="조약번호" value={str(detail.treaty_number)} />
                    <MetaCell label="발효일자" value={str(detail.effective_date)} />
                    <MetaCell label="공포등록일" value={str(detail.registered_date)} />
                    <MetaCell label="원본">
                      <button
                        type="button"
                        onClick={() =>
                          void openAgreementBody(detail.agreement_docs ?? [])
                        }
                        className="font-medium text-[#0f766e] underline-offset-2 hover:underline"
                      >
                        협정서본문보기
                      </button>
                    </MetaCell>
                  </div>

                  {/* CLIP 원본과 같이 본문정보를 메타 바로 다음에 표시 */}
                  <div ref={bodyInfoRef} className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[13px] font-semibold text-[#1e2f4f]">
                        본문정보
                      </h3>
                      <div className="flex overflow-hidden rounded border border-stone-300 text-[11px]">
                        {(
                          [
                            {
                              key: "KO" as const,
                              label: "국문",
                              on: !!(koBody || fallbackBody),
                            },
                            { key: "EN" as const, label: "영문", on: !!enBody },
                            {
                              key: "BOTH" as const,
                              label: "국문영문",
                              on: !!(koBody && enBody),
                            },
                          ] as const
                        ).map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            disabled={!t.on}
                            onClick={() => setBodyLang(t.key)}
                            className={[
                              "px-2.5 py-1 font-medium",
                              bodyLang === t.key
                                ? "bg-[#1e2f4f] text-white"
                                : "bg-white text-[#475569] hover:bg-stone-50",
                              !t.on ? "cursor-not-allowed opacity-40" : "",
                            ].join(" ")}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {bodyText ? (
                      <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-[#e5e9ef] bg-[#fafbfc] p-4">
                        <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-[#333]">
                          {bodyText}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-sm text-[#94a3b8]">본문 텍스트가 없습니다.</p>
                    )}
                  </div>

                  {agreementOpen && (
                    <div
                      ref={agreementAnchorRef}
                      className="rounded-lg border border-teal-200 bg-teal-50/40 p-4"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-[13px] font-semibold text-[#0f766e]">
                          협정서 본문
                          {agreementDoc?.lang
                            ? ` (${agreementDoc.lang === "KO" ? "국문" : agreementDoc.lang === "EN" ? "영문" : agreementDoc.lang})`
                            : ""}
                        </h3>
                        <button
                          type="button"
                          onClick={() => setAgreementOpen(false)}
                          className="text-[11px] text-[#64748b] hover:underline"
                        >
                          닫기
                        </button>
                      </div>
                      {agreementLoading && (
                        <p className="text-sm text-[#666]">협정서 불러오는 중…</p>
                      )}
                      {agreementError && (
                        <p className="text-sm text-red-700">{agreementError}</p>
                      )}
                      {agreementDoc && !agreementLoading && (
                        <>
                          <p className="mb-2 text-[11px] text-[#64748b]">
                            {agreementDoc.file_name}
                            {agreementDoc.page_count
                              ? ` · ${agreementDoc.page_count}쪽`
                              : ""}
                            {agreementDoc.content_chars
                              ? ` · ${agreementDoc.content_chars.toLocaleString()}자`
                              : ""}
                          </p>
                          <div className="max-h-[28rem] overflow-y-auto rounded-md border border-[#e5e9ef] bg-white p-3">
                            <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-[#333]">
                              {agreementDoc.content_text || "—"}
                            </pre>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {detail.attachments.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-[13px] font-semibold text-[#1e2f4f]">
                        첨부파일 ({detail.attachments.length})
                      </h3>
                      <ul className="divide-y divide-[#e5e9ef] rounded-lg border border-[#e5e9ef] bg-white">
                        {detail.attachments.map((a) => {
                          const downloadable =
                            a.download_status === "downloaded" && a.relative_path;
                          return (
                            <li
                              key={a.attachment_id}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px]"
                            >
                              <span className="min-w-0 break-words text-[#333]">
                                {a.file_name}
                                {a.displayed_size ? (
                                  <span className="ml-2 text-[#94a3b8]">
                                    ({a.displayed_size})
                                  </span>
                                ) : null}
                              </span>
                              {downloadable ? (
                                <a
                                  href={`/api/clip-treaty/attachment?attachmentId=${encodeURIComponent(a.attachment_id)}`}
                                  className="shrink-0 font-medium text-[#1e2f4f] underline-offset-2 hover:underline"
                                >
                                  다운로드
                                </a>
                              ) : (
                                <span className="shrink-0 text-[#94a3b8]">
                                  {a.download_status === "pending"
                                    ? "미수집"
                                    : a.download_status === "failed"
                                      ? "다운로드 실패"
                                      : "—"}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {detail.source_url && (
                    <p className="text-[11px] text-[#94a3b8]">
                      출처:{" "}
                      <a
                        href={detail.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#1e2f4f] underline-offset-2 hover:underline"
                      >
                        {detail.source_url}
                      </a>
                    </p>
                  )}
                </div>
              )}
            </CasCard>
          </div>
        )}
      </div>
    </CasPageShell>
  );
}
