/**
 * Supabase 법령 테이블(laws / law_versions / law_articles 등)과 API 응답 정규화.
 * 스키마에 숫자·문자 혼용 컬럼이 있어도 UI/JSON이 깨지지 않게 맞춘다.
 */

/** law_versions.law_id → laws.id FK (숫자·문자 혼용 대비) */
export function parseLawPrimaryKeyRef(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/** 조문번호: DB가 int/bigint/text여도 API에서는 문자열로 통일 */
export function normalizeArticleNoForApi(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value;
  return String(value);
}

/**
 * 화면용 조문번호: DB `article_no`는 `(law_version_id, article_no)` 유일용 Salt 값(백만·20억대 등)일 수 있어,
 * 가능하면 소스 JSON의 `조문번호`를 쓴다.
 */
export function resolveArticleNoForDisplay(
  article_no: unknown,
  raw_json: unknown,
): string {
  if (raw_json && typeof raw_json === "object") {
    const v = (raw_json as Record<string, unknown>)["조문번호"];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return normalizeArticleNoForApi(article_no);
}

export type LawRowForList = {
  id: number;
  law_id: string;
  law_key: string | null;
  law_name_kr: string;
  law_name_short: string | null;
  law_name_hanja: string | null;
  ministry_name: string | null;
  ministry_code: string | null;
};

export type LawVersionRowForList = {
  id: number;
  law_id: number | string;
  version_key: string | null;
  promulgation_no: string | null;
  promulgation_date: string | null;
  enforcement_date: string | null;
  revision_type: string | null;
  article_effective_text: string | null;
  promulgated_law_yn: string | null;
  contact_phone: string | null;
  contact_department_name: string | null;
  is_current: boolean | null;
  raw_json: unknown;
  updated_at: string | null;
};

/** law_versions 단일 행 + laws 한 행 → 일반법령조회 / API용 document 객체 */
export function mapVersionAndLawToDocument(
  row: LawVersionRowForList,
  law: LawRowForList | null | undefined,
): {
  id: number;
  law_pk: number;
  law_id: string;
  law_key: string | null;
  law_name_kr: string;
  law_name_short: string;
  law_name_hanja: string;
  ministry_name: string;
  ministry_code: string;
  promulgation_no: string | null;
  promulgation_date: string | null;
  enforcement_date: string | null;
  revision_type: string | null;
  contact_phone: string | null;
  contact_department_name: string | null;
  updated_at: string | null;
  raw_json: unknown;
} {
  const fk = parseLawPrimaryKeyRef(row.law_id);
  const lawPk = law?.id ?? fk ?? 0;

  return {
    id: row.id,
    law_pk: lawPk,
    law_id: law?.law_id ?? "",
    law_key: law?.law_key ?? null,
    law_name_kr: law?.law_name_kr ?? "",
    law_name_short: law?.law_name_short ?? "",
    law_name_hanja: law?.law_name_hanja ?? "",
    ministry_name: law?.ministry_name ?? "",
    ministry_code: law?.ministry_code ?? "",
    promulgation_no: row.promulgation_no,
    promulgation_date: row.promulgation_date,
    enforcement_date: row.enforcement_date,
    revision_type: row.revision_type,
    contact_phone: row.contact_phone,
    contact_department_name: row.contact_department_name,
    updated_at: row.updated_at,
    raw_json: row.raw_json,
  };
}
