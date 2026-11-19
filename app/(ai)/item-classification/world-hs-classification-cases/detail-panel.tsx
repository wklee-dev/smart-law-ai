"use client";

import { CasSecondaryButton } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  ClipPaginationBar,
  clipGridRowHoverClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLIP_WORLD_HS_CLASSIFICATION_COUNTRY_FLAG,
  type ClipWorldHsClassificationCaseDetail,
  type ClipWorldHsClassificationCaseListRow,
} from "@/app/lib/clip-world-hs-classification-cases-shared";
import {
  searchParamsToListState,
  sidePageFromSearchParams,
  worldHsClassificationCasesPageHref,
  type ClipWorldHsClassificationCasesListState,
} from "@/app/lib/clip-world-hs-classification-cases-url";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const SIDEBAR_PAGE_SIZE = 5;
const PAGE_NUMBER_WINDOW = 10;

const labelCellClass =
  "w-[6.5rem] shrink-0 border-r border-[#e5e9ef] bg-[#f8fafc] px-3 py-2.5 text-left text-[12px] font-semibold text-[#333]";
const valueCellClass =
  "min-w-0 border-r border-[#e5e9ef] px-3 py-2.5 text-[13px] text-[#333] last:border-r-0";

function visiblePageBlock(currentPage: number, totalPages: number): number[] {
  const tp = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(Math.max(1, Math.floor(currentPage)), tp);
  const start = Math.floor((cur - 1) / PAGE_NUMBER_WINDOW) * PAGE_NUMBER_WINDOW + 1;
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

function CountryWithFlag({ country }: { country: string }) {
  const name = country.trim();
  if (!name) return <span>{"\u00a0"}</span>;
  const code = CLIP_WORLD_HS_CLASSIFICATION_COUNTRY_FLAG[name];
  return (
    <span className="inline-flex items-center gap-1.5">
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
  );
}

function ExcelFileLink({
  name,
  size,
  attachmentId,
  hasLocal,
}: {
  name: string;
  size: string;
  attachmentId: string;
  hasLocal: boolean;
}) {
  const label = `${name}${size ? ` (${size})` : ""}`;
  if (!hasLocal) {
    return <span className="text-[#666]">{label} — 로컬 파일 없음</span>;
  }
  return (
    <a
      href={`/api/clip-world-hs-classification-cases/download?attachmentId=${encodeURIComponent(attachmentId)}`}
      className="inline-flex items-center gap-1.5 text-[#1e2f4f] hover:underline"
    >
      <span
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-[#217346] text-[9px] font-bold text-white"
        aria-hidden
      >
        X
      </span>
      {label}
    </a>
  );
}

function buildQueryUrl(
  filters: ClipWorldHsClassificationCasesListState,
  sidePage: number,
): string {
  const u = new URLSearchParams();
  if (filters.registeredFrom) u.set("registeredFrom", filters.registeredFrom);
  if (filters.registeredTo) u.set("registeredTo", filters.registeredTo);
  if (filters.country) u.set("country", filters.country);
  if (filters.effectivePeriod) u.set("effectivePeriod", filters.effectivePeriod);
  if (filters.keyword.trim()) u.set("keyword", filters.keyword.trim());
  u.set("keywordField", filters.keywordField);
  u.set("page", String(sidePage));
  u.set("pageSize", String(SIDEBAR_PAGE_SIZE));
  u.set("sort", filters.sort);
  u.set("dir", filters.sortDir);
  return `/api/clip-world-hs-classification-cases/query?${u}`;
}

export function WorldHsClassificationCasesDetailPanel({
  caseId,
}: {
  caseId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = useMemo(() => {
    return (
      searchParamsToListState(searchParams) ?? {
        registeredFrom: "",
        registeredTo: "",
        country: "",
        effectivePeriod: "",
        keywordField: "title",
        keyword: "",
        page: 1,
        pageSize: 10,
        sort: "registered_date" as const,
        sortDir: "desc" as const,
      }
    );
  }, [searchParams]);

  const [sidePage, setSidePage] = useState(() =>
    sidePageFromSearchParams(searchParams),
  );
  const [sidebarRows, setSidebarRows] = useState<
    ClipWorldHsClassificationCaseListRow[]
  >([]);
  const [sidebarTotal, setSidebarTotal] = useState(0);
  const [sidebarLoading, setSidebarLoading] = useState(false);

  const [detail, setDetail] = useState<ClipWorldHsClassificationCaseDetail | null>(
    null,
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSidePage(sidePageFromSearchParams(searchParams));
  }, [searchParams]);

  const listBackHref = useMemo(
    () => worldHsClassificationCasesPageHref(searchParams, { caseId: null }),
    [searchParams],
  );

  const loadSidebar = useCallback(async () => {
    setSidebarLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: ClipWorldHsClassificationCaseListRow[];
        total: number;
      }>(buildQueryUrl(filters, sidePage));
      setSidebarRows(data.rows ?? []);
      setSidebarTotal(data.total ?? 0);
    } catch (e) {
      setSidebarRows([]);
      setSidebarTotal(0);
      setError(e instanceof Error ? e.message : "목록 조회 실패");
    } finally {
      setSidebarLoading(false);
    }
  }, [filters, sidePage]);

  const loadDetail = useCallback(async () => {
    setDetailLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ detail: ClipWorldHsClassificationCaseDetail }>(
        `/api/clip-world-hs-classification-cases/detail?caseId=${encodeURIComponent(caseId)}`,
      );
      setDetail(data.detail);
    } catch (e) {
      setDetail(null);
      setError(e instanceof Error ? e.message : "상세 조회 실패");
    } finally {
      setDetailLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void loadSidebar();
  }, [loadSidebar]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const sidebarTotalPg = Math.max(1, Math.ceil(sidebarTotal / SIDEBAR_PAGE_SIZE));
  const sidePageSafe = Math.min(sidePage, sidebarTotalPg);
  const block = visiblePageBlock(sidePageSafe, sidebarTotalPg);

  const listPage =
    Number(searchParams.get("listPage") ?? filters.page) || 1;

  const caseHref = (id: string) =>
    worldHsClassificationCasesPageHref(searchParams, {
      caseId: id,
      listPage,
      sidePage,
    });

  const onSidebarPage = (p: number) => {
    setSidePage(p);
    router.replace(
      worldHsClassificationCasesPageHref(searchParams, {
        caseId,
        listPage,
        sidePage: p,
      }),
    );
  };

  const attachments = detail?.attachments ?? [];

  return (
    <>
      {error ? (
        <p className="mb-2 text-[12px] text-red-600">{error}</p>
      ) : null}

      <div className="flex min-h-0 flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex w-full shrink-0 flex-col lg:w-[280px] xl:w-[320px]">
          <aside className="flex flex-col rounded border border-[#e5e9ef] bg-white">
            <div className="border-b border-[#e5e9ef] bg-[#f8fafc] px-3 py-2.5 text-[13px] font-semibold text-[#1e2f4f]">
              품목분류 자료실 상세 목록 [{sidebarTotal.toLocaleString()}]
            </div>
            <ul className="min-h-[14rem] max-h-[32rem] overflow-auto py-1">
              {sidebarLoading && sidebarRows.length === 0 ? (
                <li className="px-3 py-2 text-[12px] text-[#666]">불러오는 중…</li>
              ) : null}
              {!sidebarLoading && sidebarRows.length === 0 ? (
                <li className="px-3 py-2 text-[12px] text-[#666]">목록이 없습니다.</li>
              ) : null}
              {sidebarRows.map((row) => {
                const active = row.case_id === caseId;
                return (
                  <li key={row.case_id}>
                    <Link
                      href={caseHref(row.case_id)}
                      className={`block px-3 py-2 text-[12px] leading-snug ${
                        active
                          ? "bg-[#e8eef7] font-semibold text-[#1e2f4f]"
                          : `text-[#333] hover:bg-stone-50 ${clipGridRowHoverClass}`
                      }`}
                      title={row.title}
                    >
                      {row.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
            {sidebarTotal > 0 ? (
              <div className="border-t border-[#e5e9ef] px-1 py-2">
                <ClipPaginationBar
                  curPageSafe={sidePageSafe}
                  totalPg={sidebarTotalPg}
                  loading={sidebarLoading}
                  block={block}
                  onPage={onSidebarPage}
                />
              </div>
            ) : null}
          </aside>
          <div className="mt-3 flex justify-center">
            <CasSecondaryButton
              type="button"
              onClick={() => router.push(listBackHref)}
            >
              목록
            </CasSecondaryButton>
          </div>
        </div>

        <div className="min-w-0 flex-1 rounded border border-[#e5e9ef] bg-white">
          {detailLoading && !detail ? (
            <p className="p-4 text-[12px] text-[#666]">상세 불러오는 중…</p>
          ) : null}
          {detail ? (
            <table className="w-full border-collapse text-left">
              <tbody>
                <tr className="border-b border-[#e5e9ef]">
                  <th scope="row" className={labelCellClass}>
                    제목
                  </th>
                  <td colSpan={3} className={`${valueCellClass} border-r-0`}>
                    {detail.title}
                  </td>
                </tr>
                <tr className="border-b border-[#e5e9ef]">
                  <th scope="row" className={labelCellClass}>
                    국가
                  </th>
                  <td className={valueCellClass}>
                    <CountryWithFlag country={detail.country} />
                  </td>
                  <th scope="row" className={labelCellClass}>
                    시행년월
                  </th>
                  <td className={`${valueCellClass} border-r-0`}>
                    {detail.effective_period || "\u00a0"}
                  </td>
                </tr>
                <tr className="border-b border-[#e5e9ef]">
                  <th scope="row" className={labelCellClass}>
                    등록일자
                  </th>
                  <td className={valueCellClass}>{detail.registered_date}</td>
                  <th scope="row" className={labelCellClass}>
                    등록자명
                  </th>
                  <td className={`${valueCellClass} border-r-0`}>
                    {detail.registered_by || "\u00a0"}
                  </td>
                </tr>
                <tr className="border-b border-[#e5e9ef]">
                  <th scope="row" className={labelCellClass}>
                    조회수
                  </th>
                  <td colSpan={3} className={`${valueCellClass} border-r-0`}>
                    {detail.view_count.toLocaleString()}
                  </td>
                </tr>
                <tr className="border-b border-[#e5e9ef]">
                  <th scope="row" className={`${labelCellClass} align-top`}>
                    내용
                  </th>
                  <td colSpan={3} className={`${valueCellClass} border-r-0 align-top`}>
                    <div className="min-h-[10rem] max-h-[480px] overflow-auto py-1">
                      {detail.content_html ? (
                        <div
                          className="prose prose-sm max-w-none text-[13px] leading-relaxed text-[#333]"
                          dangerouslySetInnerHTML={{ __html: detail.content_html }}
                        />
                      ) : detail.content_text ? (
                        <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed">
                          {detail.content_text}
                        </pre>
                      ) : (
                        <span className="text-[#666]">본문이 없습니다.</span>
                      )}
                    </div>
                  </td>
                </tr>
                <tr>
                  <th scope="row" className={`${labelCellClass} align-top`}>
                    첨부파일
                  </th>
                  <td colSpan={3} className={`${valueCellClass} border-r-0 align-top`}>
                    {attachments.length === 0 ? (
                      <span className="text-[#666]">없음</span>
                    ) : (
                      <ul className="space-y-1.5">
                        {attachments.map((a) => (
                          <li key={a.attachment_id}>
                            <ExcelFileLink
                              name={a.original_file_name}
                              size={a.displayed_size}
                              attachmentId={a.attachment_id}
                              hasLocal={a.has_local_file}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : !detailLoading ? (
            <p className="p-4 text-[12px] text-[#666]">사례를 찾을 수 없습니다.</p>
          ) : null}
        </div>
      </div>
    </>
  );
}
