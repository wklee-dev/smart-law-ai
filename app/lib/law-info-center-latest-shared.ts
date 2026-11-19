/** 국가법령정보센터 최신법령 — llc_v1_* */

export const LAW_INFO_CENTER_CATEGORY_TABS = [
  { code: "공포법령", label: "공포법령" },
  { code: "시행법령", label: "시행법령" },
  { code: "시행예정법령", label: "시행예정법령" },
  { code: "폐지법령", label: "폐지법령" },
  { code: "한시법령", label: "한시법령" },
  { code: "한시조문", label: "한시조문" },
  { code: "위헌조문", label: "위헌조문" },
] as const;

export type LawInfoCenterCategoryCode =
  (typeof LAW_INFO_CENTER_CATEGORY_TABS)[number]["code"];

export type LawInfoCenterTabCounts = Record<"전체" | LawInfoCenterCategoryCode, number>;

export type LawInfoCenterListRow = {
  key: string;
  category: string;
  title: string;
  lawType: string;
  ministry: string;
  announceDate: string;
  effectiveDate: string;
  expireDate: string;
  revisionType: string;
  announceNo: string;
  articleLabel: string;
  sourceUrl: string;
  matchedKeywords: string;
};

export type LawInfoCenterPart = {
  partId: string;
  title: string;
  text: string;
  html: string;
};

export type LawInfoCenterAttachment = {
  partId: string;
  annexId: string;
  displayName: string;
  sizeBytes: number;
  status: string;
  hasLocalFile: boolean;
  downloadUrl: string;
  sourceUrl: string;
};

export type LawInfoCenterDetail = LawInfoCenterListRow & {
  sourceId: string;
  articles: LawInfoCenterPart[];
  addenda: LawInfoCenterPart[];
  annexes: LawInfoCenterPart[];
  attachments: LawInfoCenterAttachment[];
};
