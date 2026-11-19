export type ClipImexNoticeTab = "items" | "integrated";

/** 01=수출금지, 02=수출제한, 03=수입제한 */
export type ClipImexNoticeTypeFilter = "" | "01" | "02" | "03";

export type ClipImexNoticeSortKey = "hs_code" | "item_name" | "imex_type_name";

export const CLIP_IMEX_NOTICE_SORT_KEYS: ClipImexNoticeSortKey[] = [
  "hs_code",
  "item_name",
  "imex_type_name",
];

export type ClipImexNoticeMasterRow = {
  notice_key: string;
  notice_no: string;
  notice_date: string;
  pmgt_dt_tp_no: string;
  total_item_count: number;
};

export type ClipImexNoticeListRow = {
  notice_item_key: string;
  hs_code: string;
  item_name: string;
  guidance_text: string;
  guidance_html: string;
  imex_type_code: string;
  imex_type_name: string;
  relation_rule_name: string;
};

export type ClipImexNoticeSummary = {
  notice_key: string;
  content_html: string;
  content_text: string;
};

export type ClipImexNoticeQueryParams = {
  noticeKey: string;
  page: number;
  pageSize: number;
  hsCode?: string;
  keyword?: string;
  imexType?: ClipImexNoticeTypeFilter;
  sort?: string;
  sort_dir?: string;
};
