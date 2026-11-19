/** CLIP 관세정보포털 · 사전세액심사 (통관정보 ↔ HS정보 사이) */
export type ClipPriorTaxReviewItem = {
  slug: string;
  label: string;
};

export const CLIP_PRIOR_TAX_REVIEW_ITEMS: ClipPriorTaxReviewItem[] = [
  { slug: "subject-goods", label: "대상물품현황" },
  { slug: "security-price", label: "담보기준가격" },
];

export const CLIP_PRIOR_TAX_REVIEW_BY_SLUG = Object.fromEntries(
  CLIP_PRIOR_TAX_REVIEW_ITEMS.map((item) => [item.slug, item]),
) as Record<string, ClipPriorTaxReviewItem>;

export function clipPriorTaxReviewHref(
  slug: string,
  options?: { embed?: boolean },
): string {
  const base = `/customs-law-portal/prior-tax-review/${slug}`;
  return options?.embed ? `${base}?embed=1` : base;
}
