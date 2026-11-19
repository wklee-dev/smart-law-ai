/** 대한민국 전자관보 품목분류 고시 — TB_GWANBO_* */

/** 전자관보 기본검색 검색구분 */
export type GwanboSearchField = "title" | "body" | "all";

export const GWANBO_SEARCH_FIELDS: { value: GwanboSearchField; label: string }[] =
  [
    { value: "title", label: "제목" },
    { value: "body", label: "본문" },
    { value: "all", label: "제목+본문" },
  ];

export type GwanboSortKey = "reg_date" | "ofctt_num" | "title";

export const GWANBO_SORT_KEYS: GwanboSortKey[] = [
  "reg_date",
  "ofctt_num",
  "title",
];

export type GwanboNoticeListRow = {
  noticeId: string;
  categoryName: string | null;
  regDate: string | null;
  ofcttNum: number | null;
  title: string;
  organNm: string | null;
  lawordNm: string | null;
  viewerUrl: string | null;
  pageCount: number | null;
  itemCount: number;
  pdfApiUrl: string | null;
};

export type GwanboItemRow = {
  itemId: number;
  itemNo: number | null;
  itemName: string | null;
  prevDocNo: string | null;
  prevHsCode: string | null;
  newHsCode: string | null;
  changeReason: string | null;
  goodsDesc: string | null;
  effectiveDate: string | null;
};

export type GwanboNoticeDetail = GwanboNoticeListRow & {
  organCode: string | null;
  pdfFileName: string | null;
  pdfFileSize: number | null;
  bodyText: string;
  crawlDt: string | null;
  items: GwanboItemRow[];
};

export type GwanboQueryParams = {
  page: number;
  pageSize: number;
  keyword?: string;
  field?: string;
  sort?: string;
  sort_dir?: string;
};
