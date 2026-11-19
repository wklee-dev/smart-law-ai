/** CLIP 최신법령 — 클라이언트·서버 공용 */

export const CLIP_LATEST_LAW_TYPE_TABS = [
  { code: "A01", label: "법률" },
  { code: "A02", label: "시행령" },
  { code: "A03", label: "시행규칙" },
] as const;

export type ClipLatestLawTypeCode =
  (typeof CLIP_LATEST_LAW_TYPE_TABS)[number]["code"];

export type ClipLatestLawTabCounts = {
  전체: number;
  법률: number;
  시행령: number;
  시행규칙: number;
};

export type ClipLatestLawListRow = {
  law_id: string;
  pmgt_dt_tp_no: string;
  law_name: string;
  category_name: string;
  law_type_name: string;
  jurisdiction_name: string;
  enforcement_date: string;
  promulgation_date: string;
  revision_type_name: string;
  detail_url: string;
};

export const CLIP_LATEST_LAW_SORT_KEYS = [
  "law_name",
  "category_name",
  "law_type_name",
  "jurisdiction_name",
  "enforcement_date",
  "promulgation_date",
  "revision_type_name",
] as const;

export type ClipLatestLawSortKey =
  (typeof CLIP_LATEST_LAW_SORT_KEYS)[number];

export type ClipLatestLawQueryParams = {
  page: number;
  pageSize: number;
  lawTypeTab: "" | "ALL" | ClipLatestLawTypeCode;
  category: string;
  jurisdiction: string;
  lawName: string;
  sort: string | undefined;
  sort_dir: string | undefined;
};

export type ClipLatestLawAttachmentRow = {
  attachment_id: string;
  attachment_label: string;
  attachment_kind: string;
  original_filename: string;
  byte_size: number;
  has_local_file: boolean;
};

export type ClipLatestLawDetail = ClipLatestLawListRow & {
  law_body_html: string;
  law_body_text: string;
  revision_reason_html: string;
  attachments: ClipLatestLawAttachmentRow[];
};

export function clipLatestLawRowKey(
  lawId: string,
  pmgtDtTpNo: string,
): string {
  return `${lawId.trim()}:${pmgtDtTpNo.trim()}`;
}

export function parseClipLatestLawRowKey(raw: string): {
  law_id: string;
  pmgt_dt_tp_no: string;
} | null {
  const i = raw.indexOf(":");
  if (i <= 0) return null;
  const law_id = raw.slice(0, i).trim();
  const pmgt_dt_tp_no = raw.slice(i + 1).trim();
  if (!law_id || !pmgt_dt_tp_no) return null;
  return { law_id, pmgt_dt_tp_no };
}
