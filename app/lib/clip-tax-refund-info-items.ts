/** CLIP 관세정보포털 · 납세/환급정보 메뉴 (통관정보 ↔ HS정보 사이) */
export type ClipTaxRefundInfoItem = {
  slug: string;
  label: string;
  /** 전용 페이지 (관세율 그리드 등) */
  dedicatedPage?: boolean;
  /** ntx_page.section_code — 종합정보 본문 */
  ntxSection?: string;
  /** 관세환급 등 하위 탭 */
  ntxTabs?: { key: string; label: string; section: string }[];
  /** ciel.db menu_list.title — 있으면 수출입요령 뷰로 연결 */
  cielTitle?: string;
};

export const CLIP_TARIFF_RATE_COMPOSITE_SECTION = "TARIFF_COMPOSITE";

export const CLIP_TAX_REFUND_INFO_ITEMS: ClipTaxRefundInfoItem[] = [
  { slug: "tariff-rate", label: "관세율", dedicatedPage: true },
  {
    slug: "tariff-reduction",
    label: "관세감면",
    ntxSection: "CUSTOMS_REDUCTION",
  },
  {
    slug: "installment",
    label: "분할납부",
    ntxSection: "INSTALLMENT_PAYMENT",
  },
  {
    slug: "tariff-refund",
    label: "관세환급",
    ntxTabs: [
      {
        key: "export-support",
        label: "수출지원 관세환급",
        section: "REFUND_EXPORT_SUPPORT",
      },
      {
        key: "overpayment",
        label: "과오납환급",
        section: "REFUND_OVERPAYMENT",
      },
      {
        key: "contract-diff",
        label: "계약상이환급",
        section: "REFUND_CONTRACT_DIFFERENCE",
      },
    ],
  },
  { slug: "additional-tax", label: "가산세", ntxSection: "SURCHARGE" },
  { slug: "internal-tax", label: "내국세", ntxSection: "DOMESTIC_TAX" },
];

export const CLIP_TAX_REFUND_INFO_BY_SLUG = Object.fromEntries(
  CLIP_TAX_REFUND_INFO_ITEMS.map((item) => [item.slug, item]),
) as Record<string, ClipTaxRefundInfoItem>;

export function clipTaxRefundInfoHref(slug: string): string {
  return `/customs-law-portal/tax-refund-info/${slug}`;
}
