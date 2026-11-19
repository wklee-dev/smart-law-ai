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
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import {
  CLIP_ANNEX_TYPE_TABS,
  formatClipAnnexDate,
  type ClipAnnexDetail,
  type ClipAnnexListRow,
  type ClipAnnexSortKey,
  type ClipAnnexTabCounts,
  type ClipAnnexTabKey,
} from "@/app/lib/clip-annex-shared";
import { useCallback, useEffect, useRef, useState } from "react";

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

const SORT_COLUMNS: { key: ClipAnnexSortKey; label: string }[] = [
  { key: "law_name", label: "법령명" },
  { key: "annex_type_code", label: "별표구분" },
  { key: "form_title", label: "별표/서식명" },
  { key: "effective_date", label: "시행일" },
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

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border border-stone-200 bg-white px-3 py-2">
      <div className="text-[10px] font-semibold text-[#94a3b8]">{label}</div>
      <div className="mt-0.5 break-words text-[12px] text-[#333]">{value}</div>
    </div>
  );
}

function PdfDownloadIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="2" width="14" height="18" rx="1.5" fill="#fff" stroke="#d1d5db" />
      <path d="M17 2v5h5" fill="#f3f4f6" stroke="#d1d5db" />
      <rect x="6" y="13" width="8" height="4" rx="0.5" fill="#dc2626" />
      <text x="10" y="16.2" textAnchor="middle" fill="#fff" fontSize="3.2" fontWeight="700">
        PDF
      </text>
    </svg>
  );
}

function HwpDownloadIcon({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="2" width="14" height="18" rx="1.5" fill="#fff" stroke="#d1d5db" />
      <path d="M17 2v5h5" fill="#f3f4f6" stroke="#d1d5db" />
      <rect x="6" y="13" width="8" height="4" rx="0.5" fill="#b45309" />
      <text x="10" y="16.2" textAnchor="middle" fill="#fff" fontSize="3.4" fontWeight="700">
        H
      </text>
    </svg>
  );
}

function DownloadIconLink({
  kind,
  attachmentId,
  available,
}: {
  kind: "pdf" | "hwp";
  attachmentId?: string;
  available: boolean;
}) {
  const label = kind === "pdf" ? "PDF 다운로드" : "한글 다운로드";
  const icon = kind === "pdf" ? <PdfDownloadIcon /> : <HwpDownloadIcon />;

  if (!available || !attachmentId) {
    return (
      <span className="inline-flex cursor-not-allowed opacity-30" title={`${label} (미수집)`}>
        {icon}
      </span>
    );
  }

  const href = `/api/clip-annex/file?attachmentId=${encodeURIComponent(attachmentId)}`;
  return (
    <a
      href={href}
      download
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      className="inline-flex transition-opacity hover:opacity-75"
    >
      {icon}
    </a>
  );
}

function DownloadCell({
  hasPdf,
  hasHwp,
  pdfAttachmentId,
  hwpAttachmentId,
}: {
  hasPdf: boolean;
  hasHwp: boolean;
  pdfAttachmentId?: string;
  hwpAttachmentId?: string;
}) {
  return (
    <div className="inline-flex items-center justify-center gap-0.5">
      <DownloadIconLink
        kind="pdf"
        available={hasPdf}
        attachmentId={pdfAttachmentId}
      />
      <DownloadIconLink
        kind="hwp"
        available={hasHwp}
        attachmentId={hwpAttachmentId}
      />
    </div>
  );
}

export default function CustomsLawPortalAnnexFormsPage() {
  const [draft, setDraft] = useState({ lawName: "", formTitle: "" });
  const [applied, setApplied] = useState({ lawName: "", formTitle: "" });
  const [activeTab, setActiveTab] = useState<ClipAnnexTabKey>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<ClipAnnexSortKey>("effective_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const [tabCounts, setTabCounts] = useState<ClipAnnexTabCounts | null>(null);
  const [rows, setRows] = useState<ClipAnnexListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<ClipAnnexDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailAnchorRef = useRef<HTMLDivElement>(null);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("tab", activeTab === "ALL" ? "ALL" : activeTab);
    if (applied.lawName.trim()) u.set("lawName", applied.lawName.trim());
    if (applied.formTitle.trim()) u.set("formTitle", applied.formTitle.trim());
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-annex/query?${u}`;
  }, [page, pageSize, activeTab, applied, sort, sortDir]);

  const runQuery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        tabCounts: ClipAnnexTabCounts;
        rows: ClipAnnexListRow[];
        total: number;
      }>(buildQueryUrl());
      setTabCounts(data.tabCounts);
      setRows(data.rows);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [buildQueryUrl]);

  useEffect(() => {
    void runQuery();
  }, [runQuery]);

  function resetForm() {
    setDraft({ lawName: "", formTitle: "" });
    setApplied({ lawName: "", formTitle: "" });
    setActiveTab("ALL");
    setPage(1);
    setSort("effective_date");
    setSortDir("desc");
    setSelectedKey(null);
    setDetail(null);
    setDetailError(null);
  }

  function onHeaderSort(key: ClipAnnexSortKey) {
    if (sortRef.current === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir(key === "effective_date" ? "desc" : "asc");
    }
    setPage(1);
  }

  const openDetail = useCallback(async (formKey: string) => {
    setSelectedKey(formKey);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const d = await fetchJson<ClipAnnexDetail>(
        `/api/clip-annex/detail?formKey=${encodeURIComponent(formKey)}`,
      );
      setDetail(d);
      requestAnimationFrame(() => {
        detailAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const totalPg = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const curPageSafe = Math.min(Math.max(1, page), totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  function tabBadgeCount(key: ClipAnnexTabKey): number {
    if (!tabCounts) return 0;
    return tabCounts[key];
  }

  return (
    <CasPageShell>
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-4">
        <CasPageHeader title="별표/서식" />

        <div className="overflow-hidden rounded-lg border border-stone-300 bg-[#f5f2ea] shadow-sm ring-1 ring-stone-200/80">
          <div className="divide-y divide-stone-300 bg-white">
            <ClassificationFormSplitField label="법종류">
              <div className="flex h-9 items-center px-2 text-[13px] text-[#333]">
                행정규칙
              </div>
            </ClassificationFormSplitField>
            <ClassificationFormSplitField label="법령명">
              <input
                type="text"
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={draft.lawName}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, lawName: e.target.value }))
                }
                placeholder="법령명 키워드"
              />
            </ClassificationFormSplitField>
            <ClassificationFormSplitField label="별표/서식명">
              <input
                type="text"
                className={CLASSIFICATION_FORM_INPUT_CLASS}
                value={draft.formTitle}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, formTitle: e.target.value }))
                }
                placeholder="별표/서식명 키워드"
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
              ...CLIP_ANNEX_TYPE_TABS.map((t) => ({
                key: t.code as ClipAnnexTabKey,
                label: t.label,
              })),
            ] as { key: ClipAnnexTabKey; label: string }[]
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
              <col style={{ width: "20%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "37%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>
            <thead>
              <tr>
                <ClipGridTh className="px-1">번호</ClipGridTh>
                {SORT_COLUMNS.map(({ key, label }) => (
                  <ClipGridTh
                    key={key}
                    className={
                      key === "effective_date" ? "px-1" : ""
                    }
                  >
                    <ClipSortThButton
                      label={label}
                      active={sort === key}
                      sortDir={sortDir}
                      align={
                        key === "law_name" || key === "form_title"
                          ? "left"
                          : "center"
                      }
                      onClick={() => onHeaderSort(key)}
                    />
                  </ClipGridTh>
                ))}
                <ClipGridTh className="px-0.5 text-center">법종류</ClipGridTh>
                <ClipGridTh className="px-0.5 text-center">다운로드</ClipGridTh>
              </tr>
            </thead>
            <tbody>
              {(loading || rows.length === 0) && (
                <ClipGridEmptyRow colSpan={7} loading={loading} />
              )}
              {!loading &&
                rows.map((r, idx) => {
                  const seq = (curPageSafe - 1) * pageSize + idx + 1;
                  const sel = selectedKey === r.form_key;
                  const formTitle = str(r.form_title);
                  return (
                    <tr
                      key={r.form_key}
                      className={`${clipGridRowHoverClass} ${
                        sel ? "bg-[#1e2f4f]/5" : ""
                      }`}
                    >
                      <ClipGridTd className={clipGridSeqClass}>
                        {seq}
                      </ClipGridTd>
                      <ClipGridTruncateCell align="left" title={str(r.law_name)}>
                        {str(r.law_name)}
                      </ClipGridTruncateCell>
                      <ClipGridLabelCell title={str(r.annex_type_label)}>
                        {str(r.annex_type_label)}
                      </ClipGridLabelCell>
                      <ClipGridLinkCell
                        label={formTitle}
                        title={formTitle}
                        onClick={() => void openDetail(r.form_key)}
                      />
                      <ClipGridDateCell title={formatClipAnnexDate(r.effective_date)}>
                        {formatClipAnnexDate(r.effective_date)}
                      </ClipGridDateCell>
                      <ClipGridLabelCell title={r.law_kind_label}>
                        {r.law_kind_label}
                      </ClipGridLabelCell>
                      <ClipGridTd align="center" className="px-0.5 py-1">
                        <DownloadCell
                          hasPdf={r.has_pdf}
                          hasHwp={r.has_hwp}
                          pdfAttachmentId={r.pdf_attachment_id || undefined}
                          hwpAttachmentId={r.hwp_attachment_id || undefined}
                        />
                      </ClipGridTd>
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

        {(selectedKey || detailLoading || detail || detailError) && (
          <div ref={detailAnchorRef}>
            <CasCard title="별표/서식 상세">
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
                    {detail.form_title}
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <MetaCell label="법령명" value={str(detail.law_name)} />
                    <MetaCell label="별표구분" value={str(detail.annex_type_label)} />
                    <MetaCell
                      label="시행(발행)일자"
                      value={formatClipAnnexDate(detail.effective_date)}
                    />
                    <MetaCell label="법종류" value={detail.law_kind_label} />
                  </div>
                  <div>
                    <h3 className="mb-2 text-[13px] font-semibold text-slate-700">다운로드</h3>
                    {detail.files.length === 0 ? (
                      <p className="text-[12px] text-[#94a3b8]">등록된 파일이 없습니다.</p>
                    ) : (
                      <ul className="divide-y divide-stone-200 rounded border border-stone-200 bg-white">
                        {detail.files.map((f) => (
                          <li
                            key={f.attachment_id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px]"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-medium uppercase text-[#1e2f4f]">
                                {f.file_type}
                              </span>
                              <span className="mx-2 text-[#94a3b8]">·</span>
                              <span className="break-words text-[#333]">
                                {str(f.original_filename)}
                              </span>
                              {f.download_status !== "downloaded" ? (
                                <span className="ml-2 text-[11px] text-amber-700">
                                  ({f.download_status || "미수집"}
                                  {f.last_error ? `: ${f.last_error}` : ""})
                                </span>
                              ) : null}
                            </div>
                            <DownloadIconLink
                              kind={f.file_type === "pdf" ? "pdf" : "hwp"}
                              available={f.download_status === "downloaded"}
                              attachmentId={f.attachment_id}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </CasCard>
          </div>
        )}
      </div>
    </CasPageShell>
  );
}
