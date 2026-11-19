/**
 * 채팅 UI 표시용: 호환 전각·유사 문자를 NFKC로 통일해 일반 너비로 보이게 합니다.
 */
export function normalizeChatDisplayText(text: string): string {
  if (!text) return text;
  try {
    return text.normalize("NFKC");
  } catch {
    return text;
  }
}
