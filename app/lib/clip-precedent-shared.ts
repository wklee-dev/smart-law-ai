/** 클라이언트·서버 공용 — node:fs/sqlite 없음 */

export const CLIP_PRECEDENT_TYPE_TABS = [
  "과세전적부심사",
  "심사청구",
  "심판청구",
] as const;

export type ClipPrecedentTypeTab = (typeof CLIP_PRECEDENT_TYPE_TABS)[number];

export type ClipPrecedentTabCounts = {
  전체: number;
  과세전적부심사: number;
  심사청구: number;
  심판청구: number;
  소송: number;
};

export type ClipPrecedentListRow = {
  dsbd_incd_no: string;
  incd_no: string;
  wrdc_ttle: string;
  trial_type: string;
  issue_class: string;
  decision_date: string;
  agency: string;
};

export type ClipPrecedentDetailSection = {
  key: string;
  label: string;
  text: string;
};

export type ClipPrecedentLawRow = {
  id: number;
  law_name: string;
  law_content: string;
};

export type ClipPrecedentHsRow = {
  id: number;
  hs_code: string;
  kor_name: string;
  eng_name: string;
};

export type ClipPrecedentDetail = ClipPrecedentListRow & {
  decision_type: string;
  sections: ClipPrecedentDetailSection[];
  laws: ClipPrecedentLawRow[];
  hs_items: ClipPrecedentHsRow[];
};

export const CLIP_PRECEDENT_SORT_KEYS = [
  "incd_no",
  "wrdc_ttle",
  "trial_type",
  "issue_class",
  "decision_date",
  "agency",
] as const;

export type ClipPrecedentSortKey = (typeof CLIP_PRECEDENT_SORT_KEYS)[number];

export type ClipPrecedentQueryParams = {
  page: number;
  pageSize: number;
  trialTypeTab: "" | "ALL" | ClipPrecedentTypeTab;
  case_no: string;
  title: string;
  issue_class: string;
  agency: string;
  sort: string | undefined;
  sort_dir: string | undefined;
};

/** 결정일자 YYYYMMDD → YYYY-MM-DD */
export function formatClipDecisionDate(ymd: string | null | undefined): string {
  const t = (ymd ?? "").trim().replace(/\D/g, "");
  if (t.length === 8) {
    return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  }
  return ymd?.trim() || "—";
}

export const CLIP_PRECEDENT_SECTION_DEFS = [
  { key: "order_text", label: "주문" },
  { key: "claim_reason", label: "청구경위" },
  { key: "claimant_arg", label: "청구인주장" },
  { key: "agency_arg", label: "처분청주장" },
  { key: "issue", label: "쟁점사항" },
  { key: "judgement", label: "심리 및 판단" },
  { key: "conclusion", label: "결론" },
] as const;
