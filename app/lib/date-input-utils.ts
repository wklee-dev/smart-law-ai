/** 로컬 기준 오늘 YYYY-MM-DD */
export function todayYmdLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 빈 date 필드 포커스·클릭 시 당일로 채움 */
export function fillTodayIfEmpty(
  current: string | undefined | null,
  setValue: (ymd: string) => void,
): void {
  if (!(current ?? "").trim()) setValue(todayYmdLocal());
}
