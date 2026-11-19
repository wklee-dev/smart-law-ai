/** 외국사례 탭 순서 및 앵커용 코드 (SQLite `bucket` 과 동일: US, EU, …). */
export const FOREIGN_HS_BUCKET_ORDER = [
  "US",
  "EU",
  "GB",
  "CN",
  "JP",
  "TW",
  "CL",
  "AU",
  "TH",
  "SG",
  "PH",
  "KH",
  "IN",
  "CA",
  "BD",
  "CH",
] as const;

export type ForeignHsBucketCode = (typeof FOREIGN_HS_BUCKET_ORDER)[number];

export const FOREIGN_BUCKET_LABEL: Record<ForeignHsBucketCode, string> = {
  US: "미국",
  EU: "유럽연합(EU)",
  GB: "영국",
  CN: "중국",
  JP: "일본",
  TW: "대만",
  CL: "칠레",
  AU: "호주",
  TH: "태국",
  SG: "싱가포르",
  PH: "필리핀",
  KH: "캄보디아",
  IN: "인도",
  CA: "캐나다",
  BD: "방글라데시",
  CH: "스위스",
};

export function foreignBucketAnchorId(code: string): string {
  return `foreign-bucket-${code.trim().toLowerCase()}`;
}

export function foreignResultsTopAnchorId(): string {
  return "foreign-results-top";
}
