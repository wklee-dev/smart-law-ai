/** HS 해설 DB 원문 HTML → 화면용 평문·링크 처리 */

export function decodeHsManualEntities(raw: string): string {
  return raw
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

/** 제목 등에 쓸 평문 (태그·깨진 `<a` 조각 제거) */
export function stripHsManualHtml(raw: string): string {
  const decoded = decodeHsManualEntities(raw);
  return decoded
    .replace(/<a\b[^>]*>/gi, "")
    .replace(/<\/a>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** `f_retrieveManlInfoPop('4906')` 등에서 HS 부호 추출 */
export function extractHsManualPopCode(attrs: string): string | null {
  const m = /f_retrieveManlInfoPop\s*\(\s*['"]?(\d{2,4})['"]?\s*\)/i.exec(
    attrs,
  );
  return m?.[1] ?? null;
}

/** 본문 첫 줄이 제목과 같으면 본문에서 제거 (중복 방지) */
export function bodyWithoutTitleDuplicate(title: string, body: string): string {
  const t = stripHsManualHtml(title);
  if (!t || !body.trim()) return body;

  const lines = body.split(/\r?\n/);
  const first = lines[0]?.trim() ?? "";
  if (!first) return body;

  const firstPlain = stripHsManualHtml(first);
  if (firstPlain === t || firstPlain.startsWith(t) || t.startsWith(firstPlain)) {
    return lines.slice(1).join("\n").replace(/^\n+/, "");
  }
  return body;
}

/** 류 해설: `주:`(Notes) 뒤 `총설` / `GENERAL` 단독 행 기준으로 구간 분리 */
export function splitChapterGeneralSection(
  body: string,
  lang: "ko" | "en",
): { preamble: string; generalTitle: string; general: string } | null {
  const t = body.trim();
  if (!t) return null;

  const lines = t.split(/\r?\n/);
  let offset = 0;
  let markerIndex = -1;
  let markerLineLen = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const isMarker =
      lang === "ko"
        ? trimmed === "총설"
        : /^GENERAL$/i.test(trimmed);
    if (isMarker) {
      markerIndex = offset;
      markerLineLen = line.length;
      break;
    }
    offset += line.length + 1;
  }

  if (markerIndex < 0) return null;

  const preamble = t.slice(0, markerIndex).trim();
  const general = t
    .slice(markerIndex + markerLineLen)
    .replace(/^\r?\n+/, "")
    .trim();
  if (!general) return null;

  return {
    preamble,
    generalTitle: lang === "ko" ? "총설" : "GENERAL",
    general,
  };
}

/** 부 해설: 1행 제목(제 n 부) · 2행 부제 · 이후 본문(주) */
export function splitSectionPaneHeader(body: string): {
  title: string;
  subtitle: string;
  body: string;
} | null {
  const lines = body.trim().split(/\r?\n/);
  if (!lines.length) return null;
  const title = lines[0]?.trim() ?? "";
  if (!title) return null;

  let i = 1;
  while (i < lines.length && !lines[i]?.trim()) i += 1;
  const subtitle = i < lines.length ? (lines[i]?.trim() ?? "") : "";
  let j = subtitle ? i + 1 : i;
  while (j < lines.length && !lines[j]?.trim()) j += 1;
  const rest = lines.slice(j).join("\n").trim();

  return { title, subtitle, body: rest };
}

/** 목록 미리보기용 (HTML 태그 제거) */
export function hsManualListPreview(text: string, maxLen = 500): string {
  const plain = stripHsManualHtml(text);
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen)}…`;
}

/** API·UI용 짧은 제목 (HTML·잘림 없음) */
export function hsManualPaneTitleFromBody(
  body: string,
  fallback: string,
  maxLen = 200,
): string {
  const line = body.split(/\r?\n/)[0]?.trim() ?? "";
  const plain = stripHsManualHtml(line);
  if (!plain) return fallback;
  if (plain.length <= maxLen) return plain;
  return `${plain.slice(0, maxLen)}…`;
}
