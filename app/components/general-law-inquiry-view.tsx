"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildLawTocModelUnified,
  collectChapterIds,
  collectSectionIds,
  filterLawTocModel,
  isChapterTitle,
  isSectionTitle,
  type TocArticle,
  type TocSectionNode,
} from "@/app/lib/law-toc-tree";
import {
  flattenLawArticleItemTree,
  normalizeLawItemNumericId,
} from "@/app/lib/law-article-items-tree";
import { isDeletedLawParagraph } from "@/app/lib/law-paragraph-utils";
import { formatLawIdForDisplay, normalizeLawIdForStorage } from "@/app/shared/law-id";

/** id = 현행 law_versions.id 또는 admrul_snapshots.id (doc_kind로 구분) */
type LawDocumentItem = {
  id: number;
  doc_kind?: "law" | "admrul";
  selection_key?: string;
  related_law_id?: string | null;
  law_pk?: number;
  law_id: string;
  law_name_kr: string;
  law_name_short: string;
  ministry_name: string;
  ministry_code: string;
  promulgation_no: string;
  promulgation_date: string;
  enforcement_date: string;
  revision_type: string;
  contact_phone: string;
  updated_at: string;
  raw_json: unknown;
};

type LawAnnexItem = {
  id: number;
  annex_no?: string;
  annex_sub_no?: string;
  annex_type?: string;
  annex_title?: string;
  file_link?: string | null;
  local_path?: string | null;
};

type RelatedAdmrulLink = {
  adm_serial_id: string;
  rule_name_kr: string;
  snapshot_id: number | null;
  selection_key: string | null;
};

type LawArticleItem = {
  id: number;
  law_document_id: number;
  article_key?: string;
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

function lawArticleItemsForArticle(
  map: Map<number, LawArticleSubItem[]>,
  articleId: unknown,
): LawArticleSubItem[] {
  const aid = normalizeLawItemNumericId(articleId);
  if (aid === null) return [];
  return map.get(aid) ?? [];
}

/** 왼쪽 목차 상단 「조문명검색」 — 필요 시 `true` 로 전환 */
const GENERAL_LAW_SHOW_ARTICLE_NAV_SEARCH = false;

/** 왼쪽 「법령 목록」 상단 법령 검색 입력 */
const GENERAL_LAW_SHOW_LAW_LIST_SEARCH = true;

function lawGoKrDetailUrl(doc: LawDocumentItem): string {
  const name = (doc.law_name_short || doc.law_name_kr).replace(/\s+/g, "");
  if (doc.doc_kind === "admrul") {
    return `https://www.law.go.kr/행정규칙/${encodeURIComponent(name)}`;
  }
  return `https://www.law.go.kr/법령/${encodeURIComponent(name)}/${doc.law_id}`;
}

function docSelectionKey(doc: LawDocumentItem): string {
  return doc.selection_key || `${doc.doc_kind === "admrul" ? "admrul" : "law"}:${doc.id}`;
}

export type GeneralLawInquiryViewProps = {
  /** 예: `/api/law-detail` 또는 `/api/law-detail-sqlite` */
  apiBase: string;
  /** 안내 배너에 표시할 저장소 설명 */
  storageHint?: string;
  /** 관세법령정보포털 분류 필터 (미지정·전체 = 모든 법령) */
  portalCategoryFilter?: string;
  /** 포털 내장 레이아웃 — 바깥 여백 축소 */
  compactChrome?: boolean;
};

export function GeneralLawInquiryView({
  apiBase,
  storageHint = "이 앱에 저장된 공포·시행 버전",
  portalCategoryFilter,
  compactChrome = false,
}: GeneralLawInquiryViewProps) {
  const [documents, setDocuments] = useState<LawDocumentItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [articles, setArticles] = useState<LawArticleItem[]>([]);
  const [itemsByArticleId, setItemsByArticleId] = useState<
    Map<number, LawArticleSubItem[]>
  >(new Map());
  const [annexes, setAnnexes] = useState<LawAnnexItem[]>([]);
  const [relatedAdmrul, setRelatedAdmrul] = useState<RelatedAdmrulLink[]>([]);
  const [keyword, setKeyword] = useState("");
  const [articleNavKeyword, setArticleNavKeyword] = useState("");
  const [bodySearch, setBodySearch] = useState("");
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [isLoadingArticles, setIsLoadingArticles] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [message, setMessage] = useState("");
  const [tocOpen, setTocOpen] = useState(true);
  const [tocArticlesOpen, setTocArticlesOpen] = useState(true);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(),
  );
  const [portalLawIds, setPortalLawIds] = useState<Set<string> | null>(null);

  const mainScrollRef = useRef<HTMLElement | null>(null);

  const execBrowserFind = useCallback(
    (wrapAround = true) => {
      const q = bodySearch.trim();
      if (!q) return false;
      const w = window as Window &
        Partial<{
          find: (
            text: string,
            caseSensitive?: boolean,
            backwards?: boolean,
            wrapAround?: boolean,
          ) => boolean;
        }>;
      if (typeof w.find !== "function") {
        return false;
      }
      return w.find(q, false, false, wrapAround);
    },
    [bodySearch],
  );

  const handleFindFromStart = useCallback(() => {
    if (!bodySearch.trim()) return;
    window.getSelection()?.removeAllRanges();
    mainScrollRef.current?.focus({ preventScroll: true });
    execBrowserFind(true);
  }, [bodySearch, execBrowserFind]);

  const handleFindNext = useCallback(() => {
    if (!bodySearch.trim()) return;
    mainScrollRef.current?.focus({ preventScroll: true });
    execBrowserFind(true);
  }, [bodySearch, execBrowserFind]);

  useEffect(() => {
    if (!portalCategoryFilter) {
      setPortalLawIds(null);
      return;
    }

    const loadPortalLawIds = async () => {
      try {
        const response = await fetch("/api/api-management/save", {
          method: "GET",
          cache: "no-store",
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(text);
        }
        const data = JSON.parse(text) as {
          ok: boolean;
          data?: {
            lawId?: string;
            category?: string;
            portalCategory?: string;
          }[];
        };
        if (!data.ok || !Array.isArray(data.data)) {
          setPortalLawIds(new Set());
          return;
        }

        const ids = new Set<string>();
        for (const row of data.data) {
          const lawId = normalizeLawIdForStorage(row.lawId ?? "");
          if (!lawId) continue;
          const portalCat = (row.portalCategory ?? "").trim();
          const category = (row.category ?? "").trim();
          const matchCat = portalCat || category;
          if (matchCat === portalCategoryFilter) {
            ids.add(lawId);
          }
        }
        setPortalLawIds(ids);
      } catch {
        setPortalLawIds(new Set());
      }
    };

    void loadPortalLawIds();
  }, [portalCategoryFilter]);

  useEffect(() => {
    if (portalCategoryFilter && portalLawIds === null) {
      return;
    }

    const loadDocuments = async () => {
      try {
        setIsLoadingDocuments(true);
        setMessage("");

        const response = await fetch(`${apiBase}/list`, {
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

        const nextDocuments = (data.documents ?? []).filter((doc) => {
          if (doc.doc_kind === "admrul") return !portalCategoryFilter;
          if (!portalCategoryFilter || !portalLawIds) return true;
          const id = normalizeLawIdForStorage(doc.law_id ?? "");
          return id ? portalLawIds.has(id) : false;
        });
        setDocuments(nextDocuments);

        if (nextDocuments.length > 0) {
          setSelectedKey(docSelectionKey(nextDocuments[0]));
        } else {
          setSelectedKey(null);
          if (portalCategoryFilter && portalLawIds) {
            setMessage(
              `「${portalCategoryFilter}」 분류에 해당하는 저장 법령이 없습니다. API 관리에서 portalCategory(또는 분류)를 확인하세요.`,
            );
          }
        }
      } catch (error) {
        setDocuments([]);
        setSelectedKey(null);
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
  }, [apiBase, portalCategoryFilter, portalLawIds]);

  useEffect(() => {
    const selected =
      documents.find((item) => docSelectionKey(item) === selectedKey) ?? null;
    if (!selected) {
      setArticles([]);
      setItemsByArticleId(new Map());
      setAnnexes([]);
      setRelatedAdmrul([]);
      return;
    }

    const loadArticlesAndItems = async () => {
      try {
        setIsLoadingArticles(true);
        setIsLoadingItems(true);
        setAnnexes([]);
        setRelatedAdmrul([]);

        if (selected.doc_kind === "admrul") {
          const extrasRes = await fetch(
            `${apiBase}/extras?admrulSnapshotId=${selected.id}&admSerialId=${encodeURIComponent(selected.law_id)}`,
            { method: "GET", cache: "no-store" },
          );
          const extrasText = await extrasRes.text();
          if (!extrasRes.ok) {
            throw new Error(
              `행정규칙 본문 조회 실패: ${extrasRes.status} ${extrasText}`,
            );
          }
          const extrasData = JSON.parse(extrasText) as {
            ok: boolean;
            articles?: LawArticleItem[];
            annexes?: LawAnnexItem[];
            error?: string;
          };
          if (!extrasData.ok) {
            throw new Error(extrasData.error || "행정규칙 본문 조회 실패");
          }
          setArticles(extrasData.articles ?? []);
          setItemsByArticleId(new Map());
          setAnnexes(extrasData.annexes ?? []);
          return;
        }

        const [articlesRes, itemsRes, extrasRes] = await Promise.all([
          fetch(`${apiBase}/articles?lawVersionId=${selected.id}`, {
            method: "GET",
            cache: "no-store",
          }),
          fetch(
            `${apiBase}/article-items-by-document?lawVersionId=${selected.id}`,
            { method: "GET", cache: "no-store" },
          ),
          fetch(
            `${apiBase}/extras?lawVersionId=${selected.id}&lawId=${encodeURIComponent(selected.law_id)}`,
            { method: "GET", cache: "no-store" },
          ),
        ]);

        const articlesText = await articlesRes.text();
        const itemsText = await itemsRes.text();
        const extrasText = await extrasRes.text();

        if (!articlesRes.ok) {
          throw new Error(`조문 목록 조회 실패: ${articlesRes.status} ${articlesText}`);
        }
        if (!itemsRes.ok) {
          throw new Error(`항/호/목 조회 실패: ${itemsRes.status} ${itemsText}`);
        }

        const articlesData = JSON.parse(articlesText) as {
          ok: boolean;
          articles?: LawArticleItem[];
          error?: string;
        };
        const itemsData = JSON.parse(itemsText) as {
          ok: boolean;
          items?: LawArticleSubItem[];
          error?: string;
        };
        const extrasData = extrasRes.ok
          ? (JSON.parse(extrasText) as {
              ok: boolean;
              annexes?: LawAnnexItem[];
              related?: RelatedAdmrulLink[];
            })
          : { ok: false, annexes: [], related: [] };

        if (!articlesData.ok) {
          throw new Error(articlesData.error || "조문 목록 조회 실패");
        }
        if (!itemsData.ok) {
          throw new Error(itemsData.error || "항/호/목 조회 실패");
        }

        const nextArticles = articlesData.articles ?? [];
        setArticles(nextArticles);

        const map = new Map<number, LawArticleSubItem[]>();
        for (const row of itemsData.items ?? []) {
          const aid = normalizeLawItemNumericId(row.law_article_id);
          if (aid === null) continue;
          const list = map.get(aid) ?? [];
          list.push(row);
          map.set(aid, list);
        }
        setItemsByArticleId(map);
        if (extrasData.ok) {
          setAnnexes(extrasData.annexes ?? []);
          setRelatedAdmrul(extrasData.related ?? []);
        }
      } catch (error) {
        setArticles([]);
        setItemsByArticleId(new Map());
        setAnnexes([]);
        setRelatedAdmrul([]);
        setMessage(
          error instanceof Error
            ? error.message
            : "조문·항호목 조회 중 오류가 발생했습니다.",
        );
      } finally {
        setIsLoadingArticles(false);
        setIsLoadingItems(false);
      }
    };

    loadArticlesAndItems();
  }, [selectedKey, apiBase, documents]);

  const filteredDocuments = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return documents;

    return documents.filter((item) => {
      return (
        item.law_name_kr?.toLowerCase().includes(q) ||
        item.law_name_short?.toLowerCase().includes(q) ||
        item.law_id?.toLowerCase().includes(q) ||
        formatLawIdForDisplay(item.law_id).toLowerCase().includes(q) ||
        item.ministry_name?.toLowerCase().includes(q) ||
        (item.doc_kind === "admrul" && "행정규칙".includes(q))
      );
    });
  }, [documents, keyword]);

  const selectedDocument =
    documents.find((item) => docSelectionKey(item) === selectedKey) ?? null;

  const lawTocModel = useMemo(
    () => buildLawTocModelUnified(selectedDocument?.raw_json, articles),
    [selectedDocument?.raw_json, articles],
  );

  const articleIdsInBodySearch = useMemo(() => {
    const q = bodySearch.trim().toLowerCase();
    if (!q) return null as Set<number> | null;

    const ids = new Set<number>();
    for (const a of articles) {
      const aid = normalizeLawItemNumericId(a.id);
      if (aid === null) continue;
      const text =
        `${a.article_no} ${a.article_title} ${a.article_content}`.toLowerCase();
      const items = lawArticleItemsForArticle(itemsByArticleId, aid);
      const itemText = items
        .map(
          (i) =>
            `${i.item_level ?? ""} ${i.item_no ?? ""} ${i.item_content ?? ""}`,
        )
        .join(" ")
        .toLowerCase();
      if (text.includes(q) || itemText.includes(q)) {
        ids.add(aid);
      }
    }
    return ids;
  }, [articles, itemsByArticleId, bodySearch]);

  /** 조문명 검색이 조문 단위 본문만 보지 않도록 항·호·목 텍스트를 묶어 전달 */
  const articleItemSearchText = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of articles) {
      const aid = normalizeLawItemNumericId(a.id);
      if (aid === null) continue;
      const items = lawArticleItemsForArticle(itemsByArticleId, aid);
      const blob = items
        .map(
          (i) =>
            `${i.item_level ?? ""} ${i.item_no ?? ""} ${i.item_content ?? ""}`,
        )
        .join(" ");
      m.set(aid, blob);
    }
    return m;
  }, [articles, itemsByArticleId]);

  const filteredTocModel = useMemo(
    () =>
      filterLawTocModel(
        lawTocModel,
        articleNavKeyword,
        Boolean(bodySearch.trim()),
        articleIdsInBodySearch,
        articleItemSearchText,
      ),
    [
      lawTocModel,
      articleNavKeyword,
      bodySearch,
      articleIdsInBodySearch,
      articleItemSearchText,
    ],
  );

  useEffect(() => {
    setExpandedChapters(new Set(collectChapterIds(lawTocModel)));
    setExpandedSections(new Set(collectSectionIds(lawTocModel)));
    setTocArticlesOpen(true);
    setTocOpen(true);
  }, [lawTocModel, selectedKey]);

  const scrollToArticle = (articleId: number) => {
    const el = document.getElementById(`article-${articleId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleChapter = (id: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tocEmpty =
    filteredTocModel.chapters.length === 0 &&
    filteredTocModel.looseArticles.length === 0;

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-slate-100 ${
        compactChrome ? "p-0" : "p-2 sm:p-3"
      }`}
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1920px] flex-1 flex-col gap-2 overflow-hidden">
        {message ? (
          <div className="shrink-0 rounded-lg border border-amber-200/90 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-sm">
            {message}
          </div>
        ) : null}

        <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-md lg:flex-row">
          <aside
            className="flex max-h-[min(42vh,22rem)] min-h-0 shrink-0 flex-col overflow-hidden border-b border-slate-200 bg-slate-50/95 lg:h-full lg:max-h-none lg:w-[min(100%,20rem)] xl:w-[min(100%,22rem)] lg:border-b-0 lg:border-r"
            aria-label="법령 목록"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                법령 목록
              </h2>
              <span className="tabular-nums text-xs font-medium text-slate-400">
                {filteredDocuments.length}건
              </span>
            </div>
            {GENERAL_LAW_SHOW_LAW_LIST_SEARCH ? (
              <div className="border-b border-slate-200/80 px-3 py-2">
                <input
                  type="search"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="법령명으로 검색"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
                  aria-label="법령명 검색"
                />
              </div>
            ) : null}
            <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              {isLoadingDocuments ? (
                <p className="px-3 py-6 text-center text-sm text-slate-500">
                  불러오는 중…
                </p>
              ) : filteredDocuments.length === 0 ? (
                <div className="space-y-3 px-3 py-6 text-sm leading-relaxed text-slate-600">
                  {keyword.trim() ? (
                    <p className="text-center font-medium text-slate-700">
                      「{keyword.trim()}」에 맞는 법령이 없습니다.
                    </p>
                  ) : (
                    <>
                      <p className="text-center font-medium text-slate-700">
                        저장된 법령 데이터가 없습니다.
                      </p>
                      <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-600">
                        <li>
                          <Link
                            href="/api-call"
                            className="font-medium text-sky-700 underline hover:text-sky-900"
                          >
                            API 호출 → 법령 본문
                          </Link>
                          에서 법령을 조회·저장
                        </li>
                        <li>
                          또는{" "}
                          <Link
                            href="/law-detail-json"
                            className="font-medium text-sky-700 underline hover:text-sky-900"
                          >
                            저장 법령·조문 JSON
                          </Link>
                          으로 JSON 저장
                        </li>
                        <li>이 페이지를 새로고침</li>
                      </ol>
                    </>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredDocuments.map((item) => {
                    const key = docSelectionKey(item);
                    const sel = key === selectedKey;
                    const isAdmrul = item.doc_kind === "admrul";
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => setSelectedKey(key)}
                          className={`w-full px-3.5 py-2.5 text-left transition ${
                            sel
                              ? "border-l-[3px] border-l-sky-600 bg-sky-50/90 text-slate-900"
                              : "border-l-[3px] border-l-transparent text-slate-700 hover:bg-white"
                          }`}
                        >
                          <span className="block text-sm font-medium leading-snug">
                            {item.law_name_kr}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {isAdmrul ? "행정규칙" : "법령"}{" "}
                            {formatLawIdForDisplay(item.law_id)}
                            {item.ministry_name
                              ? ` · ${item.ministry_name}`
                              : ""}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
            {!selectedDocument ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-sm leading-relaxed text-slate-500">
                왼쪽 목록에서 법령을 선택하세요.
              </div>
            ) : isLoadingArticles && articles.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                본문을 불러오는 중…
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {selectedDocument.law_name_kr}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {selectedDocument.doc_kind === "admrul"
                        ? "행정규칙"
                        : "법령"}{" "}
                      {formatLawIdForDisplay(selectedDocument.law_id)} ·
                      시행 {formatLawDate(selectedDocument.enforcement_date)}
                      {selectedDocument.promulgation_no
                        ? ` · ${selectedDocument.promulgation_no}호 공포`
                        : ""}
                    </p>
                    <a
                      href={lawGoKrDetailUrl(selectedDocument)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs text-sky-700 hover:underline"
                    >
                      국가법령정보센터에서 보기
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
                    <span className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow">
                      본문
                    </span>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                  <aside className="flex max-h-[min(38vh,20rem)] min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-slate-200 bg-slate-50 lg:max-h-none lg:h-full lg:w-[min(100%,24rem)] lg:max-w-[26rem] lg:border-b-0 lg:border-r">
                    {GENERAL_LAW_SHOW_ARTICLE_NAV_SEARCH ? (
                      <div className="border-b border-slate-200 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <label
                            htmlFor="article-nav-search"
                            className="text-xs font-medium text-slate-700"
                          >
                            조문명검색
                          </label>
                        </div>
                        <form
                          className="flex gap-1.5"
                          onSubmit={(e) => {
                            e.preventDefault();
                          }}
                        >
                          <input
                            id="article-nav-search"
                            type="search"
                            value={articleNavKeyword}
                            onChange={(e) =>
                              setArticleNavKeyword(e.target.value)
                            }
                            placeholder="조문번호·조문제목·내용"
                            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-2 text-sm outline-none focus:border-sky-500"
                          />
                          <button
                            type="submit"
                            title="검색"
                            aria-label="조문명 검색"
                            className="flex min-h-0 shrink-0 items-center justify-center rounded-lg bg-[#1e2f4f] px-3 text-white hover:bg-[#162438]"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden
                            >
                              <circle cx="11" cy="11" r="4" />
                              <path d="m21 21-3.5-3.5" />
                            </svg>
                          </button>
                        </form>
                      </div>
                    ) : null}
                    <nav
                      className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3 text-sm"
                      aria-label="법령 목차"
                    >
                  <div className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setTocOpen((o) => !o)}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left hover:bg-slate-50"
                    >
                      <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded border border-slate-400 bg-white text-xs font-bold text-slate-600">
                        {tocOpen ? "−" : "+"}
                      </span>
                      <span className="flex-1 text-[15px] font-bold leading-tight text-slate-900">
                        {selectedDocument.law_name_kr}
                      </span>
                      <span className="shrink-0 text-[11px] font-medium text-slate-500">
                        {tocOpen ? "접기" : "펼치기"}
                      </span>
                    </button>
                  </div>

                  {tocOpen ? (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
                      <button
                        type="button"
                        onClick={() => setTocArticlesOpen((o) => !o)}
                        className="flex w-full items-center gap-2 rounded-md bg-slate-100 px-2 py-2 text-left shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-100/90"
                      >
                        <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded border border-slate-400 bg-white text-xs font-bold text-slate-600">
                          {tocArticlesOpen ? "−" : "+"}
                        </span>
                        <span className="text-sm font-bold tracking-tight text-slate-900">
                          {selectedDocument.doc_kind === "admrul"
                            ? "본문"
                            : "조문"}
                        </span>
                      </button>

                      {tocArticlesOpen ? (
                        <div className="relative mt-2 border-l-2 border-slate-300 bg-white px-1 py-2 pl-3 shadow-inner">
                          {isLoadingArticles ? (
                            <p className="py-2 text-slate-500">
                              조문 불러오는 중...
                            </p>
                          ) : tocEmpty ? (
                            <p className="py-2 text-slate-500">
                              {bodySearch.trim()
                                ? "본문 검색에 맞는 조문이 없습니다."
                                : articleNavKeyword.trim()
                                  ? "조건에 맞는 조문이 없습니다."
                                  : "조문이 없습니다."}
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {filteredTocModel.looseArticles.map((article) => (
                                <TocArticleButton
                                  key={`toc-loose-${article.id}`}
                                  article={article}
                                  onPick={scrollToArticle}
                                  indentClass="ml-0 border-l border-slate-200 pl-3"
                                  admrulMode={
                                    selectedDocument.doc_kind === "admrul"
                                  }
                                />
                              ))}
                              {filteredTocModel.chapters.map((ch) => {
                                const chExpanded = expandedChapters.has(ch.id);
                                return (
                                  <div key={`toc-${ch.id}`} className="mt-2 first:mt-0">
                                    <div className="overflow-hidden rounded-md border border-rose-200 bg-rose-50/95 shadow-sm ring-1 ring-rose-100/80">
                                      <div className="flex items-start gap-1.5 px-2 py-1.5">
                                        <button
                                          type="button"
                                          onClick={() => toggleChapter(ch.id)}
                                          className="mt-0.5 w-6 shrink-0 text-center text-[11px] font-medium text-rose-800/80 hover:text-rose-950"
                                          aria-expanded={chExpanded}
                                          aria-label={
                                            chExpanded ? "장 접기" : "장 펼치기"
                                          }
                                        >
                                          {chExpanded ? "▼" : "▶"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            scrollToArticle(ch.article.id)
                                          }
                                          className="min-w-0 flex-1 text-left text-[13px] font-bold leading-snug text-rose-950 hover:underline"
                                        >
                                          {ch.title}
                                        </button>
                                        <span
                                          className="shrink-0 pt-0.5 text-[10px] text-rose-600/80"
                                          aria-hidden
                                        >
                                          {chExpanded ? "∧" : "∨"}
                                        </span>
                                      </div>
                                    </div>
                                    {chExpanded ? (
                                      <div className="ml-2 mt-1.5 space-y-2 border-l border-dashed border-slate-300 pl-3">
                                        {ch.sections.map((sec) => (
                                          <SectionNavBlock
                                            key={`toc-${sec.id}`}
                                            sec={sec}
                                            expanded={expandedSections.has(
                                              sec.id,
                                            )}
                                            onToggle={() =>
                                              toggleSection(sec.id)
                                            }
                                            onScrollArticle={scrollToArticle}
                                          />
                                        ))}
                                        {ch.looseArticles.map((article) => (
                                          <TocArticleButton
                                            key={`toc-ch-art-${ch.id}-${article.id}`}
                                            article={article}
                                            onPick={scrollToArticle}
                                            indentClass="border-l border-amber-200/80 pl-3"
                                          />
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedDocument.doc_kind !== "admrul" &&
                  relatedAdmrul.length > 0 ? (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                      <p className="px-1 text-xs font-bold text-slate-700">
                        관련 행정규칙 ({relatedAdmrul.length})
                      </p>
                      <ul className="mt-1 space-y-1">
                        {relatedAdmrul.map((r, index) => (
                          <li
                            key={`rel-adm-${r.adm_serial_id || r.selection_key || index}`}
                          >
                            <button
                              type="button"
                              disabled={!r.selection_key}
                              onClick={() => {
                                if (r.selection_key) setSelectedKey(r.selection_key);
                              }}
                              className="w-full rounded px-2 py-1.5 text-left text-[13px] text-sky-800 hover:bg-sky-50 disabled:cursor-default disabled:text-slate-500"
                            >
                              {r.rule_name_kr || r.adm_serial_id}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {annexes.length > 0 ? (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                      <p className="px-1 text-xs font-bold text-slate-700">
                        별표·첨부 ({annexes.length})
                      </p>
                      <ul className="mt-1 space-y-1">
                        {annexes.map((an, index) => (
                          <li
                            key={`annex-${an.id}-${index}`}
                            className="px-2 py-1.5 text-[13px] text-slate-700"
                          >
                            <span>
                              {[an.annex_type, an.annex_no, an.annex_title]
                                .filter(Boolean)
                                .join(" ")}
                            </span>
                            {an.file_link ? (
                              <a
                                href={
                                  an.file_link.startsWith("http")
                                    ? an.file_link
                                    : `https://www.law.go.kr${an.file_link}`
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="ml-2 text-sky-700 hover:underline"
                              >
                                파일
                              </a>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </nav>
              </aside>

              <main
                ref={mainScrollRef}
                tabIndex={-1}
                className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-white outline-none [scrollbar-gutter:stable]"
              >
                <div className="sticky top-0 z-10 border-b border-sky-100 bg-sky-50/95 backdrop-blur-sm">
                  <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-2.5">
                    <div className="flex w-full max-w-md min-w-[200px] overflow-hidden rounded border border-slate-300 bg-white shadow-sm">
                      <input
                        type="search"
                        value={bodySearch}
                        onChange={(e) => setBodySearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleFindNext();
                          }
                        }}
                        placeholder="본문검색"
                        className="min-w-0 flex-1 border-0 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={handleFindNext}
                        className="flex shrink-0 items-center justify-center border-l border-slate-300 bg-slate-100 px-3 text-sky-800 transition hover:bg-slate-200"
                        aria-label="본문에서 다음 찾기"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <circle cx="11" cy="11" r="4" />
                          <path d="m21 21-3.5-3.5" />
                        </svg>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleFindFromStart}
                      className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      찾기
                    </button>
                  </div>
                </div>

                <div className="px-6 py-8 print:px-4">
                  <header className="border-b border-slate-200 pb-6 text-center">
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
                      {selectedDocument.law_name_kr}
                    </h2>
                    <p className="mt-3 text-sm text-slate-600">
                      [시행 {formatLawDate(selectedDocument.enforcement_date)}]{" "}
                      [법률 제{selectedDocument.promulgation_no || "—"}호,{" "}
                      {formatLawDate(selectedDocument.promulgation_date)},{" "}
                      {selectedDocument.revision_type || "—"}]
                    </p>
                    <p className="mt-2 text-right text-sm text-slate-600">
                      {selectedDocument.ministry_name || "—"}
                      {selectedDocument.contact_phone
                        ? `, ${selectedDocument.contact_phone}`
                        : ""}
                    </p>
                    <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-left text-xs leading-relaxed text-amber-950">
                      이 화면은 {storageHint}의 조문 구조(JSON)를 반영합니다.
                      국가법령정보센터 웹의 현행 표시·시행일· 개정 시점에 따라
                      일부 조문(삭제·개정 직후 등)은 공식 사이트와 다르게 보일 수
                      있습니다. 최신 본문은 국가법령정보센터에서 확인하세요.
                    </p>
                  </header>

                  <div className="mt-8 space-y-6">
                    {isLoadingArticles ? (
                      <p className="text-center text-slate-500">본문을 불러오는 중...</p>
                    ) : articles.length === 0 ? (
                      <p className="text-center text-slate-500">
                        저장된 조문이 없습니다.
                      </p>
                    ) : bodySearch.trim() &&
                      articleIdsInBodySearch &&
                      articleIdsInBodySearch.size === 0 ? (
                      <p className="text-center text-slate-500">
                        본문 검색 결과가 없습니다.
                      </p>
                    ) : (
                      articles.map((article) => {
                        const aid = normalizeLawItemNumericId(article.id);
                        const items = lawArticleItemsForArticle(
                          itemsByArticleId,
                          article.id,
                        );
                        const rows = flattenLawArticleItemTree(items);
                        const inSearch =
                          articleIdsInBodySearch === null ||
                          (aid !== null &&
                            articleIdsInBodySearch.has(aid));
                        if (bodySearch.trim() && !inSearch) {
                          return null;
                        }
                        return (
                          <article
                            key={`body-art-${article.id}`}
                            id={`article-${article.id}`}
                            className="scroll-mt-4"
                          >
                            <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-sky-50 to-white px-4 py-2.5">
                                <h3 className="text-base font-semibold text-sky-900 md:text-lg">
                                  {selectedDocument.doc_kind === "admrul"
                                    ? [
                                        article.article_no,
                                        article.article_title
                                          ? `(${article.article_title})`
                                          : "",
                                      ]
                                        .filter(Boolean)
                                        .join(" ") || "본문"
                                    : `제${article.article_no || "—"}조${
                                        article.article_title
                                          ? `(${article.article_title})`
                                          : ""
                                      }`}
                                </h3>
                                <div className="flex gap-1 text-xs text-slate-500">
                                  <span>연관</span>
                                  <span>개정</span>
                                  <span>비교</span>
                                </div>
                              </div>
                              <div className="bg-white px-4 py-4 text-sm leading-relaxed text-slate-800">
                                {article.article_content?.trim() ? (
                                  <div
                                    className={
                                      isDeletedLawParagraph(
                                        article.article_content,
                                      )
                                        ? "whitespace-pre-wrap rounded border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2 text-slate-700"
                                        : "whitespace-pre-wrap"
                                    }
                                  >
                                    {isDeletedLawParagraph(
                                      article.article_content,
                                    ) ? (
                                      <>
                                        <span className="mb-1 inline-block rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800">
                                          삭제된 조문
                                        </span>
                                        <br />
                                        {article.article_content}
                                      </>
                                    ) : (
                                      article.article_content
                                    )}
                                  </div>
                                ) : rows.length === 0 ? (
                                  <p className="text-slate-400">—</p>
                                ) : null}
                                {rows.length > 0 ? (
                                  <div className="mt-4 border-t border-slate-100 pt-4">
                                    <ItemTreeRows rows={rows} />
                                  </div>
                                ) : null}
                                {isLoadingItems && rows.length === 0 ? (
                                  <p className="mt-2 text-xs text-slate-400">
                                    항·호·목 로딩 중...
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              </main>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TocArticleButton({
  article,
  onPick,
  indentClass,
  admrulMode = false,
}: {
  article: TocArticle | LawArticleItem;
  onPick: (id: number) => void;
  indentClass: string;
  admrulMode?: boolean;
}) {
  return (
    <div className={indentClass}>
      <button
        type="button"
        onClick={() => onPick(article.id)}
        className="group flex w-full items-start gap-2 rounded py-1.5 pl-0.5 pr-1 text-left text-[13px] leading-snug text-slate-700 hover:bg-sky-50"
      >
        <span
          className="mt-1 shrink-0 text-[9px] text-slate-400 group-hover:text-sky-600"
          aria-hidden
        >
          ▶
        </span>
        <span className="min-w-0 flex-1 break-words">
          {admrulMode
            ? [article.article_no, article.article_title]
                .filter(Boolean)
                .join(" ") || "본문"
            : articleNavLabel(article)}
        </span>
      </button>
    </div>
  );
}

function SectionNavBlock({
  sec,
  expanded,
  onToggle,
  onScrollArticle,
}: {
  sec: TocSectionNode;
  expanded: boolean;
  onToggle: () => void;
  onScrollArticle: (id: number) => void;
}) {
  return (
    <div className="pb-1">
      <div
        className={`flex items-start gap-1 rounded-md border-l-[3px] pl-2 ${
          expanded
            ? "border-emerald-600 bg-emerald-50/50"
            : "border-slate-300 bg-slate-50/60"
        }`}
      >
        <button
          type="button"
          onClick={onToggle}
          className={`mt-1 w-5 shrink-0 text-center text-[11px] hover:opacity-80 ${
            expanded ? "text-emerald-800" : "text-slate-500"
          }`}
          aria-expanded={expanded}
          aria-label={expanded ? "절 접기" : "절 펼치기"}
        >
          {expanded ? "▼" : "▶"}
        </button>
        <button
          type="button"
          onClick={() => onScrollArticle(sec.article.id)}
          className={`min-w-0 flex-1 py-1.5 text-left text-[13px] font-semibold leading-snug hover:underline ${
            expanded ? "text-emerald-800" : "text-slate-500"
          }`}
        >
          {sec.title}
        </button>
        <span
          className={`shrink-0 px-1 pt-1 text-[10px] ${
            expanded ? "text-emerald-700/90" : "text-slate-400"
          }`}
          aria-hidden
        >
          {expanded ? "∧" : "∨"}
        </span>
      </div>
      {expanded ? (
        <ul className="ml-1 mt-1 space-y-0.5 border-l border-emerald-200/70 pl-3">
          {sec.articles.map((article) => (
            <li key={`toc-sec-art-${sec.id}-${article.id}`} className="pl-0">
              <button
                type="button"
                onClick={() => onScrollArticle(article.id)}
                className="group flex w-full items-start gap-2 rounded py-1 pl-0.5 pr-1 text-left text-[13px] leading-snug text-slate-700 hover:bg-sky-50"
              >
                <span
                  className="mt-1 shrink-0 text-[9px] text-slate-400 group-hover:text-sky-600"
                  aria-hidden
                >
                  ▶
                </span>
                <span className="min-w-0 flex-1 break-words">
                  {articleLabelUnderSection(article)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** 제N절 아래 조문: 포털처럼 「1조」「2조(목적)」 형식(앞에 「제」 없음) */
function articleLabelUnderSection(a: TocArticle | LawArticleItem): string {
  const t = (a.article_title ?? "").trim();
  if (isChapterTitle(t) || isSectionTitle(t)) {
    return articleNavLabel(a);
  }
  const no = String(a.article_no ?? "").trim() || "—";
  if (!t) {
    return `${no}조`;
  }
  return `${no}조(${t})`;
}

function articleNavLabel(a: TocArticle | LawArticleItem): string {
  const t = (a.article_title ?? "").trim();
  if (isChapterTitle(t) || isSectionTitle(t)) {
    return t;
  }
  const no = a.article_no || "—";
  if (!t) {
    return `제${no}조`;
  }
  return `제${no}조(${t})`;
}

function formatLawDate(value: string) {
  const d = value?.trim() ?? "";
  if (d.length === 8 && /^\d{8}$/.test(d)) {
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }
  return d || "—";
}

function ItemTreeRows({
  rows,
}: {
  rows: Array<LawArticleSubItem & { depth: number }>;
}) {
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((row, index) => {
        const deleted = isDeletedLawParagraph(row.item_content || "");
        return (
          <li
            key={`item-${row.id}-${index}-${row.item_no ?? ""}`}
            className={`leading-relaxed ${deleted ? "rounded-md border border-dashed border-slate-300 bg-slate-50/90 px-2 py-1.5" : ""}`}
            style={{ paddingLeft: `${row.depth * 16}px` }}
          >
            <span
              className={`font-medium ${deleted ? "text-slate-600" : "text-slate-700"}`}
            >
              {row.item_level ? `${row.item_level} ` : ""}
              {row.item_no ? `${row.item_no} ` : ""}
            </span>
            {deleted ? (
              <span className="ml-2 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-800">
                삭제
              </span>
            ) : null}
            <span
              className={`block whitespace-pre-wrap pl-0 pt-0.5 md:inline md:pl-1 ${
                deleted ? "text-slate-600" : "text-slate-800"
              }`}
            >
              {row.item_content || "—"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
