"use client";

import { Breadcrumb, type Crumb } from "@/hanjoo/components/ui/Breadcrumb";
import { Button } from "@/hanjoo/components/ui/Button";
import { NavIcon } from "@/hanjoo/components/ui/NavIcon";
import { SearchToolbar } from "@/hanjoo/components/ui/SearchToolbar";
import { CIEL_LAW_GROUPS } from "@/hanjoo/lib/general-law-catalog";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from "react";

type NavLink = { href: string; label: string; children?: NavLink[] };
type NavEntry =
  | { kind: "link"; href: string; label: string }
  | { kind: "group"; label: string; href?: string; children: NavLink[] };

const NAV: NavEntry[] = [
  { kind: "link", href: "/", label: "홈" },
  {
    kind: "group",
    label: "관세율표",
    children: [
      { href: "/tariff/rules", label: "관세율표 해석 통칙" },
      { href: "/tariff", label: "관세율표" },
      { href: "/tariff/english", label: "English HSK" },
      { href: "/tariff/foreign", label: "해외관세율표" },
      { href: "/tariff/compare", label: "HS비교" },
    ],
  },
  {
    kind: "group",
    label: "분류사례",
    children: [
      { href: "/cases/domestic", label: "품목분류 국내사례" },
      { href: "/cases/foreign", label: "품목분류 외국사례" },
    ],
  },
  {
    kind: "group",
    label: "세율",
    children: [
      { href: "/rates/import-taxes", label: "수입물품에 부과되는 세금" },
      { href: "/rates/duty/priority", label: "세율적용의 우선순위" },
      {
        href: "",
        label: "관세",
        children: [
          { href: "/rates/duty/kinds", label: "관세의종류" },
          { href: "/rates/duty/provisional", label: "잠정관세" },
          {
            href: "/rates/duty/flexible",
            label: "탄력관세",
            children: [
              { href: "/rates/duty/dumping", label: "덤핑방지관세" },
              { href: "/rates/duty/safeguard", label: "긴급관세" },
              { href: "/rates/duty/country-safeguard", label: "특정국물품긴급관세" },
              { href: "/rates/duty/special-safeguard", label: "특별긴급관세" },
              { href: "/rates/duty/adjustment", label: "조정관세" },
              { href: "/rates/duty/quota", label: "할당관세" },
            ],
          },
          {
            href: "/rates/duty/wto",
            label: "양허관세",
            children: [
              { href: "/rates/duty/wto", label: "WTO일반협정관세" },
              { href: "/rates/duty/wto-tndc", label: "WTO개도국협정관세 (TNDC)" },
              { href: "/rates/duty/wto-apta", label: "아태무역협정관세 (APTA)" },
              { href: "/rates/duty/wto-gstp", label: "UN개도국협정관세 (GSTP)" },
              { href: "/rates/duty/wto-coop", label: "특정국가와의국제협력관세" },
              { href: "/rates/duty/wto-ldc", label: "최빈개발도상국에대한특혜관세" },
            ],
          },
        ],
      },
      { href: "/rates/origin", label: "원산지결정기준" },
      { href: "/rates/fta", label: "FTA협정관세" },
      {
        href: "/rates/duty/reduction",
        label: "관세감면",
        children: [
          { href: "/rates/duty/reduction", label: "관세감면의 종류" },
          { href: "/rates/duty/reduction-88", label: "제88조 외교관용물품 등의 면세" },
          { href: "/rates/duty/reduction-89", label: "제89조 세율불균형물품의 면세" },
          {
            href: "/rates/duty/reduction-90",
            label: "제90조 학술연구용품의 감면",
            children: [
              { href: "/rates/duty/reduction-90-rind", label: "산업기술 연구개발용 물품에 관한 관세감면" },
            ],
          },
          {
            href: "/rates/duty/reduction-91",
            label: "제91조 종교용품·자선용품·장애인용품 등의 면세",
            children: [{ href: "/rates/duty/reduction-91-jei", label: "장애인용 물품 등의 관세감면" }],
          },
          { href: "/rates/duty/reduction-92", label: "제92조 정부용품 등의 면세" },
          { href: "/rates/duty/reduction-93", label: "제93조 특정물품의 면세" },
          {
            href: "/rates/duty/reduction-94",
            label: "제94조 소액물품 등의 면세",
            children: [{ href: "/rates/duty/reduction-94-self", label: "자가사용 인정기준" }],
          },
          {
            href: "/rates/duty/reduction-95",
            label: "제95조 환경오염방지물품 등에 대한 감면",
            children: [
              { href: "/rates/duty/reduction-95-rplt", label: "공장자동화물품에 대한 관세감면" },
            ],
          },
          {
            href: "/rates/duty/reduction-96",
            label: "제96조 여행자휴대품·이사물품 등의 감면",
            children: [{ href: "/rates/duty/reduction-96-move", label: "이사물품의 수입통관" }],
          },
          { href: "/rates/duty/reduction-97", label: "제97조 재수출면세" },
          { href: "/rates/duty/reduction-98", label: "제98조 재수출감면" },
          { href: "/rates/duty/reduction-99", label: "제99조 재수입면세" },
          { href: "/rates/duty/reduction-100", label: "제100조 손상물품에 대한 감면" },
          { href: "/rates/duty/reduction-101", label: "제101조 해외임가공물품 등의 감면" },
          { href: "/rates/duty/reduction-tax", label: "조세특례제한법에 따른 감면" },
          { href: "/rates/duty/reduction-fta", label: "FTA특례법에 따른 관세감면" },
          { href: "/rates/duty/reduction-treaty", label: "조약·협정에 따른 관세감면" },
        ],
      },
      { href: "/rates/duty/simple-rate", label: "간이세율" },
      {
        href: "/rates/duty/domestic",
        label: "내국세",
        children: [
          { href: "/rates/duty/domestic", label: "내국세의 종류" },
          { href: "/rates/duty/domestic-spc", label: "개별소비세" },
          { href: "/rates/duty/domestic-tra", label: "교통·에너지·환경세" },
          { href: "/rates/duty/domestic-alc", label: "주세" },
          { href: "/rates/duty/domestic-edu", label: "교육세" },
          { href: "/rates/duty/domestic-agr", label: "농어촌특별세" },
          { href: "/rates/duty/domestic-add", label: "부가가치세" },
          { href: "/rates/duty/domestic-local", label: "지방세" },
        ],
      },
      { href: "/rates/duty/usage", label: "용도세율 및 사후관리" },
      { href: "/rates/duty/installment", label: "분할납부" },
      { href: "/rates/duty/refund", label: "관세환급" },
      { href: "/rates/duty/simple-refund", label: "간이정액환급" },
    ],
  },
  {
    kind: "group",
    label: "수출입요령",
    href: "/guidelines",
    children: [
      { href: "/guidelines/imex", label: "수출입공고" },
      { href: "/guidelines/integrated", label: "통합공고" },
      { href: "/guidelines/customs-chief", label: "세관장확인" },
      { href: "/guidelines/hs-guidance", label: "HS별 수출입요령" },
      { href: "/guidelines/law-guidance", label: "법령별 수출입요령" },
      {
        href: "/guidelines/approval-exemption",
        label: "수출입승인의 면제",
        children: [
          { href: "/guidelines/approval-exemption?tab=export", label: "수출승인의 면제" },
          { href: "/guidelines/approval-exemption?tab=import", label: "수입승인의 면제" },
        ],
      },
      {
        href: "",
        label: "원산지",
        children: [
          { href: "/guidelines/origin?section=general", label: "일반원칙" },
          { href: "/guidelines/origin?section=certificate", label: "원산지증명서" },
          { href: "/guidelines/origin?section=criteria", label: "원산지결정기준" },
          { href: "/guidelines/origin?section=marking", label: "적정표시방법" },
          { href: "/guidelines/origin?section=easy", label: "원산지 간이확인 물품" },
          {
            href: "/guidelines/origin?section=comprehensive",
            label: "관세청장이 인정하는 원산지(포괄)확인서",
          },
        ],
      },
      { href: "/guidelines/inter-korean", label: "남북한교역" },
      { href: "/guidelines/strategic", label: "전략물자" },
      { href: "/guidelines/des-guide", label: "품명·규격 작성기준" },
    ],
  },
  {
    kind: "group",
    label: "관련법령",
    children: [
      { href: "/laws/legislation-notice", label: "통합입법예고" },
      { href: "/laws/latest", label: "최근개정법령" },
      ...CIEL_LAW_GROUPS.map((group) => ({
        href: "",
        label: group.label,
        children: group.items.map((law) => ({
          href: "",
          label: law.label,
          children: (law.children ?? [{ id: law.id, name: law.name }]).map((child) => ({
            href:
              child.href ??
              `/laws/general/${group.slug}/read?name=${encodeURIComponent(child.name)}${
                child.tab ? `&tab=${child.tab}` : ""
              }`,
            label: child.label ?? child.name,
          })),
        })),
      })),
      { href: "/laws/customs-notices", label: "관세청고시" },
    ],
  },
  { kind: "link", href: "/precedents", label: "판례·예규" },
  {
    kind: "group",
    label: "도구",
    children: [
      { href: "/tools/stat-codes", label: "통계부호" },
      { href: "/tools/jangchi", label: "장치장부호" },
    ],
  },
  {
    kind: "group",
    label: "게시판",
    children: [
      { href: "/news", label: "News" },
      { href: "/#board", label: "공지사항" },
    ],
  },
  {
    kind: "group",
    label: "관리",
    children: [
      { href: "/admin/login-history", label: "로그인 기록" },
      { href: "/admin/menu-access-history", label: "메뉴 접속기록" },
    ],
  },
];

const PATH_LABELS: Record<string, string> = {
  "": "홈",
  tariff: "관세율표",
  rules: "관세율표 해석 통칙",
  english: "English HSK",
  foreign: "해외관세율표",
  compare: "HS비교",
  chapter: "류",
  heading: "호",
  item: "품목",
  tree: "트리",
  cases: "분류사례",
  domestic: "품목분류 국내사례",
  rates: "세율",
  "import-taxes": "수입물품에 부과되는 세금",
  duty: "관세",
  origin: "원산지결정기준",
  fta: "FTA협정관세",
  guidelines: "수출입요령",
  laws: "관련법령",
  "legislation-notice": "통합입법예고",
  "customs-notices": "관세청고시",
  latest: "최근개정법령",
  precedents: "판례·예규",
  tools: "도구",
  news: "News",
  login: "로그인",
  admin: "관리",
  "login-history": "로그인 기록",
  "menu-access-history": "메뉴 접속기록",
};

function crumbsFor(pathname: string, search: URLSearchParams): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "홈" }];
  const crumbs: Crumb[] = [{ href: "/", label: "홈" }];
  let acc = "";
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    acc += `/${part}`;
    const last = index === parts.length - 1;
    const label = PATH_LABELS[part] ?? decodeURIComponent(part);
    crumbs.push(last ? { label } : { href: acc, label });
  }
  if (pathname === "/rates/fta" && search.get("code")) {
    const last = crumbs[crumbs.length - 1];
    if (last) last.href = "/rates/fta";
    crumbs.push({ label: search.get("code") || "협정" });
  }
  return crumbs;
}

function activeItem(pathname: string, href: string, foreignDrill: boolean): boolean {
  if (href === "/") return pathname === "/";
  if (href.startsWith("/#")) return false;
  if (href === "/tariff/foreign") {
    return pathname.startsWith("/tariff/foreign") || foreignDrill;
  }
  if (href === "/tariff") {
    return (
      !foreignDrill &&
      (pathname === "/tariff" ||
        (pathname.startsWith("/tariff/") &&
          !pathname.startsWith("/tariff/english") &&
          !pathname.startsWith("/tariff/foreign") &&
          !pathname.startsWith("/tariff/compare") &&
          !pathname.startsWith("/tariff/rules")))
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteChrome({
  userName,
  isAdmin = false,
  children,
}: {
  userName?: string;
  isAdmin?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [tariffCountry, setTariffCountry] = useState("KR");
  const [ftaPartners, setFtaPartners] = useState<{ code: string; name: string }[]>([]);
  const [openedMenus, setOpenedMenus] = useState<Set<string>>(() => new Set());
  const [closedMenus, setClosedMenus] = useState<Set<string>>(() => new Set());
  const skipNextPageLog = useRef(false);
  const ftaCode = pathname === "/rates/fta" ? (search.get("code") ?? "") : "";
  const searchKey = search.toString();
  const showTariffSearch = pathname === "/tariff" || pathname.startsWith("/tariff/");
  const foreignDrill = tariffCountry !== "KR" && !pathname.startsWith("/tariff/english");

  useEffect(() => {
    const code = (
      new URLSearchParams(window.location.search).get("country") || "KR"
    ).toUpperCase();
    setTariffCountry(code || "KR");
  }, [pathname]);

  useEffect(() => {
    void fetch("/api/rates/fta?part=agreements")
      .then(async (res) => {
        const data = (await res.json()) as { ok?: boolean; rows?: { code: string; name: string }[] };
        if (data.ok) setFtaPartners(data.rows ?? []);
      })
      .catch(() => undefined);
  }, []);

  function sideOn(href: string): boolean {
    if (href === "/rates/fta" || href.startsWith("/rates/fta?")) {
      const want = new URL(href, "http://local").searchParams.get("code") ?? "";
      return pathname === "/rates/fta" && ftaCode === want;
    }
    if (href.includes("/laws/general/") && href.includes("/read?")) {
      const target = new URL(href, "http://local");
      return pathname === target.pathname && (search.get("name") ?? "") === (target.searchParams.get("name") ?? "");
    }
    if (href.startsWith("/laws/customs-notices")) {
      const target = new URL(href, "http://local");
      return (
        pathname === target.pathname &&
        (search.get("q") ?? "") === (target.searchParams.get("q") ?? "")
      );
    }
    if (href.startsWith("/guidelines/origin")) {
      const target = new URL(href, "http://local");
      return (
        pathname === target.pathname &&
        (search.get("section") ?? "general") ===
          (target.searchParams.get("section") ?? "general")
      );
    }
    return activeItem(pathname, href, foreignDrill);
  }

  const nav = NAV.map((item) => {
    if (item.kind !== "group" || item.label !== "세율") return item;
    return {
      ...item,
      children: item.children.map((child) =>
        child.href === "/rates/fta"
          ? {
              ...child,
              children: ftaPartners.map((row) => ({
                href: `/rates/fta?code=${encodeURIComponent(row.code)}`,
                label: row.name,
              })),
            }
          : child,
      ),
    };
  });

  const routeOpenMenus = new Set<string>();
  function markActiveBranch(link: NavLink, key: string): boolean {
    const childActive =
      link.children?.some((child) =>
        markActiveBranch(child, `${key}/${child.label}`),
      ) ?? false;
    const active = Boolean(link.href && sideOn(link.href));
    if (link.children?.length && (active || childActive)) routeOpenMenus.add(key);
    return active || childActive;
  }
  const activeGroups = new Set<string>();
  nav.forEach((item) => {
    if (item.kind !== "group") return;
    const key = `group:${item.label}`;
    const active = item.children.some((child) =>
      markActiveBranch(child, `${key}/${child.label}`),
    );
    const hubActive = Boolean(item.href && pathname === item.href);
    if (active || hubActive) {
      routeOpenMenus.add(key);
      activeGroups.add(item.label);
    }
  });

  useEffect(() => {
    setOpenedMenus(new Set());
    setClosedMenus(new Set());
  }, [pathname, searchKey, tariffCountry]);

  function menuIsOpen(key: string): boolean {
    return !closedMenus.has(key) && (routeOpenMenus.has(key) || openedMenus.has(key));
  }

  function toggleMenu(key: string) {
    const open = menuIsOpen(key);
    setOpenedMenus((current) => {
      const next = new Set(current);
      if (open) next.delete(key);
      else next.add(key);
      return next;
    });
    setClosedMenus((current) => {
      const next = new Set(current);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function SideNode({ link, depth, menuKey }: { link: NavLink; depth: number; menuKey: string }) {
    const cls = depth <= 0 ? "side-sub" : depth === 1 ? "side-sub2" : "side-sub3";
    const on = link.href && sideOn(link.href) ? " on" : "";
    const hasChildren = Boolean(link.children?.length);
    const open = hasChildren && menuIsOpen(menuKey);
    return (
      <Fragment key={link.href || link.label}>
        {link.href && !hasChildren ? (
          <Link
            href={link.href}
            className={`side-link ${cls}${on}`}
            onClick={() => logMenuAccess(link.href, link.label, "menu")}
          >
            {link.label}
          </Link>
        ) : link.href ? (
          <div className="side-collapsible-row">
            <Link
              href={link.href}
              className={`side-link ${cls}${on}`}
              onClick={() => logMenuAccess(link.href, link.label, "menu")}
            >
              {link.label}
            </Link>
            <button
              type="button"
              className={`side-caret${open ? " open" : ""}`}
              onClick={() => toggleMenu(menuKey)}
              aria-expanded={open}
              aria-label={`${link.label} 하위 메뉴 ${open ? "접기" : "펼치기"}`}
            >
              ▸
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`side-link ${cls} side-folder side-menu-toggle`}
            onClick={() => toggleMenu(menuKey)}
            aria-expanded={open}
          >
            <span>{link.label}</span>
            <span className={`side-caret${open ? " open" : ""}`} aria-hidden="true">▸</span>
          </button>
        )}
        {open
          ? link.children?.map((child) => (
              <SideNode
                key={child.href || child.label}
                link={child}
                depth={depth + 1}
                menuKey={`${menuKey}/${child.label}`}
              />
            ))
          : null}
      </Fragment>
    );
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const digits = q.replace(/\D/g, "");
    if (!digits) return;
    const sp = new URLSearchParams(window.location.search);
    const year = sp.get("year") || "2026";
    const country = (sp.get("country") || "KR").toUpperCase();
    const cq = country !== "KR" ? `&country=${country}` : "";
    const onEnglish = pathname.startsWith("/tariff/english");
    if (digits.length <= 2) {
      const code = digits.padStart(2, "0");
      router.push(
        onEnglish
          ? `/tariff/english/chapter?hs=${code}`
          : `/tariff/chapter?hs=${code}&year=${year}${cq}`,
      );
    } else if (digits.length <= 4) {
      router.push(`/tariff/heading?hs=${digits.slice(0, 4)}&year=${year}${cq}`);
    } else {
      router.push(`/tariff/item?hs=${digits}&year=${year}${cq}`);
    }
  }

  function logMenuAccess(href: string, label: string, source: "menu" | "page" = "menu") {
    if (!href || href.startsWith("/#") || href.startsWith("/login")) return;
    if (source === "menu") skipNextPageLog.current = true;
    const path = href.split("?")[0] || href;
    void fetch("/api/audit/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ href, menuPath: path, menuLabel: label, source }),
      keepalive: true,
    }).catch(() => undefined);
  }

  useEffect(() => {
    if (!pathname || pathname.startsWith("/login")) return;
    if (skipNextPageLog.current) {
      skipNextPageLog.current = false;
      return;
    }
    const label =
      crumbsFor(pathname, search)
        .map((c) => c.label)
        .filter(Boolean)
        .slice(1)
        .join(" > ") || pathname;
    const href = searchKey ? `${pathname}?${searchKey}` : pathname;
    logMenuAccess(href, label, "page");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 경로 변경 시에만 화면이동 기록
  }, [pathname, searchKey]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const crumbs = useMemo(() => crumbsFor(pathname, search), [pathname, searchKey]);
  const userInitial = (userName ?? "U").trim().slice(0, 1).toUpperCase();

  return (
    <div className="site-shell">
      <aside className="site-side">
        <Link href="/" className="side-brand">
          <span className="side-mark">HS</span>
          <span>
            <strong>Smart Law</strong>
            <em>한주 HS 및 법령정보포털</em>
          </span>
        </Link>
        <nav className="side-nav">
          {nav.map((item) =>
            item.kind === "link" ? (
              <Link
                key={item.href}
                href={item.href}
                className={`side-link side-top${sideOn(item.href) ? " on" : ""}`}
                onClick={() => logMenuAccess(item.href, item.label, "menu")}
              >
                <span className="side-ico" aria-hidden>
                  <NavIcon label={item.label} />
                </span>
                <span className="side-label">{item.label}</span>
              </Link>
            ) : (
              <div
                key={item.label}
                className={`side-group${item.label === "관련법령" ? " law-side-group" : ""}${
                  activeGroups.has(item.label) ? " is-active" : ""
                }`}
              >
                {item.href ? (
                  <div className="side-collapsible-row side-group-row">
                    <Link
                      href={item.href}
                      className={`side-group-label side-top${
                        pathname === item.href || activeGroups.has(item.label) ? " branch-on" : ""
                      }${pathname === item.href ? " on" : ""}`}
                    >
                      <span className="side-ico" aria-hidden>
                        <NavIcon label={item.label} />
                      </span>
                      <span className="side-label">{item.label}</span>
                    </Link>
                    <button
                      type="button"
                      className={`side-caret${menuIsOpen(`group:${item.label}`) ? " open" : ""}`}
                      onClick={() => toggleMenu(`group:${item.label}`)}
                      aria-expanded={menuIsOpen(`group:${item.label}`)}
                      aria-label={`${item.label} 하위 메뉴 ${menuIsOpen(`group:${item.label}`) ? "접기" : "펼치기"}`}
                    >
                      ▸
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`side-group-label side-menu-toggle side-top${
                      activeGroups.has(item.label) ? " branch-on" : ""
                    }`}
                    onClick={() => toggleMenu(`group:${item.label}`)}
                    aria-expanded={menuIsOpen(`group:${item.label}`)}
                  >
                    <span className="side-top-inner">
                      <span className="side-ico" aria-hidden>
                        <NavIcon label={item.label} />
                      </span>
                      <span className="side-label">{item.label}</span>
                    </span>
                    <span
                      className={`side-caret${menuIsOpen(`group:${item.label}`) ? " open" : ""}`}
                      aria-hidden="true"
                    >
                      ▸
                    </span>
                  </button>
                )}
                {menuIsOpen(`group:${item.label}`)
                  ? item.children.map((child) => (
                      <SideNode
                        key={child.href || child.label}
                        link={child}
                        depth={0}
                        menuKey={`group:${item.label}/${child.label}`}
                      />
                    ))
                  : null}
              </div>
            ),
          )}
        </nav>
        {userName ? (
          <button type="button" className="side-logout" onClick={() => void logout()}>
            {userName} · 로그아웃
          </button>
        ) : null}
      </aside>
      <div className="site-body">
        <header className="site-top">
          <Breadcrumb items={crumbs} />
          <div className="site-top-tools">
            {isAdmin ? (
              // 루트 레이아웃이 달라 <a> 로 전체 이동
              <a href="/ai" className="site-admin-switch" title="smart-law-ai 관리자 화면">
                관리자 화면
              </a>
            ) : null}
            {userName ? (
              <span className="site-user-chip" title={userName}>
                <span className="site-user-avatar" aria-hidden>
                  {userInitial}
                </span>
                {userName}
              </span>
            ) : null}
          </div>
        </header>
        {showTariffSearch ? (
          <SearchToolbar onSubmit={onSearch}>
            <select defaultValue="hsk" aria-label="검색구분">
              <option value="hsk">HSK</option>
            </select>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="HSK 또는 키워드"
              aria-label="검색어"
            />
            {/* HSK 자릿수 → chapter/heading/item 라우팅 = 조건 조회 */}
            <Button type="submit" action="lookup" size="large" />
            <Link
              href={
                pathname.startsWith("/tariff/english")
                  ? "/tariff/english"
                  : foreignDrill
                    ? `/tariff/foreign?country=${tariffCountry}`
                    : "/tariff"
              }
              className="quick"
            >
              류 바로가기
            </Link>
          </SearchToolbar>
        ) : null}
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          <div>HOME · 이용약관 · 개인정보취급방침 · 도움말 · About</div>
          <div className="muted">Smart Law · 관세·법령 통합 조회</div>
        </footer>
      </div>
    </div>
  );
}
