/** 관세율표 SQLite·Supabase 에 저장하는 국가 코드 (대문자) */
export function normalizeTariffCountryCode(raw: string | undefined): string {
  const code = (raw ?? "KR").trim().toUpperCase();
  return code.length > 0 ? code : "KR";
}

export function parseTariffYear(raw: string | number | undefined): number {
  const n =
    typeof raw === "number"
      ? raw
      : Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 1900 || n > 2100) {
    throw new Error(`유효한 연도(4자리)가 필요합니다. 입력: ${raw}`);
  }
  return Math.trunc(n);
}
