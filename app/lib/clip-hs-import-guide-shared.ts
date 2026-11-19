export type ClipHsImportGuideSortKey =
  | "hs_code"
  | "product_name"
  | "source_updated_at";

export const CLIP_HS_IMPORT_GUIDE_SORT_KEYS: ClipHsImportGuideSortKey[] = [
  "hs_code",
  "product_name",
  "source_updated_at",
];

export type ClipHsImportGuideListRow = {
  hs_code: string;
  hs_code_display: string;
  product_name: string;
  registered_at: string;
};

export type ClipHsImportGuideDetail = {
  hs_code: string;
  hs_code_display: string;
  product_name: string;
  registered_at: string;
  name_guidance: string;
  name_example: string;
  name_error_example: string;
  transaction_name_guidance: string;
  transaction_name_example: string;
  transaction_name_error_example: string;
  model_spec_guidance: string;
  model_spec_example: string;
  model_spec_error_example: string;
  ingredient_guidance: string;
  ingredient_example: string;
  ingredient_error_example: string;
  import_requirement_guidance: string;
  import_requirement_example: string;
  import_requirement_error_example: string;
  declaration_caution: string;
  special_material: string;
  remarks: string;
  detail_url: string;
};

export type ClipHsImportGuideQueryParams = {
  page: number;
  pageSize: number;
  hsCode?: string;
  productName?: string;
  sort?: string;
  sort_dir?: string;
};

export type ClipHsImportGuidePdfInfo = {
  available: boolean;
  file_name: string;
  byte_size: number;
  download_status: string;
};
