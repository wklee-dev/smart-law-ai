export type ClipIntegratedNoticeTab = "items" | "integrated";

/** 11=수출요령, 12=수입요령 */
export type ClipIntegratedNoticeDirectionFilter = "" | "11" | "12";

export type ClipIntegratedNoticeSortKey =
  | "hs_code"
  | "product_name"
  | "related_law_name"
  | "guidance_type_name";

export const CLIP_INTEGRATED_NOTICE_SORT_KEYS: ClipIntegratedNoticeSortKey[] =
  [
    "hs_code",
    "product_name",
    "related_law_name",
    "guidance_type_name",
  ];

export type ClipIntegratedNoticeIssueRow = {
  issue_code: string;
  notice_rule_no: string;
  /** 포털 발령번호. 예: 제2022-146호 */
  notice_no: string;
  /** 포털 발령일자. 예: 2022-09-06 */
  notice_date: string;
  issued_date: string;
  item_count: number;
};

export type ClipIntegratedNoticeListRow = {
  item_id: number;
  hs_code: string;
  product_name: string;
  import_export_guidance: string;
  related_law_name: string;
  related_link: string;
  guidance_type_code: string;
  guidance_type_name: string;
};

export type ClipIntegratedNoticeSummary = {
  title: string;
  body_html: string;
  body_text: string;
};

export type ClipIntegratedNoticeQueryParams = {
  issueCode: string;
  page: number;
  pageSize: number;
  hsCode?: string;
  keyword?: string;
  direction?: ClipIntegratedNoticeDirectionFilter;
  sort?: string;
  sort_dir?: string;
};

/** 포털 option 텍스트 → 발령번호·발령일자 */
export function parseClipIntegratedNoticeOptionLabel(label: string): {
  notice_no: string;
  notice_date: string;
} {
  const text = (label ?? "").trim();
  const match = /^(.*?)\s*\((\d{4}-\d{2}-\d{2})\)\s*$/.exec(text);
  if (!match) return { notice_no: text, notice_date: "" };
  return { notice_no: match[1].trim(), notice_date: match[2] };
}

/** 발령번호(발령일자) 표시 — 수출입공고 imex_notice_master와 동일 형식 */
export function formatClipIntegratedNoticeIssueLabel(
  issue: Pick<
    ClipIntegratedNoticeIssueRow,
    "issue_code" | "issued_date" | "notice_no" | "notice_date"
  >,
): string {
  const no = (issue.notice_no ?? "").trim();
  const date = (issue.notice_date ?? issue.issued_date ?? "").trim();
  if (no && date) return `${no} (${date})`;
  if (no) return no;
  const code = (issue.issue_code ?? "").trim();
  if (code && date) return `${code} (${date})`;
  return code || "—";
}
