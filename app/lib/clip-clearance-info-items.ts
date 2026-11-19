/** CLIP 관세정보포털 · 통관정보 메뉴 (법령·판례 등 ↔ HS정보 사이) */
export type ClipClearanceInfoItem = {
  slug: string;
  label: string;
  /** ciel.db menu_list.title — 있으면 수출입요령 뷰로 연결 */
  cielTitle?: string;
};

export const CLIP_CLEARANCE_INFO_ITEMS: ClipClearanceInfoItem[] = [
  {
    slug: "customs-chief",
    label: "세관장확인사항",
  },
  { slug: "integrated-notice", label: "통합공고" },
  { slug: "import-export-notice", label: "수출입공고" },
  { slug: "origin", label: "원산지" },
  { slug: "intellectual-property", label: "지식재산권" },
  { slug: "inter-korean-trade", label: "남북한교역" },
  { slug: "strategic-goods", label: "전략물자" },
  { slug: "hs-import-guide", label: "HS별 품명·규격 수입신고 가이드" },
  { slug: "standard-product-code", label: "표준품명/규격코드" },
];

export const CLIP_CLEARANCE_INFO_BY_SLUG = Object.fromEntries(
  CLIP_CLEARANCE_INFO_ITEMS.map((item) => [item.slug, item]),
) as Record<string, ClipClearanceInfoItem>;

export function clipClearanceInfoHref(slug: string): string {
  return `/customs-law-portal/clearance-info/${slug}`;
}
