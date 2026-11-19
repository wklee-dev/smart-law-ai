/** 조세심판원 심판결정례(관세) — tb_tt_* */

export const TT_CASE_DECISION_TABS = [
  "기각",
  "취소",
  "경정",
  "각하",
  "재조사",
] as const;

export type TtCaseDecisionTab = (typeof TT_CASE_DECISION_TABS)[number];

export type TtCaseSortKey =
  | "decision_date"
  | "claim_no"
  | "decision_type"
  | "title"
  | "doc_no";

export const TT_CASE_SORT_KEYS: TtCaseSortKey[] = [
  "decision_date",
  "claim_no",
  "decision_type",
  "title",
  "doc_no",
];

export type TtCaseListRow = {
  dem_no: number;
  doc_no: string | null;
  claim_no: string | null;
  semok_name: string | null;
  decision_type: string | null;
  decision_date: string | null;
  title: string | null;
  summary: string | null;
  related_law: string | null;
  attach_cnt: number | null;
  source_url: string | null;
};

export type TtCaseAttachRow = {
  attach_id: number;
  file_name: string | null;
  file_ext: string | null;
  download_url: string | null;
  dem_str: string | null;
};

export type TtCaseDetail = TtCaseListRow & {
  order_text: string | null;
  reason_text: string | null;
  body_text: string | null;
  ref_decision: string | null;
  fol_decision: string | null;
  crawl_status: string | null;
  attachments: TtCaseAttachRow[];
};

export type TtCaseTabCounts = {
  전체: number;
} & Partial<Record<TtCaseDecisionTab, number>>;

export type TtCaseQueryParams = {
  page: number;
  pageSize: number;
  decisionTab: "ALL" | TtCaseDecisionTab;
  claimNo?: string;
  title?: string;
  keyword?: string;
  relatedLaw?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  sort_dir?: string;
};
