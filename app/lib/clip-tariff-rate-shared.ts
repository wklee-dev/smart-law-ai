export type ClipTariffRateSortKey =
  | "tariff_category"
  | "hs_code"
  | "item_name"
  | "category_symbol"
  | "tariff_rate"
  | "amount_per_unit"
  | "effective_start_date"
  | "effective_end_date";

export const CLIP_TARIFF_RATE_SORT_KEYS: ClipTariffRateSortKey[] = [
  "tariff_category",
  "hs_code",
  "item_name",
  "category_symbol",
  "tariff_rate",
  "amount_per_unit",
  "effective_start_date",
  "effective_end_date",
];

export type ClipTariffRateListRow = {
  id: number;
  tariff_category: string;
  hs_code: string;
  hs_code_display: string;
  item_name: string;
  category_symbol: string;
  tariff_rate: string;
  amount_per_unit: string;
  effective_start_date: string;
  effective_end_date: string;
};

export type ClipTariffRateQueryParams = {
  page: number;
  pageSize: number;
  hsCode?: string;
  itemName?: string;
  hsSection?: string;
  includeHistory?: boolean;
  sort?: string;
  sort_dir?: string;
};
