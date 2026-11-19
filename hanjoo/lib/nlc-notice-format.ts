/** ISO(YYYY-MM-DD) → 국민참여입법센터 표기 */
export function formatNlcDisplayDate(iso: string): string {
  const t = iso.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!m) return t || "—";
  const y = m[1];
  const mo = String(Number(m[2]));
  const d = String(Number(m[3]));
  return `${y}. ${mo}. ${d}.`;
}

export function formatNlcPeriod(start: string, end: string): string {
  const s = start.trim();
  const e = end.trim();
  if (!s && !e) return "—";
  if (s && e) {
    return `${formatNlcDisplayDate(s)} ~ ${formatNlcDisplayDate(e)}`;
  }
  return formatNlcDisplayDate(s || e);
}

export function nlcRemainingDays(endDate: string): string {
  const t = endDate.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (!m) return "—";
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.ceil((end.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "종료";
  if (diff === 0) return "오늘";
  return `${diff}일`;
}

export const NLC_LIST_PAGE_SIZE = 20;
export const NLC_PAGE_NUMBER_WINDOW = 10;

export function nlcVisiblePageBlock(
  currentPage: number,
  totalPages: number,
): number[] {
  const tp = Math.max(1, Math.floor(totalPages));
  const cur = Math.min(Math.max(1, Math.floor(currentPage)), tp);
  const start =
    Math.floor((cur - 1) / NLC_PAGE_NUMBER_WINDOW) * NLC_PAGE_NUMBER_WINDOW + 1;
  const end = Math.min(start + NLC_PAGE_NUMBER_WINDOW - 1, tp);
  const out: number[] = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

export function defaultNlcDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 6);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { from: fmt(from), to: fmt(to) };
}
