export type ClipStandardProductCodeSortKey =
  | "seq_no"
  | "std_code"
  | "item_name"
  | "std_item_name"
  | "std_spec";

export const CLIP_STANDARD_PRODUCT_CODE_SORT_KEYS: ClipStandardProductCodeSortKey[] =
  ["seq_no", "std_code", "item_name", "std_item_name", "std_spec"];

export type ClipStandardProductCodeListRow = {
  id: number;
  seq_no: number;
  std_code: string;
  hs_code: string;
  item_name: string;
  std_item_name: string;
  std_spec: string;
};

export type ClipStandardProductCodeQueryParams = {
  page: number;
  pageSize: number;
  hsCode?: string;
  itemName?: string;
  sort?: string;
  sort_dir?: string;
};
