"use client";

import {
  CasCard,
  CasPageHeader,
  CasPageShell,
  CasSecondaryButton,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  CasResetButton,
  CasSearchButton,
} from "@/app/components/search-action-buttons";
import {
  ClipGridDateCell,
  ClipGridEmptyRow,
  ClipGridLinkTruncateCell,
  ClipGridStatsBar,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipPaginationBar,
  ClipSortThButton,
  clipGridRowHoverClass,
  clipGridSeqClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import { fillTodayIfEmpty } from "@/app/lib/date-input-utils";
import { formatFileSize } from "@/app/(ai)/kita/yestrade-content-panel";
import type {
  QiaNoticeDetail,
  QiaNoticeListRow,
  QiaNoticeSortKey,
} from "@/app/lib/qia-notice-shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;
const SOURCE_LIST_URL =
  "https://www.apqa.go.kr/animal/prevent/listwebQiaCom.do?type=7_depart";

const SORT_COLUMNS: { key: QiaNoticeSortKey; label: string }[] = [
  { key: "board_no", label: "번호" },
  { key: "title", label: "제목" },
  { key: "posted_date", label: "등록일" },
  { key: "dept", label: "담당부서" },
];

function str(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

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

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex min-w-0 gap-2 text-[12px]">
      <span className="w-20 shrink-0 font-semibold text-slate-600">{label}</span>
      <span className="min-w-0 break-words text-slate-800">{str(value)}</span>
    </div>
  );
}

type ViewMode = "list" | "detail";

export function ApqaNoticesView() {
  const [draft, setDraft] = useState({
    title: "",
    keyword: "",
    dept: "",
    dateFrom: "",
    dateTo: "",
  });
  const [applied, setApplied] = useState(draft);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState<QiaNoticeSortKey>("posted_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [rows, setRows] = useState<QiaNoticeListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QiaNoticeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const listUrl = useMemo(() => {
    const u = new URLSearchParams();
    u.set("page", String(page));
    u.set("pageSize", String(pageSize));
    u.set("sort", sort);
    u.set("dir", sortDir);
    if (applied.title.trim()) u.set("title", applied.title.trim());
    if (applied.keyword.trim()) u.set("keyword", applied.keyword.trim());
    if (applied.dept.trim()) u.set("dept", applied.dept.trim());
    if (applied.dateFrom.trim()) u.set("dateFrom", applied.dateFrom.trim());
    if (applied.dateTo.trim()) u.set("dateTo", applied.dateTo.trim());
    return `/api/qia-notice/query?${u}`;
  }, [page, pageSize, sort, sortDir, applied]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        rows: QiaNoticeListRow[];
        total: number;
      }>(listUrl);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "목록 조회 실패");
    } finally {
      setLoading(false);
    }
  }, [listUrl]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const openDetail = useCallback(async (postId: string) => {
    setSelectedId(postId);
    setViewMode("detail");
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await fetchJson<{ post: QiaNoticeDetail }>(
        `/api/qia-notice/detail?postId=${encodeURIComponent(postId)}`,
      );
      setDetail(data.post);
    } catch (e) {
      setError(e instanceof Error ? e.message : "상세 조회 실패");
      setViewMode("list");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  function resetForm() {
    const empty = {
      title: "",
      keyword: "",
      dept: "",
      dateFrom: "",
      dateTo: "",
    };
    setDraft(empty);
    setApplied(empty);
    setPage(1);
  }

  function onHeaderSort(key: QiaNoticeSortKey) {
    if (sort === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setSortDir(key === "title" || key === "dept" ? "asc" : "desc");
    }
    setPage(1);
  }

  const totalPg = Math.max(1, Math.ceil(total / pageSize) || 1);
  const curPageSafe = Math.min(page, totalPg);
  const block = useMemo(
    () => visiblePageBlock(curPageSafe, totalPg),
    [curPageSafe, totalPg],
  );

  return (
    <CasPageShell>
      <CasPageHeader title="공지사항" />
      <p className="text-[12px] text-slate-600">
        농림축산검역본부 ·{" "}
        <a
          href={SOURCE_LIST_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1e2f4f] underline"
        >
          공지사항 (원문)
        </a>
        {" · "}
        <code className="rounded bg-slate-100 px-1 text-[11px]">
          qia_notice_posts
        </code>
      </p>

      {viewMode === "list" ? (
        <>
          <div className="overflow-hidden rounded-lg border border-stone-300 bg-[#f5f2ea] shadow-sm ring-1 ring-stone-200/80">
            <div className="divide-y divide-stone-300 bg-white">
              <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-stone-300">
                <ClassificationFormSplitField label="제목">
                  <input
                    className={CLASSIFICATION_FORM_INPUT_CLASS}
                    value={draft.title}
                    placeholder="제목 키워드"
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, title: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setApplied(draft);
                        setPage(1);
                      }
                    }}
                  />
                </ClassificationFormSplitField>
                <ClassificationFormSplitField label="검색어">
                  <input
                    className={CLASSIFICATION_FORM_INPUT_CLASS}
                    value={draft.keyword}
                    placeholder="제목·부서·작성자"
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, keyword: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setApplied(draft);
                        setPage(1);
                      }
                    }}
                  />
                </ClassificationFormSplitField>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-stone-300">
                <ClassificationFormSplitField label="담당부서">
                  <input
                    className={CLASSIFICATION_FORM_INPUT_CLASS}
                    value={draft.dept}
                    placeholder="담당부서"
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, dept: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setApplied(draft);
                        setPage(1);
                      }
                    }}
                  />
                </ClassificationFormSplitField>
                <ClassificationFormSplitField label="등록일" compact>
                  <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
                    <input
                      type="date"
                      className={`${CLASSIFICATION_FORM_INPUT_CLASS} !w-auto min-w-[9.5rem] max-w-[11rem] shrink-0`}
                      value={draft.dateFrom}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, dateFrom: e.target.value }))
                      }
                      onFocus={() =>
                        fillTodayIfEmpty(draft.dateFrom, (ymd) =>
                          setDraft((p) => ({ ...p, dateFrom: ymd })),
                        )
                      }
                    />
                    <span className="shrink-0 text-slate-400">~</span>
                    <input
                      type="date"
                      className={`${CLASSIFICATION_FORM_INPUT_CLASS} !w-auto min-w-[9.5rem] max-w-[11rem] shrink-0`}
                      value={draft.dateTo}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, dateTo: e.target.value }))
                      }
                      onFocus={() =>
                        fillTodayIfEmpty(draft.dateTo, (ymd) =>
                          setDraft((p) => ({ ...p, dateTo: ymd })),
                        )
                      }
                    />
                  </div>
                </ClassificationFormSplitField>
              </div>
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
                    setApplied(draft);
                    setPage(1);
                  }}
                />
              </div>
            </div>
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
                <col style={{ width: "6%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "48%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "24%" }} />
              </colgroup>
              <thead>
                <tr>
                  <ClipGridTh>순번</ClipGridTh>
                  {SORT_COLUMNS.map(({ key, label }) => (
                    <ClipGridTh key={key}>
                      <ClipSortThButton
                        label={label}
                        active={sort === key}
                        sortDir={sortDir}
                        align={
                          key === "title" || key === "dept" ? "left" : "center"
                        }
                        onClick={() => onHeaderSort(key)}
                      />
                    </ClipGridTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(loading || rows.length === 0) && (
                  <ClipGridEmptyRow colSpan={5} loading={loading} />
                )}
                {!loading &&
                  rows.map((r, idx) => {
                    const seq = (curPageSafe - 1) * pageSize + idx + 1;
                    const sel = selectedId === r.postId;
                    return (
                      <tr
                        key={r.postId}
                        className={`${clipGridRowHoverClass} ${
                          sel ? "bg-[#1e2f4f]/5" : ""
                        }`}
                      >
                        <ClipGridTd className={clipGridSeqClass}>
                          {seq}
                        </ClipGridTd>
                        <ClipGridTd className="text-center tabular-nums">
                          {r.boardNo ?? "—"}
                        </ClipGridTd>
                        <ClipGridLinkTruncateCell
                          label={str(r.title)}
                          title={str(r.title)}
                          onClick={() => void openDetail(r.postId)}
                        />
                        <ClipGridDateCell title={str(r.postedDate)}>
                          {str(r.postedDate)}
                        </ClipGridDateCell>
                        <ClipGridTd className="truncate text-left" title={str(r.dept)}>
                          {str(r.dept)}
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
        </>
      ) : (
        <CasCard
          title="공지사항 상세"
          className="flex min-w-0 flex-col"
          action={
            <CasSecondaryButton
              type="button"
              onClick={() => {
                setViewMode("list");
                setDetail(null);
              }}
            >
              목록
            </CasSecondaryButton>
          }
        >
          {detailLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">
              불러오는 중…
            </p>
          ) : detail ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <DetailRow label="번호" value={detail.boardNo} />
                <DetailRow label="등록일" value={detail.postedDate} />
                <DetailRow label="담당부서" value={detail.dept} />
                <DetailRow label="작성자" value={detail.writer} />
                <DetailRow label="조회수" value={detail.views} />
                <DetailRow
                  label="첨부"
                  value={`${detail.attachmentCount}건`}
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold text-slate-600">
                  제목
                </p>
                <p className="text-[14px] font-semibold text-[#1e2f4f]">
                  {str(detail.title)}
                </p>
              </div>
              {detail.sourceUrl ? (
                <p className="text-[12px]">
                  <a
                    href={detail.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1e2f4f] underline"
                  >
                    원문 바로가기
                  </a>
                </p>
              ) : null}
              <div>
                <p className="mb-1 text-[11px] font-semibold text-slate-600">
                  본문
                </p>
                {detail.contentHtml.trim() ? (
                  <div
                    className="prose prose-sm max-w-none rounded-md border border-stone-200 bg-white p-3 text-[13px] leading-relaxed text-slate-800 [&_img]:max-w-full"
                    dangerouslySetInnerHTML={{ __html: detail.contentHtml }}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap rounded-md border border-stone-200 bg-white p-3 text-[13px] leading-relaxed text-slate-800">
                    {detail.contentText || "본문이 없습니다."}
                  </pre>
                )}
              </div>
              {detail.attachments.length > 0 ? (
                <div>
                  <p className="mb-2 text-[11px] font-semibold text-slate-600">
                    첨부파일
                  </p>
                  <ul className="space-y-1.5">
                    {detail.attachments.map((a) => (
                      <li key={a.fileId} className="text-[12px]">
                        {a.fileApiUrl ? (
                          <a
                            href={a.fileApiUrl}
                            className="font-medium text-[#1e2f4f] underline"
                          >
                            {a.name}
                          </a>
                        ) : (
                          <span className="text-slate-700">
                            {a.name}
                            <span className="ml-2 text-amber-700">
                              (로컬 파일 없음
                              {a.status ? ` · ${a.status}` : ""})
                            </span>
                          </span>
                        )}
                        {a.sizeBytes > 0 ? (
                          <span className="ml-2 text-slate-500">
                            {formatFileSize(a.sizeBytes)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              상세 정보가 없습니다.
            </p>
          )}
        </CasCard>
      )}
    </CasPageShell>
  );
}
