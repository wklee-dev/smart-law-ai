/**
 * raw_rule.db 테이블 구조 (재취합 스키마)
 *
 * gubun: 관세법령 | 무역법령 | 외국환법령 | 세관장확인법령 | 통합공고법령 | 내국세법령 | 행정법령
 */

/** raw — 본칙 및 계층 정보 */
export type RawRuleTableRow = {
  internal_id: string;
  law_id: string | null;
  law_name: string;
  law_type: string | null;
  promulgation_date: string | null;
  promulgation_number: string | null;
  department: string | null;
  enforcement_date: string | null;
  content: string | null;
  /** 부모 행 internal_id (CLIP 트리 계층) */
  parent_internal_id: string | null;
  meta_info: string | null;
  gubun: string | null;
  collected_at: string | null;
};

/** raw_addendum — 부칙 */
export type RawRuleAddendumRow = {
  id: number;
  internal_id: string;
  addendum_date: string | null;
  addendum_content: string | null;
  gubun: string | null;
};

/** raw_annex — 별표·서식 */
export type RawRuleAnnexRow = {
  id: number;
  internal_id: string;
  annex_no: string | null;
  annex_title: string | null;
  annex_link: string | null;
  gubun: string | null;
};

/** raw_attachment — 첨부파일 */
export type RawRuleAttachmentRow = {
  id: number;
  internal_id: string;
  file_name: string | null;
  file_link: string | null;
  gubun: string | null;
};

export const RAW_RULE_SELECT_COLUMNS = `
  internal_id,
  law_id,
  law_name,
  law_type,
  promulgation_date,
  promulgation_number,
  department,
  enforcement_date,
  content,
  parent_internal_id,
  meta_info,
  gubun,
  collected_at
` as const;
