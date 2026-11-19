import type { AdminNavIconName } from "@/app/components/admin-nav-icons";
import {
  clipClearanceInfoHref,
  CLIP_CLEARANCE_INFO_ITEMS,
} from "@/app/lib/clip-clearance-info-items";
import {
  clipPriorTaxReviewHref,
  CLIP_PRIOR_TAX_REVIEW_ITEMS,
} from "@/app/lib/clip-prior-tax-review-items";
import {
  clipTaxRefundInfoHref,
  CLIP_TAX_REFUND_INFO_ITEMS,
} from "@/app/lib/clip-tax-refund-info-items";
import {
  GENERAL_LAW_PORTAL_CATEGORIES,
  GENERAL_LAWS_PORTAL_BASE,
  generalLawPortalHref,
  isGeneralLawsPortalPath,
} from "@/app/shared/general-law-portal-categories";

export type AdminNavLink = {
  type: "link";
  href: string;
  label: string;
  icon: AdminNavIconName;
  /** 지정 시 해당 권한(관리자 등록 JSON)만 메뉴 표시 */
  requiredRole?: "admin";
};
export type AdminNavGroup = {
  type: "group";
  label: string;
  /** 링크 또는 중첩 그룹(예: 일반법령 하위 분류) */
  children: AdminNavEntry[];
};
export type AdminNavEntry = AdminNavLink | AdminNavGroup;

export type AdminNavSection = {
  title: string;
  items: AdminNavEntry[];
  /** 대메뉴 클릭 시 펼치면서 바로 여는 화면 */
  openHref?: string;
};

const SECTION_KEY_PREFIX = "section::";
const GROUP_KEY_PREFIX = "group::";

export function adminNavSectionExpandKey(title: string): string {
  return `${SECTION_KEY_PREFIX}${title}`;
}

export function adminNavGroupExpandKey(
  sectionTitle: string,
  groupLabel: string,
): string {
  return `${GROUP_KEY_PREFIX}${sectionTitle}::${groupLabel}`;
}

export function adminNavEntryContainsPath(
  entry: AdminNavEntry,
  path: string,
): boolean {
  return entryContainsPath(entry, path);
}

function entryContainsPath(entry: AdminNavEntry, path: string): boolean {
  if (entry.type === "link") {
    if (entry.href === path) return true;
    // 「전체」(/general-laws)는 하위 분류 경로와 prefix 매칭하지 않음
    if (entry.href === GENERAL_LAWS_PORTAL_BASE) {
      return false;
    }
    if (entry.href !== "/ai" && path.startsWith(`${entry.href}/`)) {
      return true;
    }
    return false;
  }
  return entry.children.some((child) => entryContainsPath(child, path));
}

export function adminNavSectionContainsPath(
  section: AdminNavSection,
  path: string,
): boolean {
  return section.items.some((item) => entryContainsPath(item, path));
}

/** 사이드 메뉴: 대시보드 → API 호출 → 조회 → … → 관리 (메뉴 수정은 이 파일만 편집) */
export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    title: "홈",
    items: [
      {
        type: "link",
        href: "/ai",
        label: "홈",
        icon: "dashboard",
      },
    ],
  },
  {
    // 크롤러 관리 엑셀 「리스트」: 구분 ≠ 기존 · 매주최신화 대상 = Y
    title: "최신소식",
    items: [
      { type: "link", href: "/kctdi/trade-trends", label: "관세무역개발원[무역동향]", icon: "guidelines" },
      { type: "link", href: "/customs-law-portal/annex-forms", label: "관세법령정보포털[별표/서식]", icon: "table" },
      { type: "link", href: "/customs-law-portal/treaties", label: "관세법령정보포털[조약/협정]", icon: "book" },
      { type: "link", href: "/customs-law-portal/latest-laws", label: "관세법령정보포털[최신법령]", icon: "book" },
      {
        type: "link",
        href: "/customs-law-portal/admin-notices",
        label: "관세법령정보포털[행정예고]",
        icon: "guidelines",
      },
      { type: "link", href: "/kcs/press", label: "관세청[보도자료]", icon: "guidelines" },
      { type: "link", href: "/kcs/admin-notices", label: "관세청[행정예고]", icon: "guidelines" },
      { type: "link", href: "/law-info-center/latest-laws", label: "국가법령정보센터[최신법령]", icon: "book" },
      {
        type: "link",
        href: "/integrated-legislation-notice/ministry-legislation",
        label: "국민참여입법센터[(부처)입법예고]",
        icon: "gavel",
      },
      {
        type: "link",
        href: "/integrated-legislation-notice/ministry-administrative",
        label: "국민참여입법센터[(부처)행정예고]",
        icon: "gavel",
      },
      { type: "link", href: "/apqa/notices", label: "농림축산검역본부[공지사항]", icon: "guidelines" },
      { type: "link", href: "/gwanbo/search", label: "대한민국 전자관보[기본검색]", icon: "gavel" },
      { type: "link", href: "/motie/trade-news", label: "산업통상부[통상뉴스]", icon: "guidelines" },
      { type: "link", href: "/mfds/press", label: "식품의약품안전처[보도자료]", icon: "guidelines" },
      {
        type: "link",
        href: "/customs-law-portal/tax-tribunal-press",
        label: "조세심판원[보도자료]",
        icon: "guidelines",
      },
      {
        type: "link",
        href: "/customs-law-portal/tax-tribunal-cases",
        label: "조세심판원[조세심판사례]",
        icon: "gavel",
      },
      { type: "link", href: "/kotra/us-trade-policy", label: "KOTRA[미국통상정책]", icon: "guidelines" },
      { type: "link", href: "/kotra/trade-regulations", label: "KOTRA[통상규제]", icon: "guidelines" },
    ],
  },
  {
    title: "국가법령정보센터",
    items: [
      {
        type: "link",
        href: "/law-info-center/hs-change-notice",
        label: "품목분류변경고시",
        icon: "gavel",
      },
    ],
  },
  {
    title: "법령/행정규칙 현황",
    items: [
      {
        type: "link",
        href: "/ai",
        label: "법령/행정규칙 현황",
        icon: "dashboard",
      },
    ],
  },
  {
    title: "법령 및 행정규칙 조회",
    items: [
      {
        type: "link",
        href: "/openlaw-inquiry",
        label: "법령조회(OPEN API)",
        icon: "openlaw",
      },
      {
        type: "link",
        href: "/admin-rules-inquiry-sqlite",
        label: "행정규칙(SQLiteDB)",
        icon: "database",
      },
      {
        type: "link",
        href: "/admin-rule-rag",
        label: "행정규칙 AI 검색",
        icon: "ai",
      },
      {
        type: "link",
        href: "/law-langchain-chat",
        label: "LangChain 채팅",
        icon: "chat",
      },
    ],
  },
  {
    title: "관세법령정보포털",
    items: [
      {
        type: "group",
        label: "법령.판례 등",
        children: [
          {
            type: "group",
            label: "일반법령",
            children: GENERAL_LAW_PORTAL_CATEGORIES.map((cat) => ({
              type: "link" as const,
              href: generalLawPortalHref(cat.slug),
              label: cat.label,
              icon: "book" as AdminNavIconName,
            })),
          },
          {
            type: "link",
            href: "/customs-law-portal/admin-rules",
            label: "행정규칙",
            icon: "portal",
          },
          {
            type: "link",
            href: "/customs-law-portal/precedents",
            label: "판례/결정례",
            icon: "gavel",
          },
          {
            type: "link",
            href: "/customs-law-portal/inquiry-replies",
            label: "질의회신",
            icon: "inquiry",
          },
        ],
      },
      {
        type: "group",
        label: "납세/환급정보",
        children: CLIP_TAX_REFUND_INFO_ITEMS.map((item) => ({
          type: "link" as const,
          href: clipTaxRefundInfoHref(item.slug),
          label: item.label,
          icon: "tariff" as AdminNavIconName,
        })),
      },
      {
        type: "group",
        label: "통관정보",
        children: CLIP_CLEARANCE_INFO_ITEMS.map((item) => ({
          type: "link" as const,
          href: clipClearanceInfoHref(item.slug),
          label: item.label,
          icon: "guidelines" as AdminNavIconName,
        })),
      },
      {
        type: "group",
        label: "사전세액심사",
        children: CLIP_PRIOR_TAX_REVIEW_ITEMS.map((item) => ({
          type: "link" as const,
          href: clipPriorTaxReviewHref(item.slug),
          label: item.label,
          icon: "tariff" as AdminNavIconName,
        })),
      },
      {
        type: "group",
        label: "HS정보",
        children: [
          {
            type: "link",
            href: "/item-classification/quick-reference",
            label: "속견표",
            icon: "table",
          },
          {
            type: "link",
            href: "/item-classification/hs-explanatory",
            label: "HS해설서",
            icon: "book",
          },
          {
            type: "link",
            href: "/item-classification/tariff-schedule",
            label: "관세율표",
            icon: "tariff",
          },
          {
            type: "link",
            href: "/item-classification/world-hs-revision",
            label: "세계HS개정표",
            icon: "table",
          },
          {
            type: "link",
            href: "/item-classification/world-hs-classification-cases",
            label: "품목분류사례",
            icon: "cases",
          },
          {
            type: "link",
            href: "/item-classification/domestic-cases",
            label: "품목분류 국내사례",
            icon: "cases",
          },
          {
            type: "link",
            href: "/item-classification/foreign-cases",
            label: "품목분류 외국사례",
            icon: "cases",
          },
        ],
      },
    ],
  },
  {
    title: "FTA포털",
    items: [
      {
        type: "link",
        href: "/item-classification/fta-general-materials",
        label: "일반자료",
        icon: "book",
      },
      {
        type: "link",
        href: "/item-classification/fta-execution-guidance",
        label: "집행지침",
        icon: "guidelines",
      },
      {
        type: "link",
        href: "/item-classification/origin-criteria",
        label: "협정별 원산지결정기준",
        icon: "origin",
      },
      {
        type: "link",
        href: "/item-classification/origin-criteria-abbr",
        label: "원산지결정기준",
        icon: "origin",
      },
      {
        type: "link",
        href: "/item-classification/fta-agreement-rates",
        label: "협정별세율정보",
        icon: "tariff",
      },
      {
        type: "link",
        href: "/item-classification/origin-certificate-forms",
        label: "원산지증명서 서식",
        icon: "guidelines",
      },
    ],
  },
  {
    title: "한국무역협회(KRTA)",
    items: [
      {
        type: "link",
        href: "/kita/strategic-material",
        label: "전략물자HS",
        icon: "guidelines",
      },
    ],
  },
  {
    title: "전략물자관리시스템",
    items: [
      {
        type: "link",
        href: "/kita/system-guidance",
        label: "전략물자제도안내",
        icon: "book",
      },
      {
        type: "link",
        href: "/kita/compliance-trader",
        label: "자율준수무역거래자",
        icon: "list",
      },
      {
        type: "link",
        href: "/kita/dual-use",
        label: "이중용도",
        icon: "guidelines",
      },
    ],
  },
  {
    title: "CAS/NCOM API 호출",
    items: [
      {
        type: "link",
        href: "/cas-ncom/import-performance",
        label: "수입실적조회",
        icon: "importStats",
      },
      {
        type: "link",
        href: "/cas-ncom/export-performance",
        label: "수출실적조회",
        icon: "exportStats",
      },
      {
        type: "link",
        href: "/cas-ncom/import-item-master",
        label: "수입품목마스터",
        icon: "importCatalog",
      },
      {
        type: "link",
        href: "/cas-ncom/export-item-master",
        label: "수출품목마스터",
        icon: "exportCatalog",
      },
      {
        type: "link",
        href: "/cas-ncom/refund-import-ledger",
        label: "환급-수입원장",
        icon: "ledger",
      },
      {
        type: "link",
        href: "/cas-api/3m-sap-if",
        label: "3M SAP I/F",
        icon: "integration",
      },
    ],
  },
  {
    title: "이력 조회",
    items: [
      {
        type: "link",
        href: "/gateway-audit-log",
        label: "API사용로그",
        icon: "log",
      },
      {
        type: "link",
        href: "/law-detail-json",
        label: "저장 법령·조문 JSON",
        icon: "json",
      },
      {
        type: "link",
        href: "/law-search-list",
        label: "현행법령(시행일) 목록",
        icon: "list",
      },
      {
        type: "link",
        href: "/law-eflaw-josub-records",
        label: "조항호목 저장 이력",
        icon: "history",
      },
    ],
  },
  {
    title: "통계부호",
    items: [
      {
        type: "link",
        href: "/item-classification/statistical-code",
        label: "통계부호",
        icon: "table",
      },
    ],
  },
  {
    title: "씨엘SITE",
    items: [
      {
        type: "link",
        href: "/cl-site/trade-guidelines",
        label: "수출입요령",
        icon: "guidelines",
      },
      {
        type: "link",
        href: "/cl-site/fta-agreement-tariff",
        label: "FTA협정관세",
        icon: "tariff",
      },
    ],
  },
  {
    title: "관리",
    items: [
      {
        type: "link",
        href: "/system-dev-status",
        label: "시스템관리현황",
        icon: "table",
      },
      {
        type: "group",
        label: "API 관리",
        children: [
          {
            type: "link",
            href: "/api-management",
            label: "API 목록",
            icon: "settings",
          },
          {
            type: "link",
            href: "/api-call",
            label: "법령 본문 API",
            icon: "api",
          },
          {
            type: "link",
            href: "/admin-rules-crawl",
            label: "행정규칙크롤링",
            icon: "crawl",
          },
        ],
      },
      {
        type: "link",
        href: "/api-option-management",
        label: "구분·분류 관리",
        icon: "tags",
      },
      {
        type: "link",
        href: "/crawler-management",
        label: "크롤러 관리",
        icon: "crawl",
      },
      {
        type: "link",
        href: "/admin-users",
        label: "관리자 등록",
        icon: "settings",
        requiredRole: "admin",
      },
    ],
  },
];

function collectGroupExpandKeys(
  sectionTitle: string,
  entry: AdminNavEntry,
  path: string,
  parentLabel: string,
  keys: string[],
): void {
  if (entry.type !== "group" || !entryContainsPath(entry, path)) return;
  const labelPath = parentLabel
    ? `${parentLabel}::${entry.label}`
    : entry.label;
  keys.push(adminNavGroupExpandKey(sectionTitle, labelPath));
  for (const child of entry.children) {
    collectGroupExpandKeys(sectionTitle, child, path, labelPath, keys);
  }
}

export function collectAdminNavAutoExpandKeys(path: string): string[] {
  const keys: string[] = [];
  for (const section of ADMIN_NAV_SECTIONS) {
    if (!adminNavSectionContainsPath(section, path)) continue;
    keys.push(adminNavSectionExpandKey(section.title));
    for (const item of section.items) {
      collectGroupExpandKeys(section.title, item, path, "", keys);
    }
  }
  // 일반법령 경로면 하위 그룹도 펼침
  if (isGeneralLawsPortalPath(path)) {
    keys.push(
      adminNavGroupExpandKey("관세법령정보포털", "법령.판례 등::일반법령"),
    );
  }
  return keys;
}
