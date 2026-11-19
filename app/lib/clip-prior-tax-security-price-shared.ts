export type ClipPriorTaxSecurityPriceSortKey =
  | "seq_no"
  | "std_code"
  | "std_item_name"
  | "std_spec"
  | "security_price_usd";

export const CLIP_PRIOR_TAX_SECURITY_PRICE_SORT_KEYS: ClipPriorTaxSecurityPriceSortKey[] =
  [
    "seq_no",
    "std_code",
    "std_item_name",
    "std_spec",
    "security_price_usd",
  ];

export type ClipPriorTaxSecurityPriceListRow = {
  id: number;
  seq_no: number;
  std_code: string;
  hs_code: string;
  hs_code_display: string;
  std_item_name: string;
  std_spec: string;
  security_price_usd: number;
  security_price_display: string;
};

export type ClipPriorTaxSecurityPriceQueryParams = {
  page: number;
  pageSize: number;
  baseDate?: string;
  hsCode?: string;
  itemName?: string;
  sort?: string;
  sort_dir?: string;
};

/** CLIP 담보기준가격 기본 기준일자 (매월 1일·16일 게시) */
export const DEFAULT_CLIP_PRIOR_TAX_SECURITY_PRICE_BASE_DATE = "2026-09-01";

/** 담보기준가격 게시 기준일 — 매월 1일·16일 중 해당 일의 최근 게시일 */
export function resolveClipPriorTaxSecurityPriceBaseDate(
  reference: Date | string = new Date(),
): string {
  let y: number;
  let m: number;
  let day: number;
  if (typeof reference === "string") {
    const parts = reference.trim().split("-").map((v) => Number(v));
    y = parts[0] ?? 0;
    m = parts[1] ?? 0;
    day = parts[2] ?? 0;
  } else {
    y = reference.getFullYear();
    m = reference.getMonth() + 1;
    day = reference.getDate();
  }
  if (!y || !m || !day) {
    return resolveClipPriorTaxSecurityPriceBaseDate(new Date());
  }
  const mm = String(m).padStart(2, "0");
  const pubDay = day >= 16 ? "16" : "01";
  return `${y}-${mm}-${pubDay}`;
}
