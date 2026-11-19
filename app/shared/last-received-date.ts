/**
 * 최종수신일 저장·표시 형식: YYYY/MM/DD HH:MM (초 없음)
 */
export function formatLastReceivedAt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/**
 * JSON에 담긴 기존 값(다양한 문자열)을 화면·폼에 맞게 통일
 */
export function formatLastReceivedForDisplay(value: string): string {
  const t = value.trim();
  if (!t) return "";
  if (/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(t)) return t;
  const m = t.match(
    /^(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?/,
  );
  if (m) {
    const h = m[4].padStart(2, "0");
    return `${m[1]}/${m[2]}/${m[3]} ${h}:${m[5]}`;
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return formatLastReceivedAt(d);
  }
  return t;
}
