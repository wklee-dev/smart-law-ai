/** 관세 스케줄 테이블: year 가 INTEGER/TEXT 로 섞여 있어도 조회 되도록 */

export function scheduleYearPred(tableAlias: string): string {
  return `CAST(${tableAlias}.year AS INTEGER) = CAST(? AS INTEGER)`;
}

/** country_code 저장 시 공백·대소문자 차이 허용 */
export function scheduleCountryPred(tableAlias: string): string {
  return `UPPER(TRIM(IFNULL(${tableAlias}.country_code,''))) = UPPER(TRIM(IFNULL(?,'')))`;
}
