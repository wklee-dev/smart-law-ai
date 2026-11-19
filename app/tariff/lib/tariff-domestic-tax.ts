/** UNIPASS 국내관세율상세 · 내국세 (tariff_item_detail 특수행) */

export type TariffRateRow = {
  rate_code: string;
  rate_value: string;
  rate_name: string;
};

/** crawl이 세율 테이블에 섞어 넣은 내국세 라벨행 */
export const DOMESTIC_TAX_RATE_CODES = [
  "구분",
  "세종부호",
  "농특세과세여부",
] as const;

export type DomesticTaxFieldKey =
  | "구분"
  | "내국세율"
  | "세종부호"
  | "개소세과세기준가격"
  | "농특세과세여부"
  | "기준일자";

/** UNIPASS 내국세 표 열 순서 */
export const DOMESTIC_TAX_FIELD_ORDER: DomesticTaxFieldKey[] = [
  "구분",
  "내국세율",
  "세종부호",
  "개소세과세기준가격",
  "농특세과세여부",
  "기준일자",
];

const DOMESTIC_SET = new Set<string>(DOMESTIC_TAX_RATE_CODES);

/**
 * crawl 저장 형태: (라벨, 값, 다음라벨) — 짝수 열 값은 누락된 경우가 많음.
 * rate_code → rate_value 매핑 + rate_name을 빈 짝 필드로 예약.
 */
export function isDomesticTaxRateRow(row: TariffRateRow): boolean {
  return DOMESTIC_SET.has(row.rate_code.trim());
}

export function splitTariffRates(rates: TariffRateRow[]): {
  tariffRates: TariffRateRow[];
  domesticRows: TariffRateRow[];
} {
  const tariffRates: TariffRateRow[] = [];
  const domesticRows: TariffRateRow[] = [];
  for (const r of rates) {
    if (isDomesticTaxRateRow(r)) domesticRows.push(r);
    else tariffRates.push(r);
  }
  return { tariffRates, domesticRows };
}

export type DomesticTaxFields = Record<DomesticTaxFieldKey, string>;

export function parseDomesticTaxFields(
  domesticRows: TariffRateRow[],
): DomesticTaxFields {
  const fields = Object.fromEntries(
    DOMESTIC_TAX_FIELD_ORDER.map((k) => [k, ""]),
  ) as DomesticTaxFields;

  for (const r of domesticRows) {
    const code = r.rate_code.trim() as DomesticTaxFieldKey;
    if (code in fields) {
      fields[code] = (r.rate_value ?? "").trim();
    }
    const nextLabel = (r.rate_name ?? "").trim() as DomesticTaxFieldKey;
    // 짝수 열 값은 DB에 없을 수 있음 — 키만 확보(이미 빈 문자열)
    if (nextLabel && nextLabel in fields && !fields[nextLabel]) {
      /* keep empty */
    }
  }

  return fields;
}

export function hasDomesticTaxContent(fields: DomesticTaxFields): boolean {
  return DOMESTIC_TAX_FIELD_ORDER.some((k) => fields[k].trim().length > 0);
}
