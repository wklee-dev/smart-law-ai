import type { ForeignHsBucketCode } from "@/app/lib/foreign-hs-case-buckets";

/** 목록 마지막 열 미리보기 소스 */
export type ForeignListPreviewKind = "reply" | "goods_desc" | "goods_name";

export function foreignListPreviewKind(
  bucket: ForeignHsBucketCode,
): ForeignListPreviewKind {
  if (bucket === "US") return "reply";
  if (bucket === "EU" || bucket === "GB" || bucket === "AU") return "goods_desc";
  return "goods_name";
}

export function foreignListColumnLabel(kind: ForeignListPreviewKind): string {
  switch (kind) {
    case "reply":
      return "회신";
    case "goods_desc":
      return "물품설명";
    case "goods_name":
      return "품명";
  }
}

/** 원문/영문/국문 토글이 의미 있는 목록 열(다국어 DB 컬럼) */
export function foreignListPreviewUsesLang(kind: ForeignListPreviewKind): boolean {
  return kind !== "goods_name";
}

export type ForeignI18nBase = "goods_desc" | "reply" | "reason";

export type ForeignDetailFieldDef =
  | { type: "scalar"; key: string; label: string }
  | { type: "i18n"; base: ForeignI18nBase; label: string };

/** 상세가 명시되지 않은 국가는 캐나다(표준) 항목 구성을 사용 */
const CA_STANDARD_DETAIL: ForeignDetailFieldDef[] = [
  { type: "scalar", key: "goods_name", label: "품명" },
  { type: "scalar", key: "goods_name_etc", label: "기타품명" },
  { type: "i18n", base: "reply", label: "회신" },
  { type: "i18n", base: "goods_desc", label: "물품설명" },
  { type: "i18n", base: "reason", label: "결정사유" },
  { type: "scalar", key: "keyword", label: "키워드" },
];

const FOREIGN_DETAIL_BY_BUCKET: Record<
  ForeignHsBucketCode,
  ForeignDetailFieldDef[]
> = {
  US: [
    { type: "scalar", key: "issue_org", label: "시행기관" },
    { type: "scalar", key: "category", label: "Category" },
    { type: "i18n", base: "reply", label: "회신" },
    { type: "i18n", base: "goods_desc", label: "물품설명" },
    { type: "scalar", key: "issue_place", label: "이슈장소" },
    { type: "scalar", key: "keyword", label: "키워드" },
  ],
  EU: [
    { type: "scalar", key: "country", label: "국가" },
    { type: "i18n", base: "goods_desc", label: "물품설명" },
    { type: "i18n", base: "reason", label: "분류사유" },
    { type: "scalar", key: "issue_place", label: "이슈장소" },
    { type: "scalar", key: "keyword", label: "키워드" },
  ],
  GB: [
    { type: "i18n", base: "goods_desc", label: "물품설명" },
    { type: "i18n", base: "reason", label: "분류사유" },
    { type: "scalar", key: "issue_place", label: "이슈장소" },
    { type: "scalar", key: "keyword", label: "키워드" },
  ],
  CA: CA_STANDARD_DETAIL,
  CL: [
    { type: "scalar", key: "goods_name", label: "품명" },
    { type: "i18n", base: "goods_desc", label: "물품설명" },
  ],
  JP: [
    { type: "scalar", key: "goods_name", label: "품명" },
    { type: "i18n", base: "goods_desc", label: "물품설명" },
    { type: "i18n", base: "reason", label: "분류사유" },
    { type: "scalar", key: "customs_office", label: "세관" },
    { type: "scalar", key: "keyword", label: "키워드" },
  ],
  CN: [
    { type: "scalar", key: "goods_name", label: "품명" },
    { type: "scalar", key: "other_name", label: "다른이름" },
    { type: "i18n", base: "goods_desc", label: "물품설명" },
    { type: "i18n", base: "reason", label: "결정사유" },
    { type: "scalar", key: "issue_place", label: "이슈장소" },
    { type: "scalar", key: "keyword", label: "키워드" },
  ],
  TW: [
    { type: "scalar", key: "goods_name", label: "품명" },
    { type: "scalar", key: "goods_name_decl", label: "품명선언" },
    { type: "scalar", key: "material", label: "재질성분" },
    { type: "scalar", key: "purpose", label: "용도" },
    { type: "i18n", base: "reason", label: "결정사유" },
    { type: "scalar", key: "issue_place", label: "이슈장소" },
    { type: "scalar", key: "keyword", label: "키워드" },
  ],
  TH: [
    { type: "scalar", key: "goods_name", label: "품명" },
    { type: "i18n", base: "reply", label: "회신" },
    { type: "scalar", key: "goods_name_etc", label: "기타품명" },
    { type: "i18n", base: "goods_desc", label: "물품설명" },
    { type: "scalar", key: "material", label: "재질성분" },
    { type: "scalar", key: "purpose", label: "용도" },
    { type: "i18n", base: "reason", label: "결정사유" },
    { type: "scalar", key: "keyword", label: "키워드" },
  ],
  SG: [
    { type: "scalar", key: "goods_name", label: "품명" },
    { type: "scalar", key: "goods_name_etc", label: "기타품명" },
  ],
  PH: [
    { type: "scalar", key: "goods_name", label: "품명" },
    { type: "i18n", base: "goods_desc", label: "물품설명" },
    { type: "i18n", base: "reason", label: "결정사유" },
  ],
  IN: [
    { type: "scalar", key: "goods_name", label: "품명" },
    { type: "scalar", key: "goods_name_etc", label: "기타품명" },
    { type: "i18n", base: "goods_desc", label: "물품설명" },
    { type: "i18n", base: "reason", label: "결정사유" },
  ],
  AU: [
    { type: "i18n", base: "goods_desc", label: "물품설명" },
    { type: "i18n", base: "reason", label: "결정사유" },
  ],
  KH: [{ type: "scalar", key: "goods_name", label: "품명" }],
  BD: [
    { type: "scalar", key: "category", label: "Category" },
    { type: "scalar", key: "goods_name", label: "품명" },
  ],
  CH: [
    { type: "scalar", key: "goods_name", label: "품명" },
    { type: "i18n", base: "goods_desc", label: "물품설명" },
    { type: "i18n", base: "reason", label: "결정사유" },
    { type: "scalar", key: "keyword", label: "키워드" },
  ],
};

export function foreignDetailFieldsForBucket(
  bucket: ForeignHsBucketCode,
): ForeignDetailFieldDef[] {
  return FOREIGN_DETAIL_BY_BUCKET[bucket] ?? CA_STANDARD_DETAIL;
}

export function foreignDetailUsesLang(bucket: ForeignHsBucketCode): boolean {
  return foreignDetailFieldsForBucket(bucket).some((f) => f.type === "i18n");
}

/** 검색어(키워드) LIKE 대상 — 국가별 수집 텍스트 컬럼 전체 */
export const FOREIGN_KEYWORD_SEARCH_COLUMNS = [
  "ref_no",
  "hs_code",
  "country",
  "keyword",
  "issue_place",
  "issue_org",
  "category",
  "customs_office",
  "goods_name",
  "goods_name_etc",
  "goods_name_decl",
  "other_name",
  "material",
  "purpose",
  "goods_desc_org",
  "goods_desc_eng",
  "goods_desc_kor",
  "reply_org",
  "reply_eng",
  "reply_kor",
  "reason_org",
  "reason_eng",
  "reason_kor",
] as const;
