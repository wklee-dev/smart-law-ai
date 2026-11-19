/** 관세청 알림·소식 · 공지사항 · 보도자료 — kcs_press_*_v1 */

export type KcsPressSortKey =
  | "list_number"
  | "category"
  | "title"
  | "writer"
  | "published_date"
  | "view_count";

export const KCS_PRESS_SORT_KEYS: KcsPressSortKey[] = [
  "list_number",
  "category",
  "title",
  "writer",
  "published_date",
  "view_count",
];

export type KcsPressListRow = {
  nttSn: string;
  listNumber: number | null;
  category: string | null;
  title: string;
  writer: string | null;
  publishedDate: string | null;
  viewCount: number | null;
  sourceUrl: string | null;
  attachmentCount: number;
};

export type KcsPressAttachRow = {
  attachId: number;
  fileKey: string;
  fileName: string;
  downloadUrl: string | null;
  localPath: string | null;
  sizeBytes: number;
  status: string;
  fileApiUrl: string | null;
};

export type KcsPressDetail = KcsPressListRow & {
  contentText: string;
  contentHtml: string;
  attachments: KcsPressAttachRow[];
};

/** 관세청 원문 검색구분: 제목+내용 / 제목 / 내용 / 작성자 */
export type KcsPressSearchField = "all" | "title" | "content" | "writer";

export const KCS_PRESS_SEARCH_FIELDS: {
  value: KcsPressSearchField;
  label: string;
}[] = [
  { value: "all", label: "제목+내용" },
  { value: "title", label: "제목" },
  { value: "content", label: "내용" },
  { value: "writer", label: "작성자" },
];

export type KcsPressQueryParams = {
  page: number;
  pageSize: number;
  keyword?: string;
  searchField?: string;
  category?: string;
  sort?: string;
  sort_dir?: string;
};
