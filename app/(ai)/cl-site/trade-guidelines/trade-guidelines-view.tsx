"use client";

import { CasSearchButton } from "@/app/components/search-action-buttons";
import { useCallback, useEffect, useMemo, useState } from "react";

type CielMenuItem = {
  id: number;
  screen: string;
  parentTitle: string;
  title: string;
  url: string;
  sortOrder: number;
  group: string | null;
};

type CielContentSummary = {
  id: number;
  screen: string;
  lawName: string;
  sourceUrl: string;
  textLength: number;
  hasHtml: boolean;
  usable: boolean;
};

type CielDocument = {
  id: number;
  screen: string;
  lawName: string;
  contentText: string;
  contentHtml: string;
  sourceUrl: string;
  crawledAt: string | null;
  attachments: {
    id: number;
    fileName: string;
    filePath: string;
    downloadUrl: string;
  }[];
  links: { id: number; linkText: string; linkUrl: string }[];
};

type MenuGroup = {
  key: string;
  label: string;
  items: CielMenuItem[];
};

/** Ciel 상단 탭에 해당하는 원산지 4탭 */
const ORIGIN_TAB_TITLES = [
  "일반원칙",
  "원산지증명서",
  "원산지결정기준",
  "적정표시방법",
];

function buildMenuGroups(items: CielMenuItem[]): MenuGroup[] {
  const groups: MenuGroup[] = [];
  const origin: CielMenuItem[] = [];
  const exemption: CielMenuItem[] = [];

  for (const item of items) {
    if (item.group === "원산지") {
      origin.push(item);
      continue;
    }
    if (item.group === "수출입승인의 면제") {
      exemption.push(item);
      continue;
    }
    groups.push({ key: `m-${item.id}`, label: item.title, items: [item] });
  }

  // 법령별 수출입요령 다음에 면제 그룹 삽입
  if (exemption.length > 0) {
    const exemptionGroup: MenuGroup = {
      key: "수출입승인의 면제",
      label: "수출입승인의 면제",
      items: exemption.sort((a, b) => {
        // 수출승인 → 수입승인 순
        if (a.title.includes("수출") && !b.title.includes("수출")) return -1;
        if (!a.title.includes("수출") && b.title.includes("수출")) return 1;
        return a.sortOrder - b.sortOrder;
      }),
    };
    const afterLawIdx = groups.findIndex((g) =>
      g.label.includes("법령별"),
    );
    if (afterLawIdx >= 0) groups.splice(afterLawIdx + 1, 0, exemptionGroup);
    else groups.splice(Math.min(5, groups.length), 0, exemptionGroup);
  }

  if (origin.length > 0) {
    const originGroup: MenuGroup = {
      key: "원산지",
      label: "원산지",
      items: origin,
    };
    // 면제 그룹 다음(또는 면제 자리)에 원산지
    const exemptionIdx = groups.findIndex(
      (g) => g.key === "수출입승인의 면제",
    );
    if (exemptionIdx >= 0) groups.splice(exemptionIdx + 1, 0, originGroup);
    else {
      let insertAt = -1;
      for (let i = 0; i < groups.length; i++) {
        if (
          groups[i]!.label.includes("승인") ||
          groups[i]!.label.includes("면제")
        ) {
          insertAt = i;
        }
      }
      if (insertAt >= 0) groups.splice(insertAt + 1, 0, originGroup);
      else groups.splice(Math.min(7, groups.length), 0, originGroup);
    }
  }

  return groups;
}

export default function TradeGuidelinesView({
  initialTitle,
  portalItemLabel,
}: {
  /** 통관정보(CLIP) 등 — ciel 메뉴 title로 초기 선택 */
  initialTitle?: string;
  /** 포털 표시명 (예: 세관장확인사항) */
  portalItemLabel?: string;
} = {}) {
  const [menus, setMenus] = useState<CielMenuItem[]>([]);
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(["원산지", "수출입승인의 면제"]),
  );
  const [listKeyword, setListKeyword] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [hskQ, setHskQ] = useState("");
  const [mode, setMode] = useState<"document" | "list" | "empty" | "search">(
    "empty",
  );
  const [listItems, setListItems] = useState<CielContentSummary[]>([]);
  const [siblingTabs, setSiblingTabs] = useState<CielMenuItem[]>([]);
  const [document, setDocument] = useState<CielDocument | null>(null);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [message, setMessage] = useState("");
  const [showExtras, setShowExtras] = useState(false);

  const groups = useMemo(() => buildMenuGroups(menus), [menus]);

  const selectedMenu = useMemo(
    () => menus.find((m) => m.title === selectedTitle) ?? null,
    [menus, selectedTitle],
  );

  const originTabs = useMemo(() => {
    const fromSiblings = siblingTabs.filter((t) =>
      ORIGIN_TAB_TITLES.includes(t.title),
    );
    if (fromSiblings.length > 0) return fromSiblings;
    return menus.filter((m) => ORIGIN_TAB_TITLES.includes(m.title));
  }, [siblingTabs, menus]);

  const showOriginTabs =
    Boolean(selectedMenu?.group === "원산지") &&
    ORIGIN_TAB_TITLES.includes(selectedTitle ?? "");

  const sectionLabel = portalItemLabel ? "통관정보(CLIP)" : "수출입요령";
  const rootLabel = portalItemLabel ?? "수출입요령";

  const breadcrumbTrail = useMemo(() => {
    if (mode === "search") return [rootLabel, "검색"];
    if (portalItemLabel && selectedTitle === initialTitle) {
      return [sectionLabel, portalItemLabel];
    }
    if (selectedMenu?.group === "원산지") {
      return [rootLabel, "원산지", selectedMenu.title];
    }
    if (selectedMenu?.group === "수출입승인의 면제") {
      return [rootLabel, "수출입승인의 면제", selectedMenu.title];
    }
    if (selectedTitle) return [rootLabel, selectedTitle];
    return [rootLabel];
  }, [
    mode,
    selectedMenu,
    selectedTitle,
    portalItemLabel,
    initialTitle,
    rootLabel,
    sectionLabel,
  ]);

  const filteredListItems = useMemo(() => {
    const q = listKeyword.trim().toLowerCase();
    if (!q) return listItems;
    return listItems.filter((item) =>
      `${item.lawName} ${item.screen}`.toLowerCase().includes(q),
    );
  }, [listItems, listKeyword]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoadingMenu(true);
        const res = await fetch("/api/cl-site/trade-guidelines/menu", {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          items?: CielMenuItem[];
          error?: string;
        };
        if (!data.ok) throw new Error(data.error || "메뉴 로드 실패");
        const items = data.items ?? [];
        setMenus(items);
        const preferred =
          initialTitle && items.some((m) => m.title === initialTitle)
            ? initialTitle
            : null;
        const first =
          preferred ??
          items.find((m) => m.title === "원산지결정기준")?.title ??
          items.find((m) => m.group === "원산지")?.title ??
          items[0]?.title ??
          null;
        if (first) setSelectedTitle(first);
      } catch (e) {
        setMessage(
          e instanceof Error ? e.message : "ciel.db 메뉴를 불러오지 못했습니다.",
        );
      } finally {
        setLoadingMenu(false);
      }
    };
    void run();
  }, [initialTitle]);

  const loadMenuContent = useCallback(async (title: string) => {
    setLoadingContent(true);
    setMessage("");
    setListKeyword("");
    setShowExtras(false);
    try {
      const res = await fetch(
        `/api/cl-site/trade-guidelines/content?title=${encodeURIComponent(title)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok: boolean;
        mode?: "document" | "list" | "empty";
        document?: CielDocument | null;
        items?: CielContentSummary[];
        siblingTabs?: CielMenuItem[];
        error?: string;
      };
      if (!data.ok) throw new Error(data.error || "콘텐츠 로드 실패");
      setMode(data.mode ?? "empty");
      setDocument(data.document ?? null);
      setListItems(data.items ?? []);
      setSiblingTabs(data.siblingTabs ?? []);
      if (data.mode === "empty") {
        setMessage(`「${title}」에 연결된 본문이 ciel.db에 없습니다.`);
      }
    } catch (e) {
      setDocument(null);
      setListItems([]);
      setMode("empty");
      setMessage(e instanceof Error ? e.message : "콘텐츠 조회 실패");
    } finally {
      setLoadingContent(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedTitle) return;
    void loadMenuContent(selectedTitle);
  }, [selectedTitle, loadMenuContent]);

  const openDocument = async (id: number) => {
    setLoadingContent(true);
    setMessage("");
    try {
      const res = await fetch(
        `/api/cl-site/trade-guidelines/document?id=${id}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok: boolean;
        document?: CielDocument;
        error?: string;
      };
      if (!data.ok || !data.document) {
        throw new Error(data.error || "문서 로드 실패");
      }
      setDocument(data.document);
      setMode("document");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "문서 조회 실패");
    } finally {
      setLoadingContent(false);
    }
  };

  const runSearch = async (qRaw?: string) => {
    const q = (qRaw ?? searchQ).trim();
    if (!q) return;
    setLoadingContent(true);
    setMessage("");
    setSelectedTitle(null);
    try {
      const res = await fetch(
        `/api/cl-site/trade-guidelines/content?q=${encodeURIComponent(q)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok: boolean;
        items?: CielContentSummary[];
        error?: string;
      };
      if (!data.ok) throw new Error(data.error || "검색 실패");
      setMode("search");
      setListItems(data.items ?? []);
      setDocument(null);
      setSiblingTabs([]);
      if (!(data.items && data.items.length > 0)) {
        setMessage(`「${q}」검색 결과가 없습니다.`);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "검색 실패");
    } finally {
      setLoadingContent(false);
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectMenu = (title: string) => {
    setSearchQ("");
    setHskQ("");
    setSelectedTitle(title);
    const group = menus.find((m) => m.title === title)?.group;
    if (group === "원산지" || group === "수출입승인의 면제") {
      setExpandedGroups((prev) => new Set(prev).add(group));
    }
  };

  return (
    <div className="flex h-[calc(100vh-5.5rem)] max-h-[calc(100vh-5.5rem)] flex-col overflow-hidden bg-[#f3f6fb] lg:h-[calc(100vh-6rem)] lg:max-h-[calc(100vh-6rem)]">
      {/* Ciel-like top bar */}
      <header className="shrink-0 border-b border-[#c5d4ea] bg-gradient-to-b from-[#eef4fc] to-[#dce8f8] px-3 py-2 sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold tracking-tight text-[#1a4a8a]">
              Ciel HS
            </span>
            <span className="text-xs font-semibold text-[#2f6fbf]">
              {portalItemLabel ?? "수출입요령"}
            </span>
          </div>
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <select
              className="h-8 rounded border border-[#9db6d8] bg-white px-1.5 text-xs text-slate-700"
              defaultValue="2026"
              aria-label="연도"
            >
              <option value="2026">2026년</option>
              <option value="2025">2025년</option>
              <option value="2024">2024년</option>
            </select>
            <input
              type="search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="검색어"
              className="h-8 w-40 rounded border border-[#9db6d8] bg-white px-2 text-xs outline-none focus:border-[#3b7dd8] sm:w-52"
            />
            <CasSearchButton type="submit">검색</CasSearchButton>
          </form>
        </div>
      </header>

      {message ? (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          {message}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left tree */}
        <aside className="flex w-[220px] shrink-0 flex-col overflow-hidden border-r border-[#c5d4ea] bg-white">
          <div className="border-b border-[#d7e3f4] bg-[#edf3fb] px-3 py-2 text-[11px] font-bold text-[#1a4a8a]">
            ▣ 수출입요령
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 text-[13px]">
            {loadingMenu ? (
              <p className="px-3 py-4 text-slate-500">불러오는 중…</p>
            ) : (
              <ul>
                {groups.map((g) => {
                  const multi = g.items.length > 1;
                  const open = !multi || expandedGroups.has(g.key);
                  const groupActive =
                    multi &&
                    g.items.some((it) => it.title === selectedTitle);
                  return (
                    <li key={g.key} className="border-b border-[#eef2f7]">
                      {multi ? (
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.key)}
                          className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-semibold ${
                            groupActive
                              ? "bg-[#e8f1fc] text-[#1a4a8a]"
                              : "text-slate-800 hover:bg-[#f5f8fc]"
                          }`}
                        >
                          <span className="text-[10px] text-[#6a8ab8]">
                            {open ? "▼" : "▶"}
                          </span>
                          <span>{g.label}</span>
                        </button>
                      ) : null}
                      {open ? (
                        <ul className={multi ? "bg-[#fafcfe] pb-1" : ""}>
                          {g.items.map((item) => {
                            const sel = item.title === selectedTitle;
                            return (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  onClick={() => selectMenu(item.title)}
                                  className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left ${
                                    multi ? "pl-6" : ""
                                  } ${
                                    sel
                                      ? "bg-[#3b7dd8] font-medium text-white"
                                      : "text-slate-700 hover:bg-[#eef4fb]"
                                  }`}
                                >
                                  <span
                                    className={`text-[10px] ${
                                      sel ? "text-sky-100" : "text-[#8aa3c4]"
                                    }`}
                                  >
                                    ▪
                                  </span>
                                  <span className="leading-snug">
                                    {multi ? item.title : g.label}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <div className="shrink-0 border-b border-[#d7e3f4] bg-[#f7fafd] px-4 py-2">
            <p className="text-[12px] text-[#3a5f8c]">
              ▣{" "}
              {breadcrumbTrail.map((part, i) => (
                <span key={`${part}-${i}`}>
                  {i > 0 ? (
                    <span className="mx-1 text-[#9db6d8]">&gt;</span>
                  ) : null}
                  <span
                    className={
                      i === breadcrumbTrail.length - 1
                        ? "font-semibold text-[#1a4a8a]"
                        : ""
                    }
                  >
                    {part}
                  </span>
                </span>
              ))}
            </p>
          </div>

          {showOriginTabs ? (
            <div className="shrink-0 border-b border-[#c5d4ea] bg-white px-3 pt-2">
              <div className="flex flex-wrap items-end gap-1">
                {originTabs.map((tab) => {
                  const sel = tab.title === selectedTitle;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => selectMenu(tab.title)}
                      className={`rounded-t-md border px-3.5 py-1.5 text-[12px] font-medium transition ${
                        sel
                          ? "border-[#3b7dd8] border-b-white bg-[#3b7dd8] text-white relative z-[1] mb-[-1px]"
                          : "border-transparent bg-[#c0c0c0] text-white hover:bg-[#a8a8a8]"
                      }`}
                    >
                      {tab.title}
                    </button>
                  );
                })}
                <form
                  className="ml-auto mb-1 flex items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const q = hskQ.trim();
                    if (!q) return;
                    setSearchQ(q);
                    void runSearch(q);
                  }}
                >
                  <select
                    className="h-7 rounded border border-[#b0c4de] bg-white px-1 text-[11px] text-slate-700"
                    defaultValue="HSK"
                    aria-label="검색구분"
                  >
                    <option value="HSK">HSK</option>
                    <option value="키워드">키워드</option>
                  </select>
                  <input
                    type="search"
                    value={hskQ}
                    onChange={(e) => setHskQ(e.target.value)}
                    className="h-7 w-28 rounded border border-[#b0c4de] px-2 text-[11px] outline-none focus:border-[#3b7dd8]"
                    placeholder=""
                  />
                  <CasSearchButton type="submit" className="h-7 px-3 text-[11px]">
                    검색
                  </CasSearchButton>
                </form>
              </div>
            </div>
          ) : null}

          {loadingContent ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              콘텐츠를 불러오는 중…
            </div>
          ) : mode === "list" || mode === "search" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#e4ebf5] px-4 py-2">
                <p className="text-[13px] font-semibold text-[#1a4a8a]">
                  {mode === "search"
                    ? `검색 결과 ${filteredListItems.length}건`
                    : `${selectedTitle ?? ""} (${filteredListItems.length})`}
                </p>
                {mode === "list" ? (
                  <input
                    type="search"
                    value={listKeyword}
                    onChange={(e) => setListKeyword(e.target.value)}
                    placeholder="목록 검색"
                    className="h-7 w-48 rounded border border-[#b0c4de] px-2 text-[12px]"
                  />
                ) : null}
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto">
                {filteredListItems.map((item) => (
                  <li key={item.id} className="border-b border-[#eef2f7]">
                    <button
                      type="button"
                      onClick={() => void openDocument(item.id)}
                      className="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left hover:bg-[#f0f6ff]"
                    >
                      <span className="text-[13px] text-slate-800">
                        {item.lawName}
                      </span>
                      <span className="shrink-0 text-[11px] text-[#8aa3c4]">
                        {item.screen}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : document ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {(document.attachments.length > 0 ||
                document.links.length > 0) && (
                <div className="border-b border-[#eef2f7] bg-[#fafcfe] px-4 py-1.5">
                  <button
                    type="button"
                    onClick={() => setShowExtras((v) => !v)}
                    className="text-[11px] text-[#3b7dd8] hover:underline"
                  >
                    {showExtras ? "첨부·링크 숨기기" : "첨부·링크 보기"}
                    {(document.attachments.length > 0 ||
                      document.links.length > 0) &&
                      ` (${document.attachments.length + Math.min(document.links.length, 40)})`}
                  </button>
                  {showExtras ? (
                    <div className="mt-2 space-y-2 pb-1">
                      {document.attachments.length > 0 ? (
                        <ul className="flex flex-wrap gap-1.5">
                          {document.attachments.map((a) => (
                            <li key={a.id}>
                              <a
                                href={a.downloadUrl || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex rounded border border-[#b0c4de] bg-white px-2 py-0.5 text-[11px] text-[#1a4a8a] hover:bg-[#eef4fb]"
                              >
                                {a.fileName}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {document.links.length > 0 ? (
                        <ul className="flex flex-wrap gap-x-3 gap-y-1">
                          {document.links.slice(0, 30).map((l) => (
                            <li key={l.id}>
                              <a
                                href={l.linkUrl || undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-[#2f6fbf] hover:underline"
                              >
                                {l.linkText}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}

              <div className="px-4 py-3 sm:px-5">
                {document.contentHtml ? (
                  <div
                    className="ciel-body mx-auto max-w-[820px] text-[12.5px] leading-[1.7] text-slate-800 [&_a]:font-medium [&_a]:text-[#2f6fbf] [&_a]:underline [&_b]:text-slate-900 [&_p]:my-1.5 [&_table]:w-full [&_td]:align-top"
                    dangerouslySetInnerHTML={{ __html: document.contentHtml }}
                  />
                ) : (
                  <pre className="mx-auto max-w-[820px] whitespace-pre-wrap font-sans text-[12.5px] leading-[1.7] text-slate-800">
                    {document.contentText}
                  </pre>
                )}
                {document.sourceUrl ? (
                  <p className="mx-auto mt-6 max-w-[820px] border-t border-[#e4ebf5] pt-3 text-[11px] text-[#8aa3c4]">
                    <a
                      href={document.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#3b7dd8] hover:underline"
                    >
                      Ciel 원문 보기
                    </a>
                  </p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
              왼쪽 메뉴에서 항목을 선택하세요.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
