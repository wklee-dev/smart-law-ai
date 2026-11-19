"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminRulesArticleContent } from "@/app/components/admin-rules-article-content";
import {
  isLawGoDetailId,
  lawGoKrUrlFromCatalogName,
} from "@/app/lib/clip-general-law-catalog";
import type { GeneralLawPortalCategorySlug } from "@/app/shared/general-law-portal-categories";

type RawRuleDocType =
  | "법률"
  | "시행령"
  | "시행규칙"
  | "고시"
  | "훈령"
  | "공고"
  | "예규"
  | "기타";

type RawRuleTreeNode = {
  id: string;
  lawId: string;
  lawName: string;
  docType: RawRuleDocType;
  lawType: string;
  enforcementDate: string | null;
  promulgationDate: string | null;
  promulgationNumber: string | null;
  department: string | null;
  virtual?: boolean;
  children: RawRuleTreeNode[];
};

type RawRuleArticle = {
  id: string;
  articleNo: string;
  articleTitle: string;
  content: string;
};

type RawRuleDetail = {
  lawId: string;
  lawName: string;
  docType: RawRuleDocType;
  lawType: string;
  promulgationDate: string | null;
  promulgationNumber: string | null;
  department: string | null;
  enforcementDate: string | null;
  gubun: string | null;
  articles: RawRuleArticle[];
  addendums: { id: number; content: string }[];
  annexes: {
    id: number;
    annexNumber: string | null;
    annexTitle: string | null;
    annexFileLink: string | null;
  }[];
};

const CLICKABLE_TYPES = new Set<RawRuleDocType>([
  "법률",
  "시행령",
  "시행규칙",
  "고시",
  "훈령",
  "공고",
  "예규",
  "기타",
]);

const DOC_TYPE_BADGE: Record<
  RawRuleDocType,
  { label: string; className: string }
> = {
  법률: {
    label: "법률",
    className: "bg-sky-600 text-white",
  },
  시행령: {
    label: "시행령",
    className: "bg-slate-600 text-white",
  },
  시행규칙: {
    label: "시행규칙",
    className: "bg-slate-400 text-white",
  },
  고시: {
    label: "고시",
    className: "bg-emerald-600 text-white",
  },
  훈령: {
    label: "훈령",
    className: "bg-amber-500 text-white",
  },
  공고: {
    label: "공고",
    className: "bg-violet-600 text-white",
  },
  예규: {
    label: "예규",
    className: "bg-blue-700 text-white",
  },
  기타: {
    label: "기타",
    className: "bg-slate-500 text-white",
  },
};

function formatDate(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

function nodeMeta(node: RawRuleTreeNode): string {
  const parts: string[] = [];
  if (node.enforcementDate) {
    parts.push(`[시행 ${formatDate(node.enforcementDate)}]`);
  }
  const prom: string[] = [];
  if (node.promulgationNumber) prom.push(node.promulgationNumber);
  if (node.promulgationDate) prom.push(formatDate(node.promulgationDate));
  if (prom.length) parts.push(`[${prom.join(", ")}]`);
  return parts.join(" ");
}

function collectNodeIds(nodes: RawRuleTreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: RawRuleTreeNode[]) => {
    for (const n of list) {
      ids.push(n.id);
      if (n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

function filterTree(
  nodes: RawRuleTreeNode[],
  keyword: string,
): RawRuleTreeNode[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return nodes;

  const walk = (node: RawRuleTreeNode): RawRuleTreeNode | null => {
    const selfMatch =
      node.lawName.toLowerCase().includes(q) ||
      node.docType.toLowerCase().includes(q);
    const children = node.children
      .map(walk)
      .filter((c): c is RawRuleTreeNode => c !== null);
    if (selfMatch || children.length) {
      return { ...node, children };
    }
    return null;
  };

  return nodes.map(walk).filter((n): n is RawRuleTreeNode => n !== null);
}

function DocTypeBadge({ docType }: { docType: RawRuleDocType }) {
  const badge = DOC_TYPE_BADGE[docType] ?? DOC_TYPE_BADGE.기타;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

function TreeNodeRow({
  node,
  depth,
  expanded,
  onToggle,
  onSelect,
  selectedLawId,
}: {
  node: RawRuleTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: RawRuleTreeNode) => void;
  selectedLawId: string | null;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const clickable =
    !node.virtual && CLICKABLE_TYPES.has(node.docType) && !!node.lawId;
  const meta = nodeMeta(node);
  const selected = node.lawId && node.lawId === selectedLawId;

  return (
    <div className="relative">
      <div
        className="flex items-start gap-1 py-0.5"
        style={{ paddingLeft: `${depth * 18}px` }}
      >
        {depth > 0 ? (
          <span
            className="pointer-events-none absolute bottom-0 top-0 border-l border-dotted border-slate-300"
            style={{ left: `${depth * 18 - 9}px` }}
            aria-hidden
          />
        ) : null}
        <button
          type="button"
          onClick={() => hasChildren && onToggle(node.id)}
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
            hasChildren
              ? "border-slate-400 bg-white text-slate-600 hover:bg-slate-50"
              : "border-transparent text-transparent"
          }`}
          aria-label={isOpen ? "접기" : "펼치기"}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (isOpen ? "−" : "+") : "·"}
        </button>
        <div className="min-w-0 flex-1">
          {clickable ? (
            <button
              type="button"
              onClick={() => onSelect(node)}
              className={`group w-full text-left text-sm leading-snug ${
                selected
                  ? "font-semibold text-indigo-800"
                  : "text-slate-800 hover:text-indigo-700"
              }`}
            >
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <DocTypeBadge docType={node.docType} />
                <span>
                  {node.lawName}
                  {meta ? (
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      {meta}
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          ) : (
            <div className="text-sm leading-snug text-slate-700">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <DocTypeBadge docType={node.docType} />
                <span className="font-medium">
                  {node.lawName}
                  {meta ? (
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      {meta}
                    </span>
                  ) : null}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
      {hasChildren && isOpen
        ? node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedLawId={selectedLawId}
            />
          ))
        : null}
    </div>
  );
}

export function GeneralLawPortalRawView({
  categorySlug,
  categoryLabel,
}: {
  categorySlug: GeneralLawPortalCategorySlug;
  categoryLabel: string;
}) {
  const [tree, setTree] = useState<RawRuleTreeNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  const [treeError, setTreeError] = useState("");
  const [listKeyword, setListKeyword] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedLawId, setSelectedLawId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RawRuleDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [articleNavKeyword, setArticleNavKeyword] = useState("");
  const [bodySearch, setBodySearch] = useState("");
  const [tocOpen, setTocOpen] = useState(true);
  const [tocArticlesOpen, setTocArticlesOpen] = useState(true);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const filteredTree = useMemo(
    () => filterTree(tree, listKeyword),
    [tree, listKeyword],
  );

  const filteredArticles = useMemo(() => {
    if (!detail) return [];
    const q = articleNavKeyword.trim().toLowerCase();
    const bq = bodySearch.trim().toLowerCase();
    return detail.articles.filter((a) => {
      const navOk =
        !q ||
        a.articleTitle.toLowerCase().includes(q) ||
        a.articleNo.toLowerCase().includes(q);
      const bodyOk = !bq || a.content.toLowerCase().includes(bq);
      return navOk && bodyOk;
    });
  }, [detail, articleNavKeyword, bodySearch]);

  const loadTree = useCallback(async () => {
    setLoadingTree(true);
    setTreeError("");
    try {
      const q = `category=${encodeURIComponent(categorySlug)}`;
      const res = await fetch(`/api/customs-law-portal/raw-rule/tree?${q}`);
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `트리 조회 실패 (${res.status})`);
      }
      setTree(data.tree ?? []);
      const withChildren = (data.tree ?? [])
        .filter((n: RawRuleTreeNode) => n.children?.length)
        .map((n: RawRuleTreeNode) => n.id);
      setExpanded(new Set(withChildren));
    } catch (e) {
      setTree([]);
      setTreeError(
        e instanceof Error ? e.message : "법령 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoadingTree(false);
    }
  }, [categorySlug]);

  const loadDetail = useCallback(async (lawId: string) => {
    setLoadingDetail(true);
    setDetailError("");
    setDetail(null);
    try {
      const res = await fetch(
        `/api/customs-law-portal/raw-rule/detail?lawId=${encodeURIComponent(lawId)}`,
      );
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `본문 조회 실패 (${res.status})`);
      }
      setDetail(data.detail);
    } catch (e) {
      setDetailError(
        e instanceof Error ? e.message : "법령 본문을 불러오지 못했습니다.",
      );
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    setSelectedLawId(null);
    setDetail(null);
    void loadTree();
  }, [loadTree]);

  const handleSelectNode = (node: RawRuleTreeNode) => {
    if (!node.lawId || node.virtual) return;
    if (isLawGoDetailId(node.lawId)) {
      const url = lawGoKrUrlFromCatalogName(node.lawName);
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setSelectedLawId(node.lawId);
    void loadDetail(node.lawId);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set(collectNodeIds(tree)));
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  const scrollToArticle = (articleId: string) => {
    globalThis.document
      .getElementById(`raw-article-${articleId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const detailMeta = useMemo(() => {
    if (!detail) return "";
    const parts: string[] = [];
    if (detail.enforcementDate) {
      parts.push(`[시행 ${formatDate(detail.enforcementDate)}]`);
    }
    const prom: string[] = [];
    if (detail.promulgationNumber) prom.push(detail.promulgationNumber);
    if (detail.promulgationDate) prom.push(formatDate(detail.promulgationDate));
    if (prom.length) parts.push(`[${prom.join(", ")}]`);
    return parts.join(" ");
  }, [detail]);

  if (categorySlug === "all") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        분류(관세관련 등)를 선택하면 법령 트리 목록이 표시됩니다.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {!selectedLawId ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
            <label className="sr-only" htmlFor="law-list-search">
              법령목록검색
            </label>
            <div className="flex min-w-[12rem] flex-1 items-center gap-2 sm:max-w-md">
              <span className="shrink-0 text-sm font-medium text-slate-700">
                법령목록검색
              </span>
              <input
                id="law-list-search"
                type="search"
                value={listKeyword}
                onChange={(e) => setListKeyword(e.target.value)}
                placeholder="법령명 검색"
                className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="button"
              onClick={expandAll}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              전체열기
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              전체닫기
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {loadingTree ? (
              <p className="py-8 text-center text-sm text-slate-500">
                법령 목록을 불러오는 중…
              </p>
            ) : treeError ? (
              <p className="py-8 text-center text-sm text-red-600">{treeError}</p>
            ) : filteredTree.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                {listKeyword.trim()
                  ? "검색 조건에 맞는 법령이 없습니다."
                  : "표시할 법령이 없습니다."}
              </p>
            ) : (
              <div className="space-y-1">
                {filteredTree.map((node) => (
                  <TreeNodeRow
                    key={node.id}
                    node={node}
                    depth={0}
                    expanded={expanded}
                    onToggle={toggleExpand}
                    onSelect={handleSelectNode}
                    selectedLawId={selectedLawId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <aside className="flex max-h-[min(40vh,22rem)] min-h-0 w-full shrink-0 flex-col overflow-hidden border-b border-slate-200 bg-slate-50 lg:max-h-none lg:h-full lg:w-[min(100%,22rem)] lg:max-w-[24rem] lg:border-b-0 lg:border-r">
            <div className="shrink-0 border-b border-slate-200 bg-indigo-50 px-3 py-2.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedLawId(null);
                  setDetail(null);
                }}
                className="mb-2 text-xs font-medium text-indigo-700 hover:underline"
              >
                ← 법령 목록
              </button>
              <p className="text-sm font-bold text-slate-900">
                {detail?.lawName ?? "…"}
              </p>
            </div>
            <div className="border-b border-slate-200 p-3">
              <label
                htmlFor="article-nav-search"
                className="mb-1.5 block text-xs font-medium text-slate-700"
              >
                조문명검색
              </label>
              <input
                id="article-nav-search"
                type="search"
                value={articleNavKeyword}
                onChange={(e) => setArticleNavKeyword(e.target.value)}
                placeholder="조문번호·제목"
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <nav
              className="min-h-0 flex-1 overflow-y-auto p-3 text-sm"
              aria-label="조문 목차"
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
                  <span className="flex-1 text-[15px] font-bold text-slate-900">
                    {detail?.lawName ?? ""}
                  </span>
                </button>
              </div>
              {tocOpen ? (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2">
                  <button
                    type="button"
                    onClick={() => setTocArticlesOpen((o) => !o)}
                    className="flex w-full items-center gap-2 rounded-md bg-slate-100 px-2 py-2 text-left shadow-sm ring-1 ring-slate-200/80"
                  >
                    <span className="inline-flex h-6 min-w-[1.5rem] shrink-0 items-center justify-center rounded border border-slate-400 bg-white text-xs font-bold text-slate-600">
                      {tocArticlesOpen ? "−" : "+"}
                    </span>
                    <span className="text-sm font-bold text-slate-900">조문</span>
                  </button>
                  {tocArticlesOpen ? (
                    <div className="relative mt-2 border-l-2 border-slate-300 bg-white py-2 pl-3">
                      {loadingDetail ? (
                        <p className="py-2 text-slate-500">조문 불러오는 중…</p>
                      ) : filteredArticles.length === 0 ? (
                        <p className="py-2 text-slate-500">조문이 없습니다.</p>
                      ) : (
                        <ul className="space-y-0.5">
                          {filteredArticles.map((article) => (
                            <li key={article.id}>
                              <button
                                type="button"
                                onClick={() => scrollToArticle(article.id)}
                                className="w-full rounded px-1 py-1 text-left text-[13px] leading-snug text-slate-800 hover:bg-indigo-50 hover:text-indigo-800"
                              >
                                {article.articleTitle || article.articleNo}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </nav>
          </aside>

          <section
            ref={mainScrollRef}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-white"
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
                  <span className="rounded-md bg-[#1e2f4f] px-3 py-1.5 text-xs font-medium text-white">
                    본문
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="body-search">
                    본문검색
                  </label>
                  <input
                    id="body-search"
                    type="search"
                    value={bodySearch}
                    onChange={(e) => setBodySearch(e.target.value)}
                    placeholder="본문검색"
                    className="w-40 rounded border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 sm:w-52"
                  />
                </div>
              </div>
            </div>

            {loadingDetail ? (
              <p className="py-12 text-center text-sm text-slate-500">
                본문을 불러오는 중…
              </p>
            ) : detailError ? (
              <p className="py-12 text-center text-sm text-red-600">{detailError}</p>
            ) : detail ? (
              <div className="px-4 py-6 sm:px-8">
                <header className="border-b border-slate-200 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-indigo-900 sm:text-2xl">
                        {detail.lawName}
                      </h2>
                      {detailMeta ? (
                        <p className="mt-1 text-sm text-slate-600">{detailMeta}</p>
                      ) : null}
                    </div>
                    {detail.department ? (
                      <p className="text-right text-sm text-slate-600">
                        {detail.department}
                      </p>
                    ) : null}
                  </div>
                </header>

                <div className="mt-6 space-y-8">
                  {filteredArticles.map((article) => (
                    <article
                      key={article.id}
                      id={`raw-article-${article.id}`}
                      className="scroll-mt-4 border-b border-slate-100 pb-6 last:border-0"
                    >
                      {article.articleNo ? (
                        <h3 className="mb-3 text-base font-bold text-slate-900">
                          {article.articleTitle}
                        </h3>
                      ) : null}
                      <AdminRulesArticleContent
                        articleNo={article.articleNo}
                        articleTitle={article.articleTitle}
                        content={article.content}
                      />
                    </article>
                  ))}
                </div>

                {detail.addendums.length > 0 ? (
                  <section className="mt-10 border-t border-slate-200 pt-6">
                    <h3 className="mb-4 text-lg font-bold text-slate-900">부칙</h3>
                    {detail.addendums.map((ad) => (
                      <div
                        key={ad.id}
                        className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800"
                      >
                        {ad.content}
                      </div>
                    ))}
                  </section>
                ) : null}

                {detail.annexes.length > 0 ? (
                  <section className="mt-10 border-t border-slate-200 pt-6">
                    <h3 className="mb-4 text-lg font-bold text-slate-900">
                      별표/서식
                    </h3>
                    <ul className="space-y-2">
                      {detail.annexes.map((an) => (
                        <li key={an.id} className="text-sm text-slate-800">
                          {an.annexNumber ? `${an.annexNumber} ` : ""}
                          {an.annexTitle ?? ""}
                          {an.annexFileLink ? (
                            <a
                              href={an.annexFileLink}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-2 text-indigo-700 hover:underline"
                            >
                              보기
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
