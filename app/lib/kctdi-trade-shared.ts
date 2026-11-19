/** 한국관세무역개발원 · [일간] 국내 관세무역동향 — kctdi_trade_articles / kctdi_trade_attachments */

export type KctdiTradeAttachRow = {
  fileKey: string;
  fileName: string;
  downloadUrl: string | null;
  sizeBytes: number;
  fileApiUrl: string | null;
};

export type KctdiTradeListRow = {
  articleNo: string;
  boardNumber: string | null;
  title: string;
  writer: string | null;
  registeredDate: string | null;
  sourceUrl: string | null;
  attachmentCount: number;
};

export type KctdiTradeDetail = KctdiTradeListRow & {
  contentText: string;
  contentHtml: string;
  attachments: KctdiTradeAttachRow[];
};

/** 관세무역개발원 원문 검색구분 */
export type KctdiTradeSearchField = "all" | "title" | "content";

export const KCTDI_TRADE_SEARCH_FIELDS: {
  value: KctdiTradeSearchField;
  label: string;
}[] = [
  { value: "all", label: "전체" },
  { value: "title", label: "제목" },
  { value: "content", label: "내용" },
];

export type KctdiTradeQueryParams = {
  page: number;
  pageSize: number;
  keyword?: string;
  searchField?: string;
  dateFrom?: string;
  dateTo?: string;
};
