"use client";

import Link from "next/link";
import { HanjooLogoMark } from "@/app/components/hanjoo-logo-mark";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminNavIcon } from "@/app/components/admin-nav-icons";
import {
  ADMIN_NAV_SECTIONS,
  adminNavEntryContainsPath,
  adminNavGroupExpandKey,
  adminNavSectionContainsPath,
  adminNavSectionExpandKey,
  collectAdminNavAutoExpandKeys,
  type AdminNavEntry,
  type AdminNavLink,
} from "@/app/components/admin-nav-sections";
import { CLIP_CLEARANCE_INFO_BY_SLUG } from "@/app/lib/clip-clearance-info-items";
import { CLIP_PRIOR_TAX_REVIEW_BY_SLUG } from "@/app/lib/clip-prior-tax-review-items";
import { CLIP_TAX_REFUND_INFO_BY_SLUG } from "@/app/lib/clip-tax-refund-info-items";
import {
  GENERAL_LAWS_PORTAL_BASE,
  isGeneralLawsPortalPath,
  normalizeAdminTabKey,
} from "@/app/shared/general-law-portal-categories";

const ROUTE_LABELS: Record<string, string> = {
  "/ai": "법령/행정규칙 현황",
  "/api-call": "법령 본문 API",
  "/api-call-old": "법령 본문 API(OLD)",
  "/law-search-list": "현행법령 목록",
  "/law-detail-json": "저장 법령·조문 JSON",
  "/general-law-inquiry": "일반법령 조회",
  "/general-law-inquiry-old": "일반법령 조회(OLD)",
  "/openlaw-inquiry": "법령조회(OPEN API)",
  "/admin-rules-inquiry": "행정규칙(Supabase)",
  "/admin-rules-inquiry-sqlite": "행정규칙(SQLiteDB)",
  "/law-vector-chat": "법령 벡터 채팅",
  "/law-langchain-chat": "LangChain 채팅",
  "/rag-chat": "관세 RAG 채팅",
  "/admin-rule-rag": "행정규칙 AI 검색",
  "/admin-rule-source-info": "행정규칙 출처",
  "/law-eflaw-josub": "조항호목 API",
  "/law-eflaw-josub-records": "조항호목 저장 이력",
  "/law-admrul-api": "행정규칙 본문 API",
  "/law-admrul-search": "행정규칙 목록 API",
  "/admin-rules-crawl": "행정규칙크롤링",
  "/api-management": "API 관리",
  "/gateway-audit-log": "API사용로그",
  "/api-option-management": "구분·분류 관리",
  "/crawler-management": "크롤러 관리",
  "/admin-users": "관리자 등록",
  "/system-dev-status": "시스템관리현황",
  "/item-classification/quick-reference": "속견표",
  "/item-classification/hs-explanatory": "HS해설서",
  "/item-classification/tariff-schedule": "관세율표",
  "/item-classification/world-hs-revision": "세계HS개정표",
  "/item-classification/world-hs-classification-cases": "품목분류사례",
  "/item-classification/statistical-code": "통계부호",
  "/item-classification/fta-general-materials": "일반자료",
  "/item-classification/fta-execution-guidance": "집행지침",
  "/item-classification/origin-criteria": "협정별 원산지결정기준",
  "/item-classification/origin-criteria-abbr": "원산지결정기준",
  "/kcs/admin-notices": "행정예고",
  "/gwanbo/search": "기본검색",
  "/customs-law-portal/admin-notices": "행정예고",
  "/law-info-center/latest-laws": "최신법령",
  "/law-info-center/hs-change-notice": "품목분류변경고시",
  "/item-classification/fta-agreement-rates": "협정별세율정보",
  "/item-classification/origin-certificate-forms": "원산지증명서 서식",
  "/kita/strategic-material": "전략물자HS",
  "/kita/system-guidance": "전략물자제도안내",
  "/kita/compliance-trader": "자율준수무역거래자",
  "/kita/dual-use": "이중용도",
  "/apqa/notices": "공지사항",
  "/item-classification/domestic-cases": "품목분류 국내사례",
  "/item-classification/foreign-cases": "품목분류 외국사례",
  "/customs-law-portal/latest-laws": "최신법령",
  "/customs-law-portal/admin-rules": "행정규칙 · 관세법령정보포털",
  "/customs-law-portal/precedents": "판례/결정례",
  "/customs-law-portal/tax-tribunal-cases": "조세심판사례",
  "/customs-law-portal/tax-tribunal-press": "보도자료",
  "/customs-law-portal/inquiry-replies": "질의회신",
  "/customs-law-portal/treaties": "조약/협정",
  "/customs-law-portal/annex-forms": "별표/서식",
  "/customs-law-portal/general-laws": "일반법령 · 전체",
  "/cl-site/trade-guidelines": "수출입요령",
  "/cl-site/fta-agreement-tariff": "FTA협정관세",
  "/cas-ncom/import-performance": "수입실적조회",
  "/cas-ncom/export-performance": "수출실적조회",
  "/cas-ncom/import-item-master": "수입품목마스터",
  "/cas-ncom/export-item-master": "수출품목마스터",
  "/cas-ncom/refund-import-ledger": "환급-수입원장",
  "/cas-api/3m-sap-if": "3M SAP I/F",
  "/dashboard/processing-status": "법령/행정규칙 현황",
  "/integrated-legislation-notice/ministry-legislation": "(부처)입법예고",
  "/integrated-legislation-notice/ministry-administrative": "(부처)행정예고",
};

type TabItem = { key: string; path: string; label: string };

function labelForPath(path: string): string {
  if (isGeneralLawsPortalPath(path)) {
    return "일반법령";
  }
  const clearanceMatch = path.match(
    /^\/customs-law-portal\/clearance-info\/([^/?]+)/,
  );
  if (clearanceMatch) {
    const item = CLIP_CLEARANCE_INFO_BY_SLUG[clearanceMatch[1]!];
    if (item) return item.label;
  }
  const taxRefundMatch = path.match(
    /^\/customs-law-portal\/tax-refund-info\/([^/?]+)/,
  );
  if (taxRefundMatch) {
    const item = CLIP_TAX_REFUND_INFO_BY_SLUG[taxRefundMatch[1]!];
    if (item) return item.label;
  }
  const priorTaxMatch = path.match(
    /^\/customs-law-portal\/prior-tax-review\/([^/?]+)/,
  );
  if (priorTaxMatch) {
    const item = CLIP_PRIOR_TAX_REVIEW_BY_SLUG[priorTaxMatch[1]!];
    if (item) return item.label;
  }
  if (
    path.startsWith("/item-classification/world-hs-classification-cases/")
  ) {
    return ROUTE_LABELS["/item-classification/world-hs-classification-cases"] ??
      "품목분류사례";
  }
  return ROUTE_LABELS[path] ?? path;
}

/** Route Handler URL을 브라우저 주소로 열었을 때 해당 화면으로 복귀 */
function redirectPathForApiRoute(pathname: string): string | null {
  if (pathname === "/api/api-management/save") return "/api-management";
  if (pathname.startsWith("/api/api-management/")) return "/api-management";
  return null;
}

/** dev: 숨김 iframe을 유지하면 Turbopack/요청이 쌓여 Node OOM → 활성 탭만 마운트 */
const DEV_MOUNT_ACTIVE_IFRAME_ONLY = process.env.NODE_ENV === "development";

/** iframe이 사이드바 없는 본문만 로드하도록 (탭 전환 시 언마운트하지 않고 유지) */
function tabFrameSrc(href: string): string {
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}embed=1`;
}

function NavChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      className={`h-3.5 w-3.5 shrink-0 text-white/35 transition-transform duration-200 ${
        expanded ? "rotate-180" : "rotate-0"
      }`}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  /** dev: iframe 전환 시 router.push 생략 — URL·하이라이트는 shellPath 사용 */
  const [shellPath, setShellPath] = useState(pathname);
  const [tabs, setTabs] = useState<TabItem[]>(() => [
    {
      key: normalizeAdminTabKey(pathname),
      path: pathname,
      label: labelForPath(pathname),
    },
  ]);
  const [activeView, setActiveView] = useState(() =>
    normalizeAdminTabKey(pathname),
  );
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    const keys = new Set(collectAdminNavAutoExpandKeys(pathname));
    // 소섹션은 기본 펼침 — 메뉴를 찾기 쉽게
    keys.add(adminNavSectionExpandKey("FTA포털"));
    keys.add(adminNavSectionExpandKey("조세심판원"));
    return keys;
  });

  useEffect(() => {
    setShellPath(pathname);
  }, [pathname]);

  /** 관리자 등록 권한(admin/user) — 권한 지정 메뉴 표시용 */
  const [userRole, setUserRole] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { role?: string | null } } | null) => {
        setUserRole(data?.user?.role ?? null);
      })
      .catch(() => setUserRole(null));
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setShellPath(window.location.pathname);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigateTo = useCallback(
    (href: string) => {
      const path = href.trim();
      if (!path.startsWith("/")) return;
      const tabKey = normalizeAdminTabKey(path);
      const label = labelForPath(path);
      setShellPath(path);
      setActiveView(tabKey);
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.key === tabKey);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { key: tabKey, path, label };
          return next;
        }
        return [...prev, { key: tabKey, path, label }];
      });
      const autoKeys = collectAdminNavAutoExpandKeys(path);
      if (autoKeys.length > 0) {
        setExpandedKeys((prev) => {
          const next = new Set(prev);
          for (const key of autoKeys) next.add(key);
          return next;
        });
      }
      if (DEV_MOUNT_ACTIVE_IFRAME_ONLY) {
        window.history.pushState(null, "", path);
        return;
      }
      router.push(path);
    },
    [router],
  );

  const toggleExpandKey = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    const onEmbedNavigate = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        type?: string;
        path?: string;
        label?: string;
      };
      if (data?.type !== "admin-embed-navigate") return;
      const path = String(data.path ?? "").trim();
      if (!path.startsWith("/")) return;

      const tabKey = normalizeAdminTabKey(path);
      const label = String(data.label ?? "").trim() || labelForPath(path);

      setShellPath(path);
      setActiveView(tabKey);
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.key === activeView);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { key: tabKey, path, label };
          return next;
        }
        return [...prev, { key: tabKey, path, label }];
      });
      if (DEV_MOUNT_ACTIVE_IFRAME_ONLY) {
        window.history.pushState(null, "", path);
      } else {
        router.push(path);
      }
    };

    window.addEventListener("message", onEmbedNavigate);
    return () => window.removeEventListener("message", onEmbedNavigate);
  }, [activeView, router]);

  useEffect(() => {
    const redirect = redirectPathForApiRoute(pathname);
    if (redirect) {
      router.replace(redirect);
      return;
    }

    const tabKey = normalizeAdminTabKey(pathname);
    setActiveView(tabKey);
    setTabs((prev) => {
      const label = labelForPath(pathname);
      const idx = prev.findIndex((t) => t.key === tabKey);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { key: tabKey, path: pathname, label };
        return next;
      }
      return [...prev, { key: tabKey, path: pathname, label }];
    });
    const autoKeys = collectAdminNavAutoExpandKeys(pathname);
    if (autoKeys.length === 0) return;
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      for (const key of autoKeys) next.add(key);
      return next;
    });
  }, [pathname, router]);

  const closeTab = useCallback(
    (tabKey: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) {
          if (tabKey === "/ai") return prev;
          queueMicrotask(() => {
            navigateTo("/ai");
          });
          return [{ key: "/ai", path: "/ai", label: labelForPath("/ai") }];
        }
        const i = prev.findIndex((t) => t.key === tabKey);
        if (i < 0) return prev;
        const next = prev.filter((t) => t.key !== tabKey);
        if (tabKey === activeView) {
          const neighbor = next[Math.max(0, i - 1)] ?? next[0];
          if (neighbor) {
            queueMicrotask(() => {
              navigateTo(neighbor.path);
            });
          }
        }
        return next;
      });
    },
    [activeView, navigateTo],
  );

  const renderNavLink = (item: AdminNavLink) => {
    if (item.requiredRole && userRole !== item.requiredRole) return null;
    const active =
      shellPath === item.href ||
      (item.href !== "/ai" &&
        item.href !== GENERAL_LAWS_PORTAL_BASE &&
        shellPath.startsWith(`${item.href}/`));

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={(e) => {
          e.preventDefault();
          navigateTo(item.href);
        }}
        title={labelForPath(item.href)}
        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[11px] font-medium tracking-wide leading-snug transition-colors ${
          active
            ? "bg-[#3b82f6] text-white shadow-sm"
            : "text-white/85 hover:bg-white/[0.06] hover:text-white"
        }`}
      >
        <AdminNavIcon name={item.icon} />
        <span className="min-w-0 truncate">{item.label}</span>
      </Link>
    );
  };

  const renderNavEntry = (
    sectionTitle: string,
    entry: AdminNavEntry,
    parentLabelPath = "",
  ) => {
    if (entry.type === "link") {
      return renderNavLink(entry);
    }

    const labelPath = parentLabelPath
      ? `${parentLabelPath}::${entry.label}`
      : entry.label;
    const key = adminNavGroupExpandKey(sectionTitle, labelPath);
    const expanded = expandedKeys.has(key);
    const groupActive = adminNavEntryContainsPath(entry, shellPath);

    return (
      <div key={key} className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => toggleExpandKey(key)}
          aria-expanded={expanded}
          className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-[11px] font-medium tracking-wide leading-snug transition-colors ${
            groupActive
              ? "text-white"
              : "text-white/85 hover:bg-white/[0.06] hover:text-white"
          }`}
        >
          <span className="truncate">{entry.label}</span>
          <NavChevron expanded={expanded} />
        </button>
        {expanded ? (
          <div className="ml-2 flex flex-col gap-0.5 border-l border-white/10 pl-2">
            {entry.children.map((child) =>
              child.type === "link"
                ? renderNavLink(child)
                : renderNavEntry(sectionTitle, child, labelPath),
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-[22rem] shrink-0 flex-col overflow-y-auto bg-[#1a233a] px-3 py-4 shadow-[4px_0_24px_-4px_rgba(15,23,42,0.35)]">
        <div className="mb-5 flex shrink-0 items-center gap-3 px-2">
          <HanjooLogoMark />
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold tracking-tight text-white">
              스마트 법령 AI
            </h1>
            <p className="truncate text-[11px] text-white/45">관리자 메뉴</p>
          </div>
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1">
          {ADMIN_NAV_SECTIONS.map((section) => {
            const sectionKey = adminNavSectionExpandKey(section.title);
            const sectionExpanded = expandedKeys.has(sectionKey);
            const sectionActive = adminNavSectionContainsPath(section, shellPath);

            return (
              <div key={section.title} className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (section.openHref && !sectionExpanded) {
                      navigateTo(section.openHref);
                      return;
                    }
                    toggleExpandKey(sectionKey);
                  }}
                  aria-expanded={sectionExpanded}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-[11px] font-medium tracking-wide transition-colors ${
                    sectionActive ? "text-white/55" : "text-white/40 hover:text-white/55"
                  }`}
                >
                  <span className="truncate">{section.title}</span>
                  <NavChevron expanded={sectionExpanded} />
                </button>

                {sectionExpanded ? (
                  <div className="flex flex-col gap-0.5">
                    {section.items.map((item) =>
                      renderNavEntry(section.title, item),
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="mt-3 flex shrink-0 flex-col gap-1 border-t border-white/10 px-1 pt-3">
          {/* 루트 레이아웃이 달라 <a> 로 전체 이동 */}
          <a
            href="/"
            className="rounded-lg px-3 py-2 text-[11px] font-medium text-white/85 hover:bg-white/[0.06] hover:text-white"
          >
            Smart-Law-Hanjoo 포털로 이동
          </a>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="w-full rounded-lg px-3 py-2 text-left text-[11px] font-medium text-white/50 hover:bg-white/[0.06] hover:text-white"
            >
              로그아웃
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#f4f7f9]">
        <div className="shrink-0 border-b border-[#d8dee6] bg-[#eef2f6] px-2 pt-2">
          <div
            className="flex min-h-10 gap-0.5 overflow-x-auto pb-0"
            role="tablist"
            aria-label="열려 있는 화면"
          >
            {tabs.map((tab) => {
              const isActive = activeView === tab.key;
              return (
                <div
                  key={tab.key}
                  role="tab"
                  aria-selected={isActive}
                  className={`flex max-w-[min(100%,16rem)] shrink-0 items-stretch overflow-hidden rounded-t-md border border-b-0 text-xs font-medium sm:text-sm ${
                    isActive
                      ? "border-[#d8dee6] bg-[#f4f7f9] text-[#333] shadow-sm"
                      : "border-transparent bg-white/70 text-[#666]"
                  } `}
                >
                  <button
                    type="button"
                    onClick={() => {
                      navigateTo(tab.path);
                    }}
                    className={`min-w-0 flex-1 truncate px-3 py-2 text-left transition-colors ${
                      isActive
                        ? "hover:bg-[#f4f7f9]"
                        : "hover:bg-white hover:text-[#333]"
                    }`}
                    title={tab.label}
                  >
                    {tab.label}
                  </button>
                  {tabs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => closeTab(tab.key)}
                      className={`shrink-0 border-l px-2 transition-colors ${
                        isActive
                          ? "border-[#d8dee6] text-[#666] hover:bg-[#e5e9ef] hover:text-[#333]"
                          : "border-[#d8dee6]/80 text-[#94a3b8] hover:bg-white hover:text-[#333]"
                      }`}
                      title="탭 닫기"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <main className="relative min-h-0 min-w-0 flex-1">
          {/*
            Next RSC(숨김). 화면은 아래 iframe만 사용 — 탭 클릭은 activeView만 바꿔 iframe을 유지.
          */}
          {DEV_MOUNT_ACTIVE_IFRAME_ONLY ? null : (
            <div className="hidden" aria-hidden>
              {children}
            </div>
          )}
          {tabs.map((tab) => {
            const show = activeView === tab.key;
            if (DEV_MOUNT_ACTIVE_IFRAME_ONLY && !show) {
              return null;
            }
            return (
              <iframe
                key={tab.key}
                src={tabFrameSrc(tab.path)}
                title={tab.label}
                aria-hidden={!show}
                tabIndex={show ? 0 : -1}
                className={
                  show
                    ? "absolute inset-0 z-10 h-full w-full min-h-0 border-0 bg-[#f4f7f9]"
                    : "pointer-events-none absolute inset-0 z-0 h-full w-full min-h-0 border-0 opacity-0"
                }
              />
            );
          })}
        </main>
      </div>
    </div>
  );
}
