/** 산업통상부 FTA 포털 · 통상뉴스(주요동향) — fta_trade_news_articles / fta_trade_news_assets */

export type FtaTradeNewsAttachRow = {
  assetKey: string;
  fileName: string;
  kind: string;
  downloadUrl: string | null;
  sizeBytes: number;
  status: string;
  fileApiUrl: string | null;
};

export type FtaTradeNewsListRow = {
  articleId: string;
  title: string;
  registeredDate: string | null;
  viewCount: number | null;
  sourceUrl: string | null;
  attachmentCount: number;
};

export type FtaTradeNewsDetail = FtaTradeNewsListRow & {
  contentText: string;
  contentHtml: string;
  attachments: FtaTradeNewsAttachRow[];
};

/** FTA 포털 원문 검색구분 */
export type FtaTradeNewsSearchField = "all" | "title" | "content";

export const FTA_TRADE_NEWS_SEARCH_FIELDS: {
  value: FtaTradeNewsSearchField;
  label: string;
}[] = [
  { value: "all", label: "전체" },
  { value: "title", label: "제목" },
  { value: "content", label: "내용" },
];

export type FtaTradeNewsQueryParams = {
  page: number;
  pageSize: number;
  keyword?: string;
  searchField?: string;
  dateFrom?: string;
  dateTo?: string;
};
