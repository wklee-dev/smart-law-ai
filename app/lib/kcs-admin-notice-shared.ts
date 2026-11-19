/** 관세청 행정규칙 행정예고 — customs_admin_notice* */

export type KcsAdminNoticeSortKey =
  | "seq_no"
  | "title"
  | "writer"
  | "reg_date"
  | "view_count";

export const KCS_ADMIN_NOTICE_SORT_KEYS: KcsAdminNoticeSortKey[] = [
  "seq_no",
  "title",
  "writer",
  "reg_date",
  "view_count",
];

export type KcsAdminNoticeListRow = {
  id: number;
  nttSn: string;
  seqNo: number | null;
  title: string;
  writer: string | null;
  regDate: string | null;
  viewCount: number | null;
  sourceUrl: string | null;
  attachmentCount: number;
};

export type KcsAdminNoticeAttachRow = {
  attachId: number;
  fileKey: string;
  fileName: string;
  downloadUrl: string | null;
  localPath: string | null;
  sizeBytes: number;
  status: string;
  fileApiUrl: string | null;
};

export type KcsAdminNoticeDetail = KcsAdminNoticeListRow & {
  contentText: string;
  contentHtml: string;
  attachments: KcsAdminNoticeAttachRow[];
};

/** 관세청 원문 검색구분: 제목+내용 / 제목 / 내용 / 작성자 */
export type KcsAdminNoticeSearchField = "all" | "title" | "content" | "writer";

export const KCS_ADMIN_NOTICE_SEARCH_FIELDS: {
  value: KcsAdminNoticeSearchField;
  label: string;
}[] = [
  { value: "all", label: "제목+내용" },
  { value: "title", label: "제목" },
  { value: "content", label: "내용" },
  { value: "writer", label: "작성자" },
];

export type KcsAdminNoticeQueryParams = {
  page: number;
  pageSize: number;
  title?: string;
  keyword?: string;
  searchField?: string;
  writer?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  sort_dir?: string;
};
