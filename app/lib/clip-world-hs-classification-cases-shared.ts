export type ClipWorldHsClassificationCaseSortKey =
  | "registered_date"
  | "view_count"
  | "title";

export const CLIP_WORLD_HS_CLASSIFICATION_CASE_SORT_KEYS: ClipWorldHsClassificationCaseSortKey[] =
  ["registered_date", "view_count", "title"];

export type ClipWorldHsClassificationCaseListRow = {
  case_id: string;
  title: string;
  country: string;
  effective_period: string;
  registered_date: string;
  view_count: number;
};

export type ClipWorldHsClassificationCaseAttachment = {
  attachment_id: string;
  original_file_name: string;
  displayed_size: string;
  has_local_file: boolean;
};

export type ClipWorldHsClassificationCaseDetail = {
  case_id: string;
  title: string;
  country: string;
  effective_period: string;
  registered_date: string;
  registered_by: string;
  view_count: number;
  content_html: string;
  content_text: string;
  source_url: string;
  attachments: ClipWorldHsClassificationCaseAttachment[];
};

export type ClipWorldHsClassificationCaseQueryParams = {
  page: number;
  pageSize: number;
  registeredFrom?: string;
  registeredTo?: string;
  country?: string;
  effectivePeriod?: string;
  keyword?: string;
  keywordField?: string;
  sort?: string;
  sort_dir?: string;
};

/** CLIP 품목분류사례 목록 — 국가명 → 국기 코드 */
export const CLIP_WORLD_HS_CLASSIFICATION_COUNTRY_FLAG: Record<string, string> =
  {
    일본: "jp",
    중국: "cn",
    미국: "us",
    캐나다: "ca",
    영국: "gb",
    유럽연합: "eu",
    스위스: "ch",
    호주: "au",
    싱가포르: "sg",
    태국: "th",
    대만: "tw",
    칠레: "cl",
    필리핀: "ph",
  };
