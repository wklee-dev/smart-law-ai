export type ClipCustomsChiefTab = "items" | "integrated" | "guide";

export type ClipCustomsChiefImexFilter = "" | "E" | "I";

export type ClipCustomsChiefSortKey =
  | "hs_sgn"
  | "item_name"
  | "requirement_document_name"
  | "related_law_name"
  | "application_start_dt"
  | "application_end_dt"
  | "imex_name";

export const CLIP_CUSTOMS_CHIEF_SORT_KEYS: ClipCustomsChiefSortKey[] = [
  "hs_sgn",
  "item_name",
  "requirement_document_name",
  "related_law_name",
  "application_start_dt",
  "application_end_dt",
  "imex_name",
];

export type ClipCustomsChiefListRow = {
  requirement_id: number;
  hs_sgn: string;
  item_name: string;
  requirement_document_name: string;
  related_law_name: string;
  application_start_dt: string;
  application_end_dt: string;
  imex_name: string;
};

export type ClipCustomsChiefAgencyRow = {
  agency_id: number;
  application_start_dt: string;
  application_end_dt: string;
  agency_name: string;
};

export type ClipCustomsChiefDetail = ClipCustomsChiefListRow & {
  imex_tpcd: string;
  target_detail_text: string;
  extension_reason_text: string;
  law_record_no: string;
  agencies: ClipCustomsChiefAgencyRow[];
};

export type ClipCustomsChiefSectionRow = {
  section_order: number;
  section_title: string;
  section_level: string;
  body_html: string;
  body_text: string;
};

export type ClipCustomsChiefGuideDocRow = {
  guide_document_id: number;
  document_title: string;
  document_type: string;
  download_status: string;
  local_path: string | null;
  attachment_file_id: string | null;
};

export type ClipCustomsChiefQueryParams = {
  page: number;
  pageSize: number;
  hsCode?: string;
  requirementDoc?: string;
  relatedLaw?: string;
  imex?: ClipCustomsChiefImexFilter;
  includeHistory?: boolean;
  sort?: string;
  sort_dir?: string;
};

/** 품목번호 조회 — 구분기호 제거 후 숫자만 */
export function normalizeClipCustomsChiefHsQuery(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** 품목번호 입력·표시 (0101.21-1000) */
export function formatClipCustomsChiefHsSgn(
  hs: string | null | undefined,
  emptyLabel = "—",
): string {
  const d = normalizeClipCustomsChiefHsQuery(hs);
  if (!d) return emptyLabel;
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}-${d.slice(6)}`;
}

/** 조회조건 품목번호 — 입력 중 자동 양식 (최대 10자리) */
export function formatClipCustomsChiefHsInput(raw: string): string {
  const d = normalizeClipCustomsChiefHsQuery(raw).slice(0, 10);
  if (!d) return "";
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}-${d.slice(6)}`;
}

/** 적용일자 YYYYMMDD → YYYY-MM-DD */
export function formatClipCustomsChiefDate(
  ymd: string | null | undefined,
): string {
  const raw = (ymd ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const t = raw.replace(/\D/g, "");
  if (t.length === 8) {
    return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  }
  return raw;
}
