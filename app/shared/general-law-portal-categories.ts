/** 관세법령정보포털 · 일반법령 분류 탭 (원본 포털 순서) */
export const GENERAL_LAW_PORTAL_CATEGORIES = [
  { slug: "all", label: "전체", rawGubun: null },
  { slug: "관세관련", label: "관세관련", rawGubun: "관세법령" },
  { slug: "무역관련", label: "무역관련", rawGubun: "무역법령" },
  { slug: "외국환관련", label: "외국환관련", rawGubun: "외국환법령" },
  { slug: "세관장확인", label: "세관장확인관련", rawGubun: "세관장확인법령" },
  { slug: "통합공고", label: "통합공고관련", rawGubun: "통합공고법령" },
  { slug: "내국세관련", label: "내국세관련", rawGubun: "내국세법령" },
  { slug: "행정관련", label: "행정관련", rawGubun: "행정법령" },
] as const;

export type GeneralLawPortalCategorySlug =
  (typeof GENERAL_LAW_PORTAL_CATEGORIES)[number]["slug"];

/** 이전 URL slug 호환 */
const PORTAL_CATEGORY_SLUG_ALIASES: Record<string, GeneralLawPortalCategorySlug> =
  {
    세관장확인관련: "세관장확인",
    통합공고관련: "통합공고",
  };

export function generalLawPortalHref(slug: GeneralLawPortalCategorySlug): string {
  if (slug === "all") return "/customs-law-portal/general-laws";
  return `/customs-law-portal/general-laws/${encodeURIComponent(slug)}`;
}

/** iframe 본문용 (`AdminShell` 탭) */
export function generalLawPortalEmbedHref(
  slug: GeneralLawPortalCategorySlug,
): string {
  return `${generalLawPortalHref(slug)}?embed=1`;
}

/** AdminShell 상단 탭 — 일반법령 분류는 단일 탭으로 묶음 */
export const GENERAL_LAWS_PORTAL_BASE = "/customs-law-portal/general-laws";

export function isGeneralLawsPortalPath(path: string): boolean {
  return (
    path === GENERAL_LAWS_PORTAL_BASE ||
    path.startsWith(`${GENERAL_LAWS_PORTAL_BASE}/`)
  );
}

export function normalizeAdminTabKey(pathname: string): string {
  if (isGeneralLawsPortalPath(pathname)) return GENERAL_LAWS_PORTAL_BASE;
  return pathname;
}

export function parseGeneralLawPortalCategory(
  raw: string | undefined,
): GeneralLawPortalCategorySlug {
  if (!raw || raw === "all") return "all";
  const decoded = decodeURIComponent(raw);
  const aliased = PORTAL_CATEGORY_SLUG_ALIASES[decoded] ?? decoded;
  const found = GENERAL_LAW_PORTAL_CATEGORIES.find((c) => c.slug === aliased);
  return found?.slug ?? "all";
}

export function generalLawPortalCategoryLabel(
  slug: GeneralLawPortalCategorySlug,
): string {
  return (
    GENERAL_LAW_PORTAL_CATEGORIES.find((c) => c.slug === slug)?.label ?? "전체"
  );
}

/** UI 분류 탭 → raw_rule.db `gubun` 컬럼 값 */
export function portalCategoryToRawGubun(
  slug: GeneralLawPortalCategorySlug,
): string | null {
  const item = GENERAL_LAW_PORTAL_CATEGORIES.find((c) => c.slug === slug);
  return item?.rawGubun ?? null;
}

/** raw `gubun` → UI 분류 slug (역매핑) */
export function rawGubunToPortalCategory(
  rawGubun: string,
): GeneralLawPortalCategorySlug | null {
  const g = rawGubun.trim();
  const item = GENERAL_LAW_PORTAL_CATEGORIES.find((c) => c.rawGubun === g);
  return item?.slug ?? null;
}
