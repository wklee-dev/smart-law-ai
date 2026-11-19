"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasResetButton,
  CasSearchButton,
  CasSubNavTabs,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { SlIconSearchPlus } from "@/app/components/sl-icons";
import {
  ClipGridDateCell,
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
  formatClipCustomsChiefDate,
  formatClipCustomsChiefHsInput,
  formatClipCustomsChiefHsSgn,
  type ClipCustomsChiefDetail,
  type ClipCustomsChiefGuideDocRow,
  type ClipCustomsChiefImexFilter,
  type ClipCustomsChiefListRow,
  type ClipCustomsChiefSectionRow,
  type ClipCustomsChiefSortKey,
  type ClipCustomsChiefTab,
} from "@/app/lib/clip-customs-chief-shared";
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const PAGE_NUMBER_WINDOW = 10;

const TABS: { key: ClipCustomsChiefTab; label: string }[] = [
  { key: "items", label: "물품목록" },
  { key: "integrated", label: "종합정보" },
  { key: "guide", label: "안내서" },
];

const SORT_COLUMNS: { key: ClipCustomsChiefSortKey; label: string }[] = [
  { key: "hs_sgn", label: "품목번호" },
  { key: "item_name", label: "품명" },
  { key: "requirement_document_name", label: "요건확인 서류명" },
  { key: "related_law_name", label: "관련법령" },
  { key: "application_start_dt", label: "적용시작일자" },
  { key: "application_end_dt", label: "적용종료일자" },
  { key: "imex_name", label: "수출입구분" },
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
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

const DETAIL_LABEL_CLASS =
  "w-[7.5rem] border border-[#d8dee6] bg-[#ebe8e0] px-2 py-2 text-right text-[12px] font-semibold text-[#333] whitespace-nowrap align-middle";
const DETAIL_VALUE_CLASS =
  "border border-[#d8dee6] bg-white px-3 py-2 text-[12px] leading-relaxed text-[#333] align-top";

function DetailMetaPair({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <>
      <th className={DETAIL_LABEL_CLASS}>{label}</th>
      <td className={DETAIL_VALUE_CLASS}>{value}</td>
    </>
  );
}

function DetailHsCodeValue({ hs }: { hs: string }) {
  const formatted = formatClipCustomsChiefHsSgn(hs, "");
  const match = formatted.match(/^(\d{4}\.\d{2})(-\d+)?$/);
  return (
    <span className="font-mono text-[12px]">
      {match ? (
        <>
          <span className="bg-[#fff3b0]">{match[1]}</span>
          {match[2] ?? ""}
        </>
      ) : (
        formatted || "—"
      )}
    </span>
  );
}

function ItemDetailPanel({
  loading,
  detail,
}: {
  loading: boolean;
  detail: ClipCustomsChiefDetail | null;
}) {
  if (loading) {
    return <p className="px-4 py-3 text-[12px] text-[#666]">불러오는 중…</p>;
  }
  if (!detail) {
    return <p className="px-4 py-3 text-[12px] text-[#666]">상세 없음</p>;
  }
  return (
    <div className="space-y-4 p-4 text-[12px] text-[#333]">
      <table className="w-full border-collapse text-left">
        <tbody>
          <tr>
            <DetailMetaPair
              label="품목번호"
              value={<DetailHsCodeValue hs={detail.hs_sgn} />}
            />
            <DetailMetaPair label="품명" value={str(detail.item_name)} />
          </tr>
          <tr>
            <DetailMetaPair
              label="요건확인 서류명"
              value={str(detail.requirement_document_name)}
            />
            <DetailMetaPair label="수출입구분" value={str(detail.imex_name)} />
          </tr>
          <tr>
            <th className={DETAIL_LABEL_CLASS}>관련법령</th>
            <td className={DETAIL_VALUE_CLASS} colSpan={3}>
              {str(detail.related_law_name)}
            </td>
          </tr>
          {detail.target_detail_text ? (
            <tr>
              <th className={`${DETAIL_LABEL_CLASS} align-top`}>
                구분에 해당하는 내역
              </th>
              <td
                className={`${DETAIL_VALUE_CLASS} whitespace-pre-wrap leading-[1.7]`}
                colSpan={3}
              >
                {detail.target_detail_text}
              </td>
            </tr>
          ) : null}
          {detail.extension_reason_text ? (
            <tr>
              <th className={`${DETAIL_LABEL_CLASS} align-top`}>기간연장 사유</th>
              <td
                className={`${DETAIL_VALUE_CLASS} whitespace-pre-wrap leading-[1.7]`}
                colSpan={3}
              >
                {detail.extension_reason_text}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {detail.agencies.length > 0 ? (
        <div>
          <p className="mb-2 font-semibold text-[#666]">요건승인기관</p>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#f8fafc] text-[#666]">
                <th className="border border-[#e5e9ef] px-2 py-1.5">적용시작</th>
                <th className="border border-[#e5e9ef] px-2 py-1.5">적용종료</th>
                <th className="border border-[#e5e9ef] px-2 py-1.5">요건승인기관</th>
              </tr>
            </thead>
            <tbody>
              {detail.agencies.map((a) => (
                <tr key={a.agency_id}>
                  <td className="border border-[#e5e9ef] px-2 py-1.5 text-center">
                    {formatClipCustomsChiefDate(a.application_start_dt) || "—"}
                  </td>
                  <td className="border border-[#e5e9ef] px-2 py-1.5 text-center">
                    {formatClipCustomsChiefDate(a.application_end_dt) || "—"}
                  </td>
                  <td className="border border-[#e5e9ef] px-2 py-1.5">
                    {str(a.agency_name)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function SectionBody({ section }: { section: ClipCustomsChiefSectionRow }) {
  const html = section.body_html?.trim();
  if (html) {
    return (
      <div
        className="prose prose-sm max-w-none text-[13px] leading-relaxed text-[#333] [&_table]:w-full [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#333]">
      {section.body_text || "—"}
    </p>
  );
}

export default function CustomsChiefView() {
  const [activeTab, setActiveTab] = useState<ClipCustomsChiefTab>("items");

  const [draft, setDraft] = useState({
    hsCode: "",
    requirementDoc: "",
    relatedLaw: "",
    imex: "" as ClipCustomsChiefImexFilter,
    includeHistory: true,
  });
  const [applied, setApplied] = useState({ ...draft });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<ClipCustomsChiefSortKey>("hs_sgn");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const sortRef = useRef(sort);
  sortRef.current = sort;

  const [rows, setRows] = useState<ClipCustomsChiefListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [dbTotal, setDbTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ClipCustomsChiefDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [integratedSections, setIntegratedSections] = useState<
    ClipCustomsChiefSectionRow[]
  >([]);
  const [guideSections, setGuideSections] = useState<ClipCustomsChiefSectionRow[]>(
    [],
  );
  const [guideDocs, setGuideDocs] = useState<ClipCustomsChiefGuideDocRow[]>([]);
  const [contentLoading, setContentLoading] = useState(false);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (applied.hsCode.trim()) u.set("hsCode", applied.hsCode.trim());
    if (applied.requirementDoc.trim()) {
      u.set("requirementDoc", applied.requirementDoc.trim());
    }
    if (applied.relatedLaw.trim()) u.set("relatedLaw", applied.relatedLaw.trim());
    if (applied.imex) u.set("imex", applied.imex);
    if (applied.includeHistory) u.set("includeHistory", "1");
    u.set("sort", sort);
    u.set("dir", sortDir);
    return `/api/clip-customs-chief/query?${u}`;
  }, [applied, page, pageSize, sort, sortDir]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: ClipCustomsChiefListRow[];
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
  }, [buildQueryUrl]);

  useEffect(() => {
    if (activeTab !== "items") return;
    void loadRows();
  }, [activeTab, loadRows]);

  const loadDetail = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const data = await fetchJson<{ detail: ClipCustomsChiefDetail }>(
        `/api/clip-customs-chief/detail?id=${id}`,
      );
      setDetail(data.detail);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "상세 조회 실패");
    } finally {
      setDetailLoading(false);
    }
  };

  const loadTabContent = useCallback(async (tab: ClipCustomsChiefTab) => {
    if (tab === "items") return;
    setContentLoading(true);
    setError(null);
    try {
      if (tab === "integrated") {
        const data = await fetchJson<{ sections: ClipCustomsChiefSectionRow[] }>(
          "/api/clip-customs-chief/integrated",
        );
        setIntegratedSections(data.sections ?? []);
      } else {
        const data = await fetchJson<{
          sections: ClipCustomsChiefSectionRow[];
          documents: ClipCustomsChiefGuideDocRow[];
        }>("/api/clip-customs-chief/guide");
        setGuideSections(data.sections ?? []);
        setGuideDocs(data.documents ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "콘텐츠 조회 실패");
    } finally {
      setContentLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "items") return;
    void loadTabContent(activeTab);
  }, [activeTab, loadTabContent]);

  const totalPg = Math.max(1, Math.ceil(total / pageSize));
  const curPageSafe = Math.min(page, totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  const onSearch = () => {
    setApplied({ ...draft });
    setPage(1);
    setExpandedId(null);
    setDetail(null);
  };

  const onReset = () => {
    const empty = {
      hsCode: "",
      requirementDoc: "",
      relatedLaw: "",
      imex: "" as ClipCustomsChiefImexFilter,
      includeHistory: true,
    };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
    setSort("hs_sgn");
    setSortDir("asc");
    setExpandedId(null);
    setDetail(null);
  };

  const onHeaderSort = (key: ClipCustomsChiefSortKey) => {
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
      <CasPageHeader title="세관장확인사항" />

      <CasSubNavTabs
        tabs={TABS}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key)}
      />

      {activeTab === "items" && (
        <>
          <CasCard title="검색">
            <div className="grid gap-3 lg:grid-cols-2">
              <ClassificationFormSplitField label="품목번호">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                  <input
                    type="text"
                    className={`${CLASSIFICATION_FORM_INPUT_CLASS} min-w-[8rem] flex-1 font-mono`}
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
                  <label className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-[#333]">
                    <input
                      type="checkbox"
                      checked={draft.includeHistory}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          includeHistory: e.target.checked,
                        }))
                      }
                      className="h-3.5 w-3.5 rounded border-[#d8dee6]"
                    />
                    이력포함
                  </label>
                </div>
              </ClassificationFormSplitField>

              <ClassificationFormSplitField label="수출입구분">
                <div className="flex flex-wrap items-center gap-4 px-1 py-1 text-[12px] text-[#333]">
                  {(
                    [
                      ["", "전체"],
                      ["E", "수출"],
                      ["I", "수입"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value || "all"} className="inline-flex items-center gap-1.5">
                      <input
                        type="radio"
                        name="imex"
                        checked={draft.imex === value}
                        onChange={() =>
                          setDraft((p) => ({ ...p, imex: value }))
                        }
                        className="h-3.5 w-3.5 border-[#d8dee6]"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </ClassificationFormSplitField>

              <ClassificationFormSplitField
                label="요건확인 서류명"
                labelClassName="w-[7.75rem] whitespace-nowrap sm:w-[8.75rem]"
              >
                <input
                  type="text"
                  className={CLASSIFICATION_FORM_INPUT_CLASS}
                  value={draft.requirementDoc}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, requirementDoc: e.target.value }))
                  }
                  onKeyDown={(e) => e.key === "Enter" && onSearch()}
                />
              </ClassificationFormSplitField>

              <ClassificationFormSplitField label="관련법령">
                <input
                  type="text"
                  className={CLASSIFICATION_FORM_INPUT_CLASS}
                  value={draft.relatedLaw}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, relatedLaw: e.target.value }))
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
                <code className="text-[11px]">crawl_customs_confirmation.py</code>{" "}
                (V1.0)로 CLIP 세관장확인사항을 수집하면{" "}
                <code className="text-[11px]">clip_cc_item_requirement</code> 테이블에
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

            <ClipGridTable>
              <colgroup>
                <col style={{ width: "4%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "11%" }} />
              </colgroup>
              <thead>
                <tr>
                  <ClipGridTh className="px-1">번호</ClipGridTh>
                  {SORT_COLUMNS.map(({ key, label }) => (
                    <ClipGridTh key={key}>
                      <ClipSortThButton
                        label={label}
                        active={sort === key}
                        sortDir={sortDir}
                        align={
                          key === "item_name" ||
                          key === "requirement_document_name" ||
                          key === "related_law_name"
                            ? "left"
                            : "center"
                        }
                        onClick={() => onHeaderSort(key)}
                      />
                    </ClipGridTh>
                  ))}
                  <ClipGridTh className="px-1 text-center whitespace-nowrap">
                    상세정보
                  </ClipGridTh>
                </tr>
              </thead>
              <tbody>
                {(loading || rows.length === 0) && (
                  <ClipGridEmptyRow colSpan={9} loading={loading} />
                )}
                {!loading &&
                  rows.map((r, idx) => {
                    const seq = (curPageSafe - 1) * pageSize + idx + 1;
                    const open = expandedId === r.requirement_id;
                    return (
                      <Fragment key={r.requirement_id}>
                        <tr
                          className={`${clipGridRowHoverClass} ${open ? "bg-[#1e2f4f]/5" : ""}`}
                        >
                          <ClipGridTd className={clipGridSeqClass}>{seq}</ClipGridTd>
                          <ClipGridLabelCell
                            className={clipGridMonoClass}
                            title={formatClipCustomsChiefHsSgn(r.hs_sgn)}
                          >
                            {formatClipCustomsChiefHsSgn(r.hs_sgn)}
                          </ClipGridLabelCell>
                          <ClipGridTruncateCell align="left" title={str(r.item_name)}>
                            {str(r.item_name)}
                          </ClipGridTruncateCell>
                          <ClipGridTruncateCell
                            align="left"
                            title={str(r.requirement_document_name)}
                          >
                            {str(r.requirement_document_name)}
                          </ClipGridTruncateCell>
                          <ClipGridTruncateCell
                            align="left"
                            title={str(r.related_law_name)}
                          >
                            {str(r.related_law_name)}
                          </ClipGridTruncateCell>
                          <ClipGridDateCell
                            title={formatClipCustomsChiefDate(r.application_start_dt)}
                          >
                            {formatClipCustomsChiefDate(r.application_start_dt) || "—"}
                          </ClipGridDateCell>
                          <ClipGridDateCell
                            title={formatClipCustomsChiefDate(r.application_end_dt)}
                          >
                            {formatClipCustomsChiefDate(r.application_end_dt)}
                          </ClipGridDateCell>
                          <ClipGridLabelCell title={str(r.imex_name)}>
                            {str(r.imex_name)}
                          </ClipGridLabelCell>
                          <ClipGridTd align="center" className="px-1">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center gap-0.5 text-[12px] font-medium text-[#1e2f4f] underline-offset-2 hover:underline"
                              onClick={() => void loadDetail(r.requirement_id)}
                            >
                              {open ? "접기" : "더보기"}
                              {!open && <SlIconSearchPlus className="h-3.5 w-3.5" />}
                            </button>
                          </ClipGridTd>
                        </tr>
                        {open ? (
                          <tr className="bg-[#fafbfc]">
                            <td colSpan={9} className="border-t border-[#e5e9ef] p-0 align-top">
                              <ItemDetailPanel
                                loading={detailLoading}
                                detail={detail}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
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
          {contentLoading ? (
            <p className="text-[12px] text-[#666]">불러오는 중…</p>
          ) : integratedSections.length === 0 ? (
            <p className="text-[12px] leading-relaxed text-[#666]">
              종합정보 섹션이 없습니다. 크롤러 수집 후{" "}
              <code className="text-[11px]">clip_cc_integrated_info</code>에 표시됩니다.
            </p>
          ) : (
            <div className="space-y-6">
              {integratedSections.map((section) => (
                <section key={section.section_order}>
                  <h3 className="mb-2 border-b border-slate-200 pb-1 text-[14px] font-semibold text-[#1e2f4f]">
                    {section.section_title}
                  </h3>
                  <SectionBody section={section} />
                </section>
              ))}
            </div>
          )}
        </CasCard>
      )}

      {activeTab === "guide" && (
        <div className="space-y-3">
          <CasCard title="안내서 본문">
            {contentLoading ? (
              <p className="text-[12px] text-[#666]">불러오는 중…</p>
            ) : guideSections.length === 0 ? (
              <p className="text-[12px] leading-relaxed text-[#666]">
                안내서 본문이 없습니다. 크롤러 수집 후{" "}
                <code className="text-[11px]">clip_cc_guide_content</code>에 표시됩니다.
              </p>
            ) : (
              <div className="space-y-6">
                {guideSections.map((section) => (
                  <section key={section.section_order}>
                    <h3 className="mb-2 border-b border-slate-200 pb-1 text-[14px] font-semibold text-[#1e2f4f]">
                      {section.section_title}
                    </h3>
                    <SectionBody section={section} />
                  </section>
                ))}
              </div>
            )}
          </CasCard>

          <CasCard title="안내서 파일">
            {guideDocs.length === 0 ? (
              <p className="text-[12px] text-[#666]">다운로드 가능한 파일이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {guideDocs.map((doc) => (
                  <li
                    key={doc.guide_document_id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12px]"
                  >
                    <span className="min-w-0 flex-1 truncate text-[#333]">
                      {doc.document_title}
                    </span>
                    <span className="shrink-0 text-[#94a3b8]">
                      {doc.download_status}
                    </span>
                    {doc.download_status === "DOWNLOADED" ? (
                      <a
                        href={`/api/clip-customs-chief/guide-file?id=${doc.guide_document_id}`}
                        className="shrink-0 font-medium text-[#1e2f4f] underline-offset-2 hover:underline"
                        download
                      >
                        다운로드
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CasCard>
        </div>
      )}
    </CasPageShell>
  );
}
