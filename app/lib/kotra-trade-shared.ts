/** KOTRA 해외시장뉴스 · 통상·규제 — kotra_trade_articles / kotra_trade_attachments */

export type KotraTradeSortKey = "published_date" | "title" | "country";

export const KOTRA_TRADE_SORT_KEYS: KotraTradeSortKey[] = [
  "published_date",
  "title",
  "country",
];

export type KotraTradeListRow = {
  sourceId: string;
  listNumber: number | null;
  title: string;
  category: string | null;
  country: string | null;
  office: string | null;
  publishedDate: string | null;
  summary: string | null;
  keywords: string[];
  sourceUrl: string | null;
  attachmentCount: number;
  thumbUrl: string | null;
};

export type KotraTradeAttachRow = {
  fileId: string;
  fileName: string;
  downloadUrl: string | null;
  localPath: string | null;
  sizeBytes: number;
  status: string;
  fileApiUrl: string | null;
};

export type KotraTradeDetail = KotraTradeListRow & {
  source: string | null;
  contentText: string;
  contentHtml: string;
  attachments: KotraTradeAttachRow[];
};

export type KotraTradeQueryParams = {
  page: number;
  pageSize: number;
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
  country?: string;
  sort?: string;
  sort_dir?: string;
};
