/** 국가법령정보센터 · 품목분류변경고시 — llc_hs_change_notice */

export type LlcHsChangeNoticeListRow = {
  id: number;
  seqNo: number;
  noticeNo: string;
  noticeNoLabel: string;
  noticeDate: string;
  itemName: string;
  hsBefore: string;
  hsAfter: string;
  layoutType: string;
};

export type LlcHsChangeNoticeTextItem = {
  mark: string;
  itemName: string;
  priorDoc: string;
  overview: string;
  hsBefore: string;
  hsAfter: string;
  changeReason: string;
};

export type LlcHsChangeNoticeDetail = LlcHsChangeNoticeListRow & {
  title: string;
  introText: string;
  productOverview: string;
  changeReason: string;
  priorDocuments: string;
  applicationNote: string;
  tableHeaders: string[];
  tableRows: string[][];
  priorHeaders: string[];
  priorRows: string[][];
  /** C형 텍스트 고시 — ①②③ 다중 품목 */
  textItems: LlcHsChangeNoticeTextItem[];
  sourcePdfPage: number | null;
  sourceFile: string;
  rawText: string;
};

export type LlcHsChangeNoticeQueryParams = {
  noticeNo?: string;
  hsCode?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
};
