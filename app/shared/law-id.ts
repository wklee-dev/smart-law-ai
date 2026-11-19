/**
 * 법령ID(일반법령): 저장 시 6자리 0패딩, 화면·Open API URL에는 앞자리 0 제거.
 * 7자리 이상 숫자(행정규칙 일련번호 등)는 그대로 둡니다.
 */

const DIGITS_ONLY = /^\d+$/;

/** DB·JSON 저장용 (6자리 이하 숫자만 0패딩) */
export function normalizeLawIdForStorage(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const d = t.replace(/\D/g, "");
  if (!d) return t;
  if (d.length > 6) return d;
  const n = parseInt(d, 10);
  if (!Number.isFinite(n) || n < 0) return t;
  return String(n).padStart(6, "0");
}

/** 목록·입력 필드 표시용 (6자리 이하 저장값에서 앞 0 제거) */
export function formatLawIdForDisplay(stored: string): string {
  const s = stored.trim();
  if (!s) return "";
  if (!DIGITS_ONLY.test(s)) return s;
  if (s.length > 6) return s;
  return String(parseInt(s, 10));
}

/** 국가법령정보 Open API 요청 파라미터 ID (앞 0 제거·6자리 이하) */
export function lawIdForStatuteOpenApi(raw: string): string {
  const stored = normalizeLawIdForStorage(raw);
  if (!stored) return raw.trim();
  if (stored.length > 6) return stored;
  return String(parseInt(stored, 10));
}
