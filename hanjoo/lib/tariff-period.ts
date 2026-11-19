/** 관세율표 기간 키: 연도(YYYY) 또는 연월(YYYYMM). */
export function formatSchedulePeriodLabel(period: number): string {
  const n = Math.trunc(period);
  if (n >= 100_001 && n <= 999_912) {
    const y = Math.floor(n / 100);
    const m = n % 100;
    if (y >= 1990 && y <= 2100 && m >= 1 && m <= 12) {
      return `${y}년 ${String(m).padStart(2, "0")}월`;
    }
  }
  return `${n}년`;
}
