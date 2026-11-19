"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasResetButton,
  CasSearchButton,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  ClipGridEmptyRow,
  ClipGridLinkCell,
  ClipGridStatsBar,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipPaginationBar,
  clipGridMonoClass,
  clipGridRowHoverClass,
  clipGridSeqClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import { formatClipCustomsChiefHsInput } from "@/app/lib/clip-customs-chief-shared";
import type {
  LlcHsChangeNoticeDetail,
  LlcHsChangeNoticeListRow,
} from "@/app/lib/llc-hs-change-notice-shared";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;
const SOURCE_LABEL =
  "[별표] 품목분류를 변경한 물품(수출입물품 등에 대한 품목분류 변경고시)";

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

/** PDF 추출 시 단어마다 끊긴 줄바꿈을 문단으로 이어 붙임 (㉮㉯·불릿 줄은 유지) */
function reflowPdfText(raw: string): string {
  const text = raw.replace(/\r/g, "").trim();
  if (!text) return "";
  const lines = text.split("\n");
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) {
      out.push(buf.join(" ").replace(/[ \t]+/g, " ").trim());
      buf = [];
    }
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flush();
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    // 구조 마커(㉮㉯, -, ○, ①…)는 새 줄로 유지
    if (/^[㉮-㉻\-–•·]/.test(t) || /^[①-⑳]/.test(t) || /^○\s/.test(t)) {
      flush();
      out.push(t);
      continue;
    }
    buf.push(t);
  }
  flush();
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export function LlcHsChangeNoticeView() {
  const [dbReady, setDbReady] = useState(true);
  const [draft, setDraft] = useState({
    noticeNo: "",
    hsCode: "",
    keyword: "",
  });
  const [applied, setApplied] = useState({ ...draft });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [rows, setRows] = useState<LlcHsChangeNoticeListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<LlcHsChangeNoticeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailAnchorRef = useRef<HTMLDivElement>(null);

  const buildQueryUrl = useCallback(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    if (applied.noticeNo.trim()) u.set("noticeNo", applied.noticeNo.trim());
    if (applied.hsCode.trim()) u.set("hsCode", applied.hsCode.trim());
    if (applied.keyword.trim()) u.set("keyword", applied.keyword.trim());
    return `/api/law-info-center/hs-change-notice/query?${u}`;
  }, [applied, page, pageSize]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: LlcHsChangeNoticeListRow[];
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
  }, [buildQueryUrl]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const openDetail = async (row: LlcHsChangeNoticeListRow) => {
    setSelectedId(row.id);
    setDetailLoading(true);
    setDetailError(null);
    setDetail(null);
    try {
      const data = await fetchJson<{ detail: LlcHsChangeNoticeDetail }>(
        `/api/law-info-center/hs-change-notice/detail?id=${row.id}`,
      );
      setDetail(data.detail);
      requestAnimationFrame(() => {
        detailAnchorRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : "상세 조회 실패");
    } finally {
      setDetailLoading(false);
    }
  };

  const totalPg = Math.max(1, Math.ceil(total / pageSize));
  const curPageSafe = Math.min(page, totalPg);
  const block = visiblePageBlock(curPageSafe, totalPg);

  const onSearch = () => {
    setApplied({ ...draft });
    setPage(1);
    setSelectedId(null);
    setDetail(null);
  };

  const onReset = () => {
    const empty = { noticeNo: "", hsCode: "", keyword: "" };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
    setSelectedId(null);
    setDetail(null);
  };

  return (
    <CasPageShell>
      <CasPageHeader title="품목분류변경고시" />

      <CasCard title="검색">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ClassificationFormSplitField label="고시번호">
            <input
              type="text"
              className={CLASSIFICATION_FORM_INPUT_CLASS}
              value={draft.noticeNo}
              placeholder="예: 2026-55"
              onChange={(e) =>
                setDraft((p) => ({ ...p, noticeNo: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </ClassificationFormSplitField>
          <ClassificationFormSplitField label="HS품목번호">
            <input
              type="text"
              className={`${CLASSIFICATION_FORM_INPUT_CLASS} font-mono`}
              value={draft.hsCode}
              placeholder="변경전·변경후"
              onChange={(e) =>
                setDraft((p) => ({
                  ...p,
                  hsCode: formatClipCustomsChiefHsInput(e.target.value),
                }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </ClassificationFormSplitField>
          <ClassificationFormSplitField label="품명·키워드">
            <input
              type="text"
              className={CLASSIFICATION_FORM_INPUT_CLASS}
              value={draft.keyword}
              placeholder="품명, 물품설명, 변경사유"
              onChange={(e) =>
                setDraft((p) => ({ ...p, keyword: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
            />
          </ClassificationFormSplitField>
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
            데이터가 없습니다.{" "}
            <code className="rounded bg-slate-100 px-1">
              scripts/import-llc-hs-change-notice-pdf.py
            </code>
            로 <code className="rounded bg-slate-100 px-1">llc_hs_change_notice</code>{" "}
            를 적재해 주세요.
          </p>
        ) : null}
        {error ? <p className="mb-2 text-[12px] text-red-600">{error}</p> : null}

        <ClipGridTable fixedLayout={false} minWidth="100%">
          <colgroup>
            <col style={{ width: "6%" }} />
            <col style={{ width: "14%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "28%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <thead>
            <tr>
              <ClipGridTh className="text-center">연번</ClipGridTh>
              <ClipGridTh className="text-center">고시번호</ClipGridTh>
              <ClipGridTh className="text-center">시행일</ClipGridTh>
              <ClipGridTh className="text-center">품명</ClipGridTh>
              <ClipGridTh className="text-center">변경전 HS</ClipGridTh>
              <ClipGridTh className="text-center">변경후 HS</ClipGridTh>
            </tr>
          </thead>
          <tbody>
            {(loading || rows.length === 0) && (
              <ClipGridEmptyRow colSpan={6} loading={loading} />
            )}
            {!loading &&
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={`${clipGridRowHoverClass} ${
                    selectedId === row.id ? "bg-sky-50" : ""
                  }`}
                >
                  <ClipGridTd align="center" className={clipGridSeqClass}>
                    {row.seqNo}
                  </ClipGridTd>
                  <ClipGridLinkCell
                    label={row.noticeNoLabel || row.noticeNo || "—"}
                    onClick={() => void openDetail(row)}
                  />
                  <ClipGridTd align="center">{str(row.noticeDate)}</ClipGridTd>
                  <ClipGridLinkCell
                    label={row.itemName || "—"}
                    title={row.itemName}
                    onClick={() => void openDetail(row)}
                  />
                  <ClipGridTd
                    align="center"
                    className={`${clipGridMonoClass} whitespace-pre-wrap text-[11px]`}
                  >
                    {row.hsBefore || "—"}
                  </ClipGridTd>
                  <ClipGridTd
                    align="center"
                    className={`${clipGridMonoClass} whitespace-pre-wrap text-[11px]`}
                  >
                    {row.hsAfter || "—"}
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

      <div ref={detailAnchorRef}>
        {(selectedId != null || detailLoading || detail) && (
          <CasCard title="고시 상세">
            {detailLoading ? (
              <p className="text-[12px] text-slate-500">불러오는 중…</p>
            ) : null}
            {detailError ? (
              <p className="text-[12px] text-red-600">{detailError}</p>
            ) : null}
            {detail ? (
              <div className="rounded border border-stone-300 bg-white p-4">
                <div className="mb-2 text-[11px] text-slate-500">
                  {SOURCE_LABEL}
                  {detail.sourcePdfPage
                    ? ` · PDF ${detail.sourcePdfPage}쪽`
                    : ""}
                  {detail.layoutType
                    ? ` · 표유형 ${detail.layoutType}`
                    : ""}
                </div>

                {/* PDF형: 제목 + 우측 고시번호·일자 */}
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 pb-3">
                  <h3 className="text-[16px] font-bold leading-snug text-[#1a2744]">
                    {detail.seqNo}.{" "}
                    {detail.title ||
                      detail.itemName ||
                      "품목분류변경고시"}
                  </h3>
                  <div className="text-right text-[12px] leading-relaxed text-[#333]">
                    <div>
                      고시번호{" "}
                      <span className="font-semibold">
                        {detail.noticeNoLabel || detail.noticeNo || "—"}
                      </span>
                    </div>
                    <div>
                      (
                      {detail.noticeDate
                        ? detail.noticeDate.replace(/-/g, ".")
                        : "—"}
                      )
                    </div>
                  </div>
                </div>

                {detail.introText.trim() ? (
                  <p className="mb-3 text-[13px] leading-relaxed text-[#222]">
                    {detail.introText}
                  </p>
                ) : null}

                {/* C형 텍스트 고시: PDF처럼 ○ 항목 나열 (①②③ 다중 지원) */}
                {detail.textItems.length > 0 ? (
                  <div className="space-y-4 text-[13px] leading-relaxed text-[#222]">
                    {detail.textItems.map((it, idx) => {
                      const sharedReason =
                        detail.changeReason.trim() &&
                        it.changeReason.trim() === detail.changeReason.trim();
                      return (
                        <div
                          key={`${it.mark}-${idx}`}
                          className="border-b border-stone-200 pb-3 last:border-b-0"
                        >
                          <div className="mb-1 font-semibold text-[#1a2744]">
                            {it.mark ? `${it.mark} ` : "○ "}
                            품명: {it.itemName || "—"}
                          </div>
                          {it.priorDoc.trim() ? (
                            <div className="mb-1 max-w-full whitespace-pre-wrap break-words pl-1">
                              ○ 종전공문: {reflowPdfText(it.priorDoc)}
                            </div>
                          ) : null}
                          {it.overview.trim() ? (
                            <div className="mb-1 max-w-full whitespace-pre-wrap break-words pl-1">
                              ○ 물품설명: {reflowPdfText(it.overview)}
                            </div>
                          ) : null}
                          <div
                            className={`mb-1 max-w-full break-words pl-1 ${clipGridMonoClass}`}
                          >
                            ○ 변경전 HS품목번호: {it.hsBefore || "—"}
                          </div>
                          <div
                            className={`mb-1 max-w-full break-words pl-1 ${clipGridMonoClass}`}
                          >
                            ○ 변경후 HS품목번호: {it.hsAfter || "—"}
                          </div>
                          {it.changeReason.trim() && !sharedReason ? (
                            <div className="mb-1 max-w-full whitespace-pre-wrap break-words pl-1">
                              ○ 변경사유: {reflowPdfText(it.changeReason)}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {detail.changeReason.trim() ? (
                      <div className="max-w-full whitespace-pre-wrap break-words border-t border-stone-200 pt-3">
                        ○ 변경사유: {reflowPdfText(detail.changeReason)}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* 표형 고시 (B/A 유형) — 텍스트 항목이 없을 때만 */}
                {detail.textItems.length === 0 &&
                detail.tableHeaders.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse border border-stone-500 text-[12px]">
                      <thead>
                        <tr className="bg-[#1a2744] text-white">
                          {detail.tableHeaders.map((h) => (
                            <th
                              key={h}
                              className="border border-stone-500 px-2 py-2 text-center font-semibold"
                            >
                              {h.replace(/\n/g, " ")}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.tableRows.map((row, ri) => (
                          <tr key={ri} className="align-top">
                            {detail.tableHeaders.map((_, ci) => {
                              const cell = row[ci] ?? "";
                              const isHs =
                                /HS|변경전|변경후/.test(
                                  detail.tableHeaders[ci] ?? "",
                                ) &&
                                !/물품|사유|이유|공문|구분|품명/.test(
                                  detail.tableHeaders[ci] ?? "",
                                );
                              return (
                                <td
                                  key={ci}
                                  className={`max-w-[28rem] break-words whitespace-pre-wrap border border-stone-400 px-2 py-3 leading-relaxed text-[#222] ${
                                    isHs
                                      ? `${clipGridMonoClass} text-center`
                                      : "text-left"
                                  }`}
                                >
                                  {cell.trim()
                                    ? isHs
                                      ? cell.trim()
                                      : reflowPdfText(cell)
                                    : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {/* 종전공문 목록 표 (후기 C형 첨부표) */}
                {detail.priorRows.length > 0 ? (
                  <div className="mt-3 overflow-x-auto">
                    <div className="mb-1 text-[11px] font-semibold text-slate-500">
                      품명 및 종전공문
                    </div>
                    <table className="w-full min-w-[480px] border-collapse border border-stone-400 text-[12px]">
                      <thead>
                        <tr className="bg-slate-100">
                          {(detail.priorHeaders.length
                            ? detail.priorHeaders
                            : ["번호", "품명", "종전공문"]
                          ).map((h) => (
                            <th
                              key={h}
                              className="border border-stone-400 px-2 py-1.5 font-semibold"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.priorRows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td
                                key={ci}
                                className="whitespace-pre-wrap border border-stone-300 px-2 py-1.5"
                              >
                                {cell || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {/* 시행일 */}
                {detail.applicationNote.trim() ? (
                  <div className="mt-3 border border-stone-300 bg-[#fafaf8] px-3 py-2.5 text-[12px] leading-relaxed text-[#333]">
                    <div className="whitespace-pre-wrap">
                      {detail.applicationNote}
                    </div>
                  </div>
                ) : null}

                {detail.rawText ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[12px] text-slate-600">
                      원문 텍스트
                    </summary>
                    <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded border border-stone-200 bg-[#fafaf8] p-3 text-[11px] leading-relaxed text-[#333]">
                      {detail.rawText}
                    </pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </CasCard>
        )}
      </div>
    </CasPageShell>
  );
}
