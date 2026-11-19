/**
 * 행정규칙(및 연계 법령) 메타데이터. SQLite는 통합 테이블 `admin_rule` / `raw_rule` 계열을 사용하며
 * `rule_config`와 동일 DB입니다. 첨부: `{ADMIN_RULES_ATTACH_ROOT}/ATTACH/{table_name}/`
 */
export type AdminRulesTableCatalogEntry = {
  /** 크롤링 파라미터 */
  param: string;
  /** SQLite 메인 테이블명 (`${table}_addendum`, `_annex`, `_attachment` 동일 접두) */
  table_name: string;
  /** 화면·설명용 제목 */
  description: string;
  law_go_kr_url: string;
};

export const ADMIN_RULES_TABLE_CATALOG: readonly AdminRulesTableCatalogEntry[] =
  [
    {
      param: "a",
      table_name: "notice_post_management",
      description: "사후관리에 관한 고시",
      law_go_kr_url:
        "https://www.law.go.kr/행정규칙/사후관리에관한고시/(2026-5,20260101)",
    },
    {
      param: "b",
      table_name: "notice_customs_clearance_confirm",
      description:
        "관세법 제226조에 따른 세관장확인물품 및 확인방법 지정고시",
      law_go_kr_url:
        "https://www.law.go.kr/행정규칙/관세법제226조에따른세관장확인물품및확인방법지정고시",
    },
    {
      param: "c",
      table_name: "reg_integrated_public_notice",
      description: "통합공고",
      law_go_kr_url:
        "https://www.law.go.kr/행정규칙/통합공고/(2025-42,20251224)",
    },
    {
      param: "d",
      table_name: "rule_fta_customs_law",
      description: "자유무역협정(FTA)관세법 시행규칙",
      law_go_kr_url:
        "https://www.law.go.kr/법령/자유무역협정의이행을위한관세법의특례에관한법률시행규칙",
    },
    {
      param: "e",
      table_name: "decree_fta_customs_law",
      description: "자유무역협정(FTA)관세법 시행령",
      law_go_kr_url:
        "https://www.law.go.kr/법령/자유무역협정의이행을위한관세법의특례에관한법률시행령",
    },
    {
      param: "f",
      table_name: "reg_foreign_trade_management",
      description: "대외무역관리규정",
      law_go_kr_url:
        "https://www.law.go.kr/행정규칙/대외무역관리규정/(2024-43,20240308)",
    },
    {
      param: "g",
      table_name: "notice_origin_marking_system",
      description: "원산지표시제도 운영에 관한 고시",
      law_go_kr_url:
        "https://www.law.go.kr/행정규칙/원산지표시제도운영에관한고시/(2025-59,20251124)",
    },
    {
      param: "h",
      table_name: "rule_customs_law",
      description: "관세법 시행규칙",
      law_go_kr_url: "https://www.law.go.kr/법령/관세법시행규칙",
    },
    {
      param: "i",
      table_name: "table_simplified_drawback_rate",
      description: "간이정액환급률표",
      law_go_kr_url:
        "https://www.law.go.kr/행정규칙/간이정액환급률표개정고시/(2025-70,20260101)",
    },
    {
      param: "j",
      table_name: "notice_import_material_drawback",
      description: "수입원재료에 대한 환급방법 조정에 관한 고시",
      law_go_kr_url:
        "https://www.law.go.kr/행정규칙/수입원재료에대한환급방법조정에관한고시/(2025-27,20250101)",
    },
  ] as const;

const TABLE_NAMES = new Set(
  ADMIN_RULES_TABLE_CATALOG.map((e) => e.table_name),
);

/** 알려진 행정규칙 카탈로그에 정의된 테이블인지 (JSON·DB 검증 보조) */
export function isCatalogAdminRuleTable(tableName: string): boolean {
  return TABLE_NAMES.has(tableName);
}

export function getCatalogEntryByTable(
  tableName: string,
): AdminRulesTableCatalogEntry | undefined {
  return ADMIN_RULES_TABLE_CATALOG.find((e) => e.table_name === tableName);
}

export function getCatalogEntryByParam(
  param: string,
): AdminRulesTableCatalogEntry | undefined {
  return ADMIN_RULES_TABLE_CATALOG.find((e) => e.param === param);
}
