/** 조세심판원 보도자료 — tt_press_* */

export type TtPressSortKey = "published_date" | "list_number" | "title";

export const TT_PRESS_SORT_KEYS: TtPressSortKey[] = [
  "published_date",
  "list_number",
  "title",
];

export type TtPressListRow = {
  postKey: string;
  sourceId: string;
  listNumber: number | null;
  title: string;
  publishedDate: string | null;
  sourceUrl: string | null;
  attachmentCount: number;
  status: string;
};

export type TtPressAttachRow = {
  attachmentKey: string;
  ordinal: number;
  originalFilename: string;
  downloadUrl: string | null;
  localPath: string | null;
  sizeBytes: number;
  status: string;
  fileApiUrl: string | null;
};

export type TtPressDetail = TtPressListRow & {
  contentText: string;
  contentHtml: string;
  attachments: TtPressAttachRow[];
};

export type TtPressQueryParams = {
  page: number;
  pageSize: number;
  title?: string;
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  sort_dir?: string;
};
