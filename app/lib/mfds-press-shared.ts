/** 식품의약품안전처 알림 · 보도자료 — mfds_press_articles / mfds_press_attachments */

export type MfdsPressAttachRow = {
  fileSeq: number;
  fileName: string;
  downloadUrl: string | null;
  sizeBytes: number;
  status: string;
  fileApiUrl: string | null;
};

export type MfdsPressListRow = {
  seq: number;
  listNumber: string | null;
  isNotice: boolean;
  title: string;
  department: string | null;
  viewCount: string | null;
  publishedDate: string | null;
  sourceUrl: string | null;
  attachments: MfdsPressAttachRow[];
};

export type MfdsPressDetail = MfdsPressListRow & {
  contact: string | null;
  phone: string | null;
  contentText: string;
  contentHtml: string;
};

/** 식약처 원문 검색구분 */
export type MfdsPressSearchField = "title" | "content" | "all" | "department";

export const MFDS_PRESS_SEARCH_FIELDS: {
  value: MfdsPressSearchField;
  label: string;
}[] = [
  { value: "title", label: "제목" },
  { value: "content", label: "내용" },
  { value: "all", label: "제목+내용" },
  { value: "department", label: "담당부서" },
];

export type MfdsPressQueryParams = {
  page: number;
  pageSize: number;
  keyword?: string;
  searchField?: string;
  dateFrom?: string;
  dateTo?: string;
};
