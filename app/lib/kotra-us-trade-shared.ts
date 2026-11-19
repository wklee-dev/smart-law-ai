/** KOTRA 해외시장뉴스 · 미국통상정책 — kotra_us_trade_* */

export type KotraUsTradeSortKey = "published_date" | "title" | "office";

export const KOTRA_US_TRADE_SORT_KEYS: KotraUsTradeSortKey[] = [
  "published_date",
  "title",
  "office",
];

export type KotraUsTradeListRow = {
  articleId: string;
  listNumber: number | null;
  title: string;
  publishedDate: string | null;
  author: string | null;
  office: string | null;
  keywords: string[];
  summary: string | null;
  sourceUrl: string | null;
  attachmentCount: number;
};

export type KotraUsTradeAttachRow = {
  fileId: string;
  fileName: string;
  downloadUrl: string | null;
  localPath: string | null;
  status: string;
  fileApiUrl: string | null;
};

export type KotraUsTradeDetail = KotraUsTradeListRow & {
  contentText: string;
  contentHtml: string;
  attachments: KotraUsTradeAttachRow[];
};

export type KotraUsTradeQueryParams = {
  page: number;
  pageSize: number;
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  sort_dir?: string;
};
