/**
 * 국가법령정보 본문 JSON에서 항·조의 내용이 "삭제 <날짜>" 형태로만 되어 있는지 판별합니다.
 * 이 조항은 공식 사이트에서도 실효 규정에서 제외되는 경우가 많아 RAG 후보에서 뺍니다.
 */
export function isDeletedLawParagraph(text: string): boolean {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/^삭제\s*[<＜]/.test(t)) return true;
  if (/^삭제\s*$/i.test(t)) return true;
  if (/^전문\s*삭제/.test(t)) return true;
  return false;
}
