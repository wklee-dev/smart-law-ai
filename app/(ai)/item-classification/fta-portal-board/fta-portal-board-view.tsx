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
  ClipGridStatsBar,
  ClipGridTable,
  ClipGridTd,
  ClipGridTh,
  ClipGridTruncateCell,
  ClipPaginationBar,
  clipGridRowHoverClass,
} from "@/app/(ai)/customs-law-portal/clip-portal-grid-ui";
import {
  CLASSIFICATION_FORM_INPUT_CLASS,
  ClassificationFormSplitField,
} from "@/app/(ai)/item-classification/classification-form-split-field";
import {
  formatFileSize,
  YestradeFileList,
  YestradeHtmlPanel,
} from "@/app/(ai)/kita/yestrade-content-panel";
import type {
  FtaPortalPostDetail,
  FtaPortalPostListRow,
} from "@/app/lib/fta-portal-board-shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const PAGE_NUMBER_WINDOW = 10;

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

export function FtaPortalBoardView({
  title,
  sourceUrl,
  sourceLabel,
  apiBase,
  tableHint,
  categoryLabel = "구분",
}: {
  title: string;
  sourceUrl: string;
  sourceLabel: string;
  apiBase: string;
  tableHint: string;
  categoryLabel?: string;
}) {
  const [ready, setReady] = useState(true);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywordApplied, setKeywordApplied] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<FtaPortalPostListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [post, setPost] = useState<FtaPortalPostDetail | null>(null);
  const [postLoading, setPostLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const u = new URLSearchParams();
      u.set("page", String(page));
      u.set("pageSize", String(pageSize));
      if (keywordApplied.trim()) u.set("keyword", keywordApplied.trim());
      const data = await fetchJson<{
        ready: boolean;
        rows: FtaPortalPostListRow[];
        total: number;
      }>(`${apiBase}/list?${u}`);
      setReady(data.ready);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      if ((data.rows ?? []).length > 0) {
        setSelectedId((prev) => {
          if (prev && data.rows.some((r) => r.id === prev)) return prev;
          return data.rows[0]!.id;
        });
      } else {
        setSelectedId(null);
        setPost(null);
      }
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "목록 조회 실패");
    } finally {
      setListLoading(false);
    }
  }, [apiBase, page, pageSize, keywordApplied]);

  const loadPost = useCallback(
    async (id: number) => {
      setPostLoading(true);
      try {
        const data = await fetchJson<{ post: FtaPortalPostDetail }>(
          `${apiBase}/detail?id=${id}`,
        );
        setPost(data.post);
      } catch (e) {
        setPost(null);
        setError(e instanceof Error ? e.message : "게시물 조회 실패");
      } finally {
        setPostLoading(false);
      }
    },
    [apiBase],
  );

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    if (selectedId == null) return;
    void loadPost(selectedId);
  }, [selectedId, loadPost]);

  const totalPg = Math.max(1, Math.ceil(total / pageSize) || 1);
  const pageSafe = Math.min(page, totalPg);
  const block = useMemo(
    () => visiblePageBlock(pageSafe, totalPg),
    [pageSafe, totalPg],
  );

  return (
    <CasPageShell>
      <CasPageHeader title={title} />
      <p className="text-[12px] text-slate-600">
        FTA 포털 협정별 자료실 ·{" "}
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1e2f4f] underline"
        >
          {sourceLabel}
        </a>
        . 테이블 <code className="rounded bg-slate-100 px-1">{tableHint}</code>
        {!ready ? " · DB 미준비(크롤 후 표시)" : null}
      </p>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </p>
      ) : null}

      <CasCard title="검색">
        <ClassificationFormSplitField label="제목·구분·본문">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              type="search"
              className={`${CLASSIFICATION_FORM_INPUT_CLASS} min-w-[12rem] flex-1`}
              value={keywordDraft}
              placeholder="제목, 구분, 작성자, 본문"
              onChange={(e) => setKeywordDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setKeywordApplied(keywordDraft);
                  setPage(1);
                }
              }}
            />
            <div className="ml-auto flex gap-2">
              <CasSearchButton
                onClick={() => {
                  setKeywordApplied(keywordDraft);
                  setPage(1);
                }}
              />
              <CasResetButton
                onClick={() => {
                  setKeywordDraft("");
                  setKeywordApplied("");
                  setPage(1);
                }}
              />
            </div>
          </div>
        </ClassificationFormSplitField>
      </CasCard>

      <CasCard title={`${title} 목록`}>
        <ClipGridStatsBar
          total={total}
          pageSize={pageSize}
          loading={listLoading}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
        <ClipGridTable>
          <thead>
            <tr>
              <ClipGridTh className="w-14">번호</ClipGridTh>
              <ClipGridTh className="w-24">{categoryLabel}</ClipGridTh>
              <ClipGridTh>제목</ClipGridTh>
              <ClipGridTh className="w-24">작성자</ClipGridTh>
              <ClipGridTh className="w-28">등록일</ClipGridTh>
              <ClipGridTh className="w-16">조회</ClipGridTh>
              <ClipGridTh className="w-14">첨부</ClipGridTh>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <ClipGridEmptyRow colSpan={7} loading={listLoading} />
            ) : (
              rows.map((r) => {
                const on = selectedId === r.id;
                return (
                  <tr
                    key={r.id}
                    className={`${clipGridRowHoverClass} cursor-pointer ${
                      on ? "bg-[#e8eef8]" : ""
                    }`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <ClipGridTd className="text-center">
                      {r.listNumber || r.id}
                    </ClipGridTd>
                    <ClipGridTruncateCell
                      align="center"
                      title={r.category}
                      className="w-24"
                    >
                      {r.category || "-"}
                    </ClipGridTruncateCell>
                    <ClipGridTruncateCell title={r.title}>
                      {r.title}
                    </ClipGridTruncateCell>
                    <ClipGridTd className="text-center">
                      {r.author || "-"}
                    </ClipGridTd>
                    <ClipGridTd className="text-center">
                      {r.registeredDate}
                    </ClipGridTd>
                    <ClipGridTd className="text-center">
                      {r.viewCount || ""}
                    </ClipGridTd>
                    <ClipGridTd className="text-center">{r.nFiles}</ClipGridTd>
                  </tr>
                );
              })
            )}
          </tbody>
        </ClipGridTable>
        {total > 0 ? (
          <ClipPaginationBar
            curPageSafe={pageSafe}
            totalPg={totalPg}
            loading={listLoading}
            block={block}
            onPage={setPage}
          />
        ) : null}
      </CasCard>

      <CasCard title={post?.title || "게시물 본문"}>
        {post ? (
          <p className="mb-2 text-[11px] text-[#666]">
            {[
              post.category ? `구분 ${post.category}` : "",
              post.author,
              post.registeredDate,
              post.viewCount ? `조회 ${post.viewCount}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
            {post.sourceUrl ? (
              <>
                {" · "}
                <a
                  href={post.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1e2f4f] underline"
                >
                  원본
                </a>
              </>
            ) : null}
          </p>
        ) : null}
        <YestradeHtmlPanel
          html={post?.contentHtml}
          text={post?.contentText}
          loading={postLoading}
          emptyMessage="게시물을 선택하세요."
        />
        <YestradeFileList
          title="첨부파일"
          items={(post?.files ?? []).map((f) => ({
            key: `f-${f.id}`,
            label: f.fileName,
            href: f.downloadUrl,
            meta: formatFileSize(f.sizeBytes),
          }))}
        />
      </CasCard>
    </CasPageShell>
  );
}
