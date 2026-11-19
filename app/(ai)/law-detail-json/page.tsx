"use client";

import { CasPageHeader } from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { useEffect, useMemo, useState } from "react";
import { formatLawIdForDisplay } from "@/app/shared/law-id";
import { formatLastReceivedForDisplay } from "@/app/shared/last-received-date";

/** id = 현행 law_versions.id */
type LawDocumentItem = {
  id: number;
  law_pk?: number;
  law_id: string;
  law_name_kr: string;
  law_name_short: string;
  ministry_name: string;
  promulgation_date: string;
  enforcement_date: string;
  revision_type: string;
  updated_at: string;
  raw_json: unknown;
};

type LawArticleItem = {
  id: number;
  law_document_id: number;
  article_key: string;
  article_no: string;
  article_title: string;
  article_content: string;
  article_type: string;
  article_revision_type: string;
  article_effective_date: string;
  article_order: number;
  raw_json: unknown;
};

type LawArticleSubItem = {
  id: number;
  law_article_id: number;
  item_level: string;
  parent_item_id: number | null;
  item_no: string;
  item_content: string;
  item_order: number;
  raw_json: unknown;
};

type LawChunkItem = {
  id: number;
  law_document_id: number;
  law_article_id: number | null;
  source_type: string;
  source_key: string;
  source_title: string;
  chunk_text: string;
  chunk_index: number;
  metadata: unknown;
};

type ChunkScope = "document" | "article";
type DetailTab = "overview" | "articles" | "items" | "chunks";
const CHUNK_PAGE_SIZE = 30;

export default function LawDetailJsonPage() {
  const [documents, setDocuments] = useState<LawDocumentItem[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [articles, setArticles] = useState<LawArticleItem[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [articleItems, setArticleItems] = useState<LawArticleSubItem[]>([]);
  const [chunks, setChunks] = useState<LawChunkItem[]>([]);
  const [chunkKeyword, setChunkKeyword] = useState("");
  const [chunkPage, setChunkPage] = useState(1);
  const [chunkTotalCount, setChunkTotalCount] = useState(0);
  const [chunkScope, setChunkScope] = useState<ChunkScope>("document");
  const [keyword, setKeyword] = useState("");
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [isLoadingArticleItems, setIsLoadingArticleItems] = useState(false);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [message, setMessage] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");

  useEffect(() => {
    const loadDocuments = async () => {
      try {
        setIsLoadingDocuments(true);
        setMessage("");

        const response = await fetch("/api/law-detail/list", {
          method: "GET",
          cache: "no-store",
        });
        const text = await response.text();

        if (!response.ok) {
          throw new Error(`법령 목록 조회 실패: ${response.status} ${text}`);
        }

        const data = JSON.parse(text) as {
          ok: boolean;
          documents?: LawDocumentItem[];
          error?: string;
        };

        if (!data.ok) {
          throw new Error(data.error || "법령 목록 조회 실패");
        }

        const nextDocuments = data.documents ?? [];
        setDocuments(nextDocuments);

        if (nextDocuments.length > 0) {
          setSelectedDocumentId(nextDocuments[0].id);
        }
      } catch (error) {
        setDocuments([]);
        setSelectedDocumentId(null);
        setMessage(
          error instanceof Error
            ? error.message
            : "법령 목록 조회 중 오류가 발생했습니다.",
        );
      } finally {
        setIsLoadingDocuments(false);
      }
    };

    loadDocuments();
  }, []);

  useEffect(() => {
    if (!selectedDocumentId) {
      setArticles([]);
      setSelectedArticleId(null);
      setArticleItems([]);
      setChunks([]);
      setChunkTotalCount(0);
      setChunkPage(1);
      return;
    }

    const loadArticles = async () => {
      try {
        setIsLoadingArticles(true);

        const response = await fetch(
          `/api/law-detail/articles?lawVersionId=${selectedDocumentId}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );
        const text = await response.text();

        if (!response.ok) {
          throw new Error(`조문 목록 조회 실패: ${response.status} ${text}`);
        }

        const data = JSON.parse(text) as {
          ok: boolean;
          articles?: LawArticleItem[];
          error?: string;
        };

        if (!data.ok) {
          throw new Error(data.error || "조문 목록 조회 실패");
        }

        const nextArticles = data.articles ?? [];
        setArticles(nextArticles);
        setSelectedArticleId(nextArticles[0]?.id ?? null);
      } catch (error) {
        setArticles([]);
        setSelectedArticleId(null);
        setMessage(
          error instanceof Error
            ? error.message
            : "조문 목록 조회 중 오류가 발생했습니다.",
        );
      } finally {
        setIsLoadingArticles(false);
      }
    };

    loadArticles();
  }, [selectedDocumentId]);

  useEffect(() => {
    setChunkPage(1);
  }, [selectedDocumentId, selectedArticleId, chunkScope, chunkKeyword]);

  useEffect(() => {
    if (!selectedDocumentId) {
      setChunks([]);
      setChunkTotalCount(0);
      return;
    }

    const loadChunks = async () => {
      try {
        setIsLoadingChunks(true);

        const shouldFilterByArticle =
          chunkScope === "article" && Number.isFinite(selectedArticleId);

        const queryParams = new URLSearchParams();
        queryParams.set("lawVersionId", String(selectedDocumentId));
        queryParams.set("page", String(chunkPage));
        queryParams.set("pageSize", String(CHUNK_PAGE_SIZE));
        if (chunkKeyword.trim()) {
          queryParams.set("q", chunkKeyword.trim());
        }
        if (shouldFilterByArticle && selectedArticleId) {
          queryParams.set("lawArticleId", String(selectedArticleId));
        }
        const query = `/api/law-detail/chunks?${queryParams.toString()}`;

        const response = await fetch(query, {
          method: "GET",
          cache: "no-store",
        });
        const text = await response.text();

        if (!response.ok) {
          throw new Error(`청크 목록 조회 실패: ${response.status} ${text}`);
        }

        const data = JSON.parse(text) as {
          ok: boolean;
          chunks?: LawChunkItem[];
          totalCount?: number;
          error?: string;
        };

        if (!data.ok) {
          throw new Error(data.error || "청크 목록 조회 실패");
        }

        setChunks(data.chunks ?? []);
        setChunkTotalCount(data.totalCount ?? 0);
      } catch (error) {
        setChunks([]);
        setChunkTotalCount(0);
        setMessage(
          error instanceof Error
            ? error.message
            : "청크 목록 조회 중 오류가 발생했습니다.",
        );
      } finally {
        setIsLoadingChunks(false);
      }
    };

    loadChunks();
  }, [selectedDocumentId, selectedArticleId, chunkScope, chunkKeyword, chunkPage]);

  useEffect(() => {
    if (!selectedArticleId) {
      setArticleItems([]);
      return;
    }

    const loadArticleItems = async () => {
      try {
        setIsLoadingArticleItems(true);

        const response = await fetch(
          `/api/law-detail/article-items?lawArticleId=${selectedArticleId}`,
          {
            method: "GET",
            cache: "no-store",
          },
        );
        const text = await response.text();

        if (!response.ok) {
          throw new Error(`항/호/목 조회 실패: ${response.status} ${text}`);
        }

        const data = JSON.parse(text) as {
          ok: boolean;
          items?: LawArticleSubItem[];
          error?: string;
        };

        if (!data.ok) {
          throw new Error(data.error || "항/호/목 조회 실패");
        }

        setArticleItems(data.items ?? []);
      } catch (error) {
        setArticleItems([]);
        setMessage(
          error instanceof Error
            ? error.message
            : "항/호/목 조회 중 오류가 발생했습니다.",
        );
      } finally {
        setIsLoadingArticleItems(false);
      }
    };

    loadArticleItems();
  }, [selectedArticleId]);

  const filteredDocuments = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return documents;

    return documents.filter((item) => {
      const receivedAt = formatLastReceivedForDisplay(item.updated_at).toLowerCase();
      return (
        item.law_name_kr?.toLowerCase().includes(q) ||
        item.law_name_short?.toLowerCase().includes(q) ||
        item.law_id?.toLowerCase().includes(q) ||
        formatLawIdForDisplay(item.law_id).toLowerCase().includes(q) ||
        item.ministry_name?.toLowerCase().includes(q) ||
        receivedAt.includes(q)
      );
    });
  }, [documents, keyword]);

  const selectedDocument =
    documents.find((item) => item.id === selectedDocumentId) ?? null;
  const selectedArticle =
    articles.find((item) => item.id === selectedArticleId) ?? null;
  const articleItemsWithDepth = useMemo(
    () => buildArticleItemRows(articleItems),
    [articleItems],
  );
  const chunkTotalPages = Math.max(1, Math.ceil(chunkTotalCount / CHUNK_PAGE_SIZE));

  const formatReceivedAt = (value: string) =>
    value.trim() ? formatLastReceivedForDisplay(value) : "—";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-100 p-2 sm:p-3">
      {message ? (
        <div className="mb-2 shrink-0 rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm">
          {message}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-md">
        <aside
          className="flex h-full min-h-0 w-[min(100%,52%)] max-w-[920px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/95"
          aria-label="법령 목록"
        >
          <div className="shrink-0 border-b border-slate-200/80 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <CasPageHeader
                title="저장된 법령·조문 JSON"
                className="min-w-0 flex-1 [&_h1]:text-base sm:[&_h1]:text-base"
              />
              <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-right">
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  법령
                </div>
                <div className="tabular-nums text-lg font-semibold text-slate-800">
                  {filteredDocuments.length}
                  <span className="ml-0.5 text-xs font-normal text-slate-500">건</span>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 border-b border-slate-200/80 px-4 py-2.5">
            <label className="block">
              <span className="sr-only">법령 검색</span>
              <input
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="법령명, 법령ID, 소관부처, 최종수신일시 검색"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              />
            </label>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
            <table
              className="w-full border-collapse text-sm"
              style={{ minWidth: "52rem" }}
            >
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100/95 shadow-sm backdrop-blur-sm">
                <tr>
                  <th
                    scope="col"
                    className="min-w-[14rem] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    법령명
                  </th>
                  <th
                    scope="col"
                    className="w-20 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    법령ID
                  </th>
                  <th
                    scope="col"
                    className="min-w-[7.5rem] px-2 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    소관부처
                  </th>
                  <th
                    scope="col"
                    className="w-[9.5rem] px-3 py-3 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-600"
                  >
                    최종수신일시
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoadingDocuments ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-16 text-center text-sm text-slate-500"
                    >
                      불러오는 중…
                    </td>
                  </tr>
                ) : filteredDocuments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-16 text-center text-sm text-slate-500"
                    >
                      {keyword.trim()
                        ? "검색어와 일치하는 법령이 없습니다."
                        : "저장된 법령 JSON 데이터가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  filteredDocuments.map((item) => {
                    const isSelected = item.id === selectedDocumentId;
                    const receivedAt = formatReceivedAt(item.updated_at);

                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedDocumentId(item.id)}
                        className={`cursor-pointer align-middle transition-colors ${
                          isSelected
                            ? "bg-sky-50 ring-1 ring-inset ring-sky-200/80"
                            : "hover:bg-slate-50/90"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div
                            className="font-medium leading-snug text-slate-900"
                            title={item.law_name_kr || undefined}
                          >
                            {item.law_name_kr || "—"}
                          </div>
                          {item.law_name_short ? (
                            <div
                              className="mt-0.5 text-xs text-slate-500"
                              title={item.law_name_short}
                            >
                              {item.law_name_short}
                            </div>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3 text-center font-mono text-xs tabular-nums text-slate-700">
                          {item.law_id ? formatLawIdForDisplay(item.law_id) : "—"}
                        </td>
                        <td
                          className="px-2 py-3 text-xs text-slate-700"
                          title={item.ministry_name || undefined}
                        >
                          {item.ministry_name || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 pr-4 text-right text-xs tabular-nums text-slate-600">
                          {receivedAt}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <nav
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-50/80 px-3 py-2"
            aria-label="상세 보기"
          >
            <DetailTabButton
              active={detailTab === "overview"}
              onClick={() => setDetailTab("overview")}
              label="법령 정보"
            />
            <DetailTabButton
              active={detailTab === "articles"}
              onClick={() => setDetailTab("articles")}
              label="조문"
              count={articles.length}
            />
            <DetailTabButton
              active={detailTab === "items"}
              onClick={() => setDetailTab("items")}
              label="항·호·목"
              count={articleItems.length}
            />
            <DetailTabButton
              active={detailTab === "chunks"}
              onClick={() => setDetailTab("chunks")}
              label="청크"
              count={chunkTotalCount}
            />
          </nav>

          <div className="min-h-0 flex-1 overflow-hidden">
            {!selectedDocument ? (
              <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
                왼쪽 목록에서 법령을 선택해 주세요.
              </div>
            ) : detailTab === "overview" ? (
              <div className="h-full overflow-y-auto overscroll-contain p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <DetailRow label="법령명" value={selectedDocument.law_name_kr} />
                  <DetailRow
                    label="법령약칭명"
                    value={selectedDocument.law_name_short}
                  />
                  <DetailRow
                    label="법령ID"
                    value={formatLawIdForDisplay(selectedDocument.law_id)}
                  />
                  <DetailRow label="소관부처명" value={selectedDocument.ministry_name} />
                  <DetailRow
                    label="공포일자"
                    value={selectedDocument.promulgation_date}
                  />
                  <DetailRow
                    label="시행일자"
                    value={selectedDocument.enforcement_date}
                  />
                  <DetailRow label="개정유형" value={selectedDocument.revision_type} />
                  <DetailRow
                    label="최종수신일시"
                    value={formatReceivedAt(selectedDocument.updated_at)}
                  />
                </div>
                <div className="mt-4">
                  <JsonBox
                    title="법령 원본 JSON"
                    value={selectedDocument.raw_json}
                    className="max-h-[min(52vh,560px)]"
                  />
                </div>
              </div>
            ) : detailTab === "articles" ? (
              <div className="flex h-full min-h-0">
                <div className="flex w-[min(42%,18rem)] shrink-0 flex-col border-r border-slate-200 bg-slate-50/50">
                  <div className="shrink-0 border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-500">
                    {isLoadingArticles ? "불러오는 중…" : `조문 ${articles.length}건`}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    <table className="w-full border-collapse text-sm">
                      <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-100/95 backdrop-blur-sm">
                        <tr>
                          <th className="w-16 px-3 py-2 text-left text-xs font-semibold text-slate-600">
                            번호
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                            제목
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {articles.length === 0 ? (
                          <tr>
                            <td
                              colSpan={2}
                              className="px-3 py-10 text-center text-xs text-slate-500"
                            >
                              저장된 조문이 없습니다.
                            </td>
                          </tr>
                        ) : (
                          articles.map((article) => {
                            const isSelected = article.id === selectedArticleId;
                            return (
                              <tr
                                key={article.id}
                                onClick={() => setSelectedArticleId(article.id)}
                                className={`cursor-pointer transition-colors ${
                                  isSelected
                                    ? "bg-sky-50 ring-1 ring-inset ring-sky-200/70"
                                    : "hover:bg-slate-50/80"
                                }`}
                              >
                                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-800">
                                  {article.article_no || "—"}
                                </td>
                                <td className="px-3 py-2 text-xs leading-snug text-slate-800">
                                  {article.article_title || "—"}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4">
                  {!selectedArticle ? (
                    <p className="text-sm text-slate-500">조문을 선택해 주세요.</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <DetailRow label="조문번호" value={selectedArticle.article_no} />
                        <DetailRow label="조문제목" value={selectedArticle.article_title} />
                        <DetailRow label="조문유형" value={selectedArticle.article_type} />
                        <DetailRow
                          label="개정유형"
                          value={selectedArticle.article_revision_type}
                        />
                        <DetailRow
                          label="시행일자"
                          value={selectedArticle.article_effective_date}
                        />
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="mb-1 text-xs font-medium text-slate-500">
                          조문내용
                        </div>
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                          {selectedArticle.article_content || "—"}
                        </div>
                      </div>
                      <JsonBox
                        title="조문 원본 JSON"
                        value={selectedArticle.raw_json}
                        className="max-h-[min(40vh,420px)]"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : detailTab === "items" ? (
              <div className="h-full overflow-auto overscroll-contain">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-100/95 backdrop-blur-sm">
                    <tr>
                      <th className="w-20 px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                        레벨
                      </th>
                      <th className="w-24 px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                        번호
                      </th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                        내용
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {articleItemsWithDepth.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-12 text-center text-sm text-slate-500"
                        >
                          {selectedArticleId
                            ? "선택한 조문의 항/호/목 데이터가 없습니다."
                            : "조문 탭에서 조문을 먼저 선택해 주세요."}
                        </td>
                      </tr>
                    ) : (
                      articleItemsWithDepth.map((item) => (
                        <tr key={item.id} className="align-top">
                          <td className="px-4 py-2.5 text-xs text-slate-700">
                            {item.item_level || "—"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-800">
                            {item.item_no || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-sm leading-relaxed text-slate-800">
                            <div style={{ paddingLeft: `${item.depth * 14}px` }}>
                              {item.item_content || "—"}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2.5">
                  <input
                    type="search"
                    value={chunkKeyword}
                    onChange={(e) => setChunkKeyword(e.target.value)}
                    placeholder="청크 텍스트 검색"
                    className="min-w-[10rem] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-sky-500 sm:max-w-xs"
                  />
                  <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                    <button
                      type="button"
                      onClick={() => setChunkScope("document")}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        chunkScope === "document"
                          ? "bg-sky-600 text-white shadow-sm"
                          : "text-slate-700 hover:bg-white"
                      }`}
                    >
                      문서 기준
                    </button>
                    <button
                      type="button"
                      onClick={() => setChunkScope("article")}
                      disabled={!selectedArticleId}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        chunkScope === "article"
                          ? "bg-sky-600 text-white shadow-sm"
                          : "text-slate-700 hover:bg-white"
                      }`}
                    >
                      조문 기준
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
                  <table
                    className="w-full border-collapse text-sm"
                    style={{ minWidth: "44rem" }}
                  >
                    <thead className="sticky top-0 z-[1] border-b border-slate-200 bg-slate-100/95 backdrop-blur-sm">
                      <tr>
                        <th className="w-16 px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                          index
                        </th>
                        <th className="w-40 px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                          source
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                          텍스트
                        </th>
                        <th className="w-48 px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                          metadata
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {chunks.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-12 text-center text-sm text-slate-500"
                          >
                            청크 데이터가 없습니다.
                          </td>
                        </tr>
                      ) : (
                        chunks.map((chunk) => (
                          <tr key={chunk.id} className="align-top">
                            <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-slate-700">
                              {chunk.chunk_index}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-700">
                              <div className="break-all">
                                {chunk.source_type}:{chunk.source_key}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-slate-800">
                              <div className="max-h-20 overflow-hidden whitespace-pre-wrap break-words leading-relaxed">
                                {chunk.chunk_text || "—"}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-700">
                              <pre className="max-h-24 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2">
                                {chunk.metadata
                                  ? JSON.stringify(chunk.metadata, null, 2)
                                  : "—"}
                              </pre>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => setChunkPage((prev) => Math.max(1, prev - 1))}
                    disabled={chunkPage <= 1}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    이전
                  </button>
                  <span className="tabular-nums text-xs text-slate-600">
                    {chunkPage} / {chunkTotalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setChunkPage((prev) => Math.min(chunkTotalPages, prev + 1))
                    }
                    disabled={chunkPage >= chunkTotalPages}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    다음
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function DetailTabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition sm:text-sm ${
        active
          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
          : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
      }`}
    >
      {label}
      {count !== undefined ? (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
            active ? "bg-sky-100 text-sky-800" : "bg-slate-200/80 text-slate-600"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 break-all text-sm text-slate-800">{value || "—"}</div>
    </div>
  );
}

function JsonBox({
  title,
  value,
  className,
}: {
  title: string;
  value: unknown;
  className?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="mb-2 text-xs font-medium text-slate-500">{title}</div>
      <pre
        className={`overflow-auto whitespace-pre-wrap break-all rounded bg-white p-3 text-xs text-slate-700 ${
          className ?? "max-h-80"
        }`}
      >
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}

function buildArticleItemRows(items: LawArticleSubItem[]) {
  const childrenMap = new Map<number | null, LawArticleSubItem[]>();

  for (const item of items) {
    const parentId = item.parent_item_id ?? null;
    const siblings = childrenMap.get(parentId) ?? [];
    siblings.push(item);
    childrenMap.set(parentId, siblings);
  }

  for (const siblings of childrenMap.values()) {
    siblings.sort((a, b) => {
      const orderDiff = (a.item_order ?? 0) - (b.item_order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return a.id - b.id;
    });
  }

  const rows: Array<LawArticleSubItem & { depth: number }> = [];

  const walk = (parentId: number | null, depth: number) => {
    const children = childrenMap.get(parentId) ?? [];
    for (const child of children) {
      rows.push({ ...child, depth });
      walk(child.id, depth + 1);
    }
  };

  walk(null, 0);
  return rows;
}
