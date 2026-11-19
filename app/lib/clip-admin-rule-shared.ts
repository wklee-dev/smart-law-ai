/** 클라이언트·서버 공용 — node:fs/sqlite 없음 */

export const CLIP_RULE_TYPE_TABS = ["고시", "훈령", "예규", "공고"] as const;
export type ClipRuleTypeTab = (typeof CLIP_RULE_TYPE_TABS)[number];

export type ClipTabCounts = {
  전체: number;
  고시: number;
  훈령: number;
  예규: number;
  공고: number;
};

export type ClipAdminRuleListRow = {
  rule_id: string;
  rule_name: string;
  rule_type: string;
  dept_name: string;
  manager_name: string;
  issue_no: string;
  issue_date: string;
  revision_type: string;
};

export type ClipAdminRuleHistoryRow = {
  history_id: string;
  rule_id: string;
  rule_name: string;
  issue_no: string;
  revision_date: string;
  revision_status: string;
};

export type ClipAdminRuleDetail = ClipAdminRuleListRow & {
  lworAdmnRulNo: string | null;
  pmgtDtTpNo: string | null;
  content: string;
  gubun: string | null;
  history: ClipAdminRuleHistoryRow[];
};

export const CLIP_ADMIN_RULE_SORT_KEYS = [
  "rule_name",
  "rule_type",
  "dept_name",
  "manager_name",
  "issue_no",
  "issue_date",
  "revision_type",
] as const;

export type ClipAdminRuleSortKey = (typeof CLIP_ADMIN_RULE_SORT_KEYS)[number];

export type ClipAdminRuleQueryParams = {
  page: number;
  pageSize: number;
  /** 전체 또는 종류별 */
  ruleTypeTab: "" | "ALL" | ClipRuleTypeTab;
  rule_name: string;
  dept_name: string;
  manager_name: string;
  include_abolished: boolean;
  sort: string | undefined;
  sort_dir: string | undefined;
};

/** 별표/서식·첨부 목록 UI 행 */
export type ClipSatelliteUiRow = {
  recordId: string;
  label: string;
  subLabel: string | null;
  pdfHref: string | null;
  hwpHref: string | null;
  fileHref: string | null;
  /** 첨부: 법제처 등 외부 URL */
  externalHref: string | null;
};

/** 발령일자 YYYYMMDD → YYYY-MM-DD (표시용) */
export function formatClipIssueDate(ymd: string | null | undefined): string {
  const t = (ymd ?? "").trim().replace(/\D/g, "");
  if (t.length === 8) {
    return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  }
  return ymd?.trim() || "—";
}
