export const CLIP_TREATY_CATEGORY_TABS = [
  "양자조약",
  "다자조약",
  "FTA협정",
  "세관상호지원협정",
] as const;

export type ClipTreatyCategoryTab = (typeof CLIP_TREATY_CATEGORY_TABS)[number];

export type ClipTreatyTabKey = "ALL" | ClipTreatyCategoryTab;

export const CLIP_TREATY_SORT_KEYS = [
  "treaty_name",
  "category_name",
  "countries",
  "treaty_number",
  "effective_date",
] as const;

export type ClipTreatySortKey = (typeof CLIP_TREATY_SORT_KEYS)[number];

export type ClipTreatyTabCounts = Record<ClipTreatyTabKey, number>;

export type ClipTreatyListRow = {
  trty_srno: string;
  treaty_name: string;
  category_name: string;
  countries: string;
  treaty_number: string;
  effective_date: string;
};

export type ClipTreatyAttachmentRow = {
  attachment_id: string;
  file_name: string;
  displayed_size: string;
  download_status: string;
  relative_path: string | null;
};

/** FTA 협정서 추출 본문 (clip_fta_agreement_doc) — 국가별 참조 링크용 */
export type ClipFtaAgreementDocSummary = {
  doc_id: number;
  trty_srno: string;
  treaty_number: string;
  treaty_name: string;
  countries: string;
  primary_country: string;
  lang: string;
  file_name: string;
  page_count: number;
  content_chars: number;
  extract_status: string;
};

export type ClipFtaAgreementDocDetail = ClipFtaAgreementDocSummary & {
  attachment_id: string;
  content_text: string;
  relative_path: string | null;
  effective_date: string;
  source_url: string;
};

export type ClipTreatyDetail = {
  trty_srno: string;
  treaty_name: string;
  category_name: string;
  countries: string;
  treaty_number: string;
  effective_date: string;
  registered_date: string;
  korean_content: string;
  english_content: string;
  detail_text: string;
  source_url: string;
  attachments: ClipTreatyAttachmentRow[];
  /** FTA 첨부로 추출된 협정서 본문 목록 (국가별 참조용) */
  agreement_docs: ClipFtaAgreementDocSummary[];
};

export type ClipTreatyQueryParams = {
  page: number;
  pageSize: number;
  tab: ClipTreatyTabKey;
  treatyName: string;
  countryName: string;
  sort: string | null | undefined;
  sort_dir: string | null | undefined;
};
