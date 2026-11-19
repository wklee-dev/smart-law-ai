/** 농림축산검역본부 공지사항 — qia_notice_posts */

export type QiaNoticeSortKey =
  | "posted_date"
  | "board_no"
  | "title"
  | "dept";

export const QIA_NOTICE_SORT_KEYS: QiaNoticeSortKey[] = [
  "posted_date",
  "board_no",
  "title",
  "dept",
];

export type QiaNoticeListRow = {
  postId: string;
  boardNo: string | null;
  title: string;
  dept: string | null;
  writer: string | null;
  postedDate: string | null;
  views: string | null;
  sourceUrl: string | null;
  attachmentCount: number;
};

export type QiaNoticeAttachRow = {
  fileId: string;
  name: string;
  downloadUrl: string | null;
  localPath: string | null;
  sizeBytes: number;
  status: string;
  fileApiUrl: string | null;
};

export type QiaNoticeDetail = QiaNoticeListRow & {
  contentText: string;
  contentHtml: string;
  attachments: QiaNoticeAttachRow[];
};

export type QiaNoticeQueryParams = {
  page: number;
  pageSize: number;
  title?: string;
  keyword?: string;
  dept?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  sort_dir?: string;
};
