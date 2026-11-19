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
  YcpIntroDetail,
  YcpPostDetail,
  YcpPostListRow,
} from "@/app/lib/yestrade-cp-shared";
import { useCallback, useEffect, useMemo, useState } from "react";

const SOURCE_URL = "https://www.yestrade.go.kr/cp/introduction";
const BOARD_URL = "https://www.yestrade.go.kr/user/boards/65/posts";
const PAGE_NUMBER_WINDOW = 10;

type TabKey = "intro" | "board";

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

export function ComplianceTraderView() {
  const [tab, setTab] = useState<TabKey>("intro");
  const [ready, setReady] = useState(true);
  const [intro, setIntro] = useState<YcpIntroDetail | null>(null);
  const [introLoading, setIntroLoading] = useState(true);

  const [keywordDraft, setKeywordDraft] = useState("");
  const [keywordApplied, setKeywordApplied] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<YcpPostListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [post, setPost] = useState<YcpPostDetail | null>(null);
  const [postLoading, setPostLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIntro = useCallback(async () => {
    setIntroLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{
        ready: boolean;
        intro: YcpIntroDetail | null;
      }>("/api/yestrade-cp/intro");
      setReady(data.ready);
      setIntro(data.intro);
    } catch (e) {
      setIntro(null);
      setError(e instanceof Error ? e.message : "CP 소개 조회 실패");
    } finally {
      setIntroLoading(false);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const u = new URLSearchParams();
      u.set("page", String(page));
      u.set("pageSize", String(pageSize));
      if (keywordApplied.trim()) u.set("keyword", keywordApplied.trim());
      const data = await fetchJson<{
        rows: YcpPostListRow[];
        total: number;
      }>(`/api/yestrade-cp/posts?${u}`);
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      if ((data.rows ?? []).length > 0) {
        setSelectedId((prev) => {
          if (prev && data.rows.some((r) => r.post_id === prev)) return prev;
          return data.rows[0]!.post_id;
        });
      } else {
        setSelectedId(null);
        setPost(null);
      }
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "공지 목록 조회 실패");
    } finally {
      setListLoading(false);
    }
  }, [page, pageSize, keywordApplied]);

  const loadPost = useCallback(async (postId: number) => {
    setPostLoading(true);
    try {
      const data = await fetchJson<{ post: YcpPostDetail }>(
        `/api/yestrade-cp/post?postId=${postId}`,
      );
      setPost(data.post);
    } catch (e) {
      setPost(null);
      setError(e instanceof Error ? e.message : "게시글 조회 실패");
    } finally {
      setPostLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIntro();
  }, [loadIntro]);

  useEffect(() => {
    if (tab === "board") void loadPosts();
  }, [tab, loadPosts]);

  useEffect(() => {
    if (tab !== "board" || selectedId == null) return;
    void loadPost(selectedId);
  }, [tab, selectedId, loadPost]);

  const totalPg = Math.max(1, Math.ceil(total / pageSize) || 1);
  const pageSafe = Math.min(page, totalPg);
  const block = useMemo(
    () => visiblePageBlock(pageSafe, totalPg),
    [pageSafe, totalPg],
  );

  return (
    <CasPageShell>
      <CasPageHeader title="자율준수무역거래자" />
      <p className="text-[12px] text-slate-600">
        예스트레이드 CP 메뉴 수집본(
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1e2f4f] underline"
        >
          CP 소개
        </a>
        {" · "}
        <a
          href={BOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[#1e2f4f] underline"
        >
          CP공지사항
        </a>
        ). 테이블 <code className="rounded bg-slate-100 px-1">ycp_*</code>
        {!ready ? " · DB 미준비" : null}
      </p>

      <div className="flex gap-1">
        {(
          [
            ["intro", "CP 소개"],
            ["board", "CP공지사항"],
          ] as const
        ).map(([key, label]) => {
          const on = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`h-8 rounded-md px-3 text-[13px] ${
                on
                  ? "bg-[#1e2f4f] font-semibold text-white"
                  : "border border-[#d8dee6] bg-white text-[#333] hover:bg-[#eef2f6]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
          {error}
        </p>
      ) : null}

      {tab === "intro" ? (
        <CasCard title={intro?.page_title || "CP 소개"}>
          {intro?.breadcrumb ? (
            <p className="mb-2 text-[11px] text-[#666]">{intro.breadcrumb}</p>
          ) : null}
          {intro?.source_url ? (
            <p className="mb-3 text-[11px]">
              <a
                href={intro.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1e2f4f] underline"
              >
                원본 페이지
              </a>
              {intro.crawled_at ? (
                <span className="ml-2 text-[#666]">
                  수집 {intro.crawled_at}
                </span>
              ) : null}
            </p>
          ) : null}

          {intro?.images?.length ? (
            <div className="mb-4 flex flex-wrap gap-3">
              {intro.images.map((im) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={im.image_id}
                  src={im.srcUrl}
                  alt={im.alt || im.file_name}
                  className="max-h-64 max-w-full rounded border border-[#e5e9ef] bg-white object-contain"
                />
              ))}
            </div>
          ) : null}

          <YestradeHtmlPanel
            html={intro?.content_xhtml}
            text={intro?.page_text}
            loading={introLoading}
          />
          <YestradeFileList
            title="첨부파일"
            items={(intro?.attachments ?? []).map((a) => ({
              key: `a-${a.attach_id}`,
              label: a.label || a.button_text || a.file_name,
              href: a.downloadUrl,
              meta: [a.file_name, formatFileSize(a.file_size)]
                .filter(Boolean)
                .join(" · "),
            }))}
          />
        </CasCard>
      ) : (
        <>
          <CasCard title="검색">
            <ClassificationFormSplitField label="제목·본문">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <input
                  type="search"
                  className={`${CLASSIFICATION_FORM_INPUT_CLASS} min-w-[12rem] flex-1`}
                  value={keywordDraft}
                  placeholder="제목, 본문, 첨부명"
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

          <CasCard title="CP공지사항 목록">
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
                  <ClipGridTh>제목</ClipGridTh>
                  <ClipGridTh className="w-28">게시일</ClipGridTh>
                  <ClipGridTh className="w-16">조회</ClipGridTh>
                  <ClipGridTh className="w-14">첨부</ClipGridTh>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <ClipGridEmptyRow colSpan={5} loading={listLoading} />
                ) : (
                  rows.map((r) => {
                    const on = selectedId === r.post_id;
                    return (
                      <tr
                        key={r.post_id}
                        className={`${clipGridRowHoverClass} cursor-pointer ${
                          on ? "bg-[#e8eef8]" : ""
                        }`}
                        onClick={() => setSelectedId(r.post_id)}
                      >
                        <ClipGridTd className="text-center">
                          {r.list_no}
                        </ClipGridTd>
                        <ClipGridTd>
                          <ClipGridTruncateCell title={r.title}>
                            {r.title}
                          </ClipGridTruncateCell>
                        </ClipGridTd>
                        <ClipGridTd className="text-center">
                          {r.posted_date}
                        </ClipGridTd>
                        <ClipGridTd className="text-center">
                          {r.views}
                        </ClipGridTd>
                        <ClipGridTd className="text-center">
                          {r.n_files}
                        </ClipGridTd>
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

          <CasCard title={post?.title || "게시글 본문"}>
            {post?.posted_date ? (
              <p className="mb-2 text-[11px] text-[#666]">
                {post.posted_date}
                {post.views ? ` · 조회 ${post.views}` : ""}
                {post.source_url ? (
                  <>
                    {" · "}
                    <a
                      href={post.source_url}
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
              html={post?.content_xhtml}
              text={post?.content_text}
              loading={postLoading}
              emptyMessage="게시글을 선택하세요."
            />
            <YestradeFileList
              title="첨부파일"
              items={(post?.files ?? []).map((f) => ({
                key: `f-${f.file_pk}`,
                label: f.file_label || f.file_name,
                href: f.downloadUrl,
                meta: [
                  f.file_name,
                  formatFileSize(f.file_size),
                  f.dup_count > 1 ? `표시 ${f.dup_count}회` : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
              }))}
            />
          </CasCard>
        </>
      )}
    </CasPageShell>
  );
}
