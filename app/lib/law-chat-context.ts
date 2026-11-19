/**
 * 법령 RAG: LLM 컨텍스트용 청크 길이·출처 표시 (한국어 토큰은 문자 수로 근사).
 */

/** 권장 상한 ~800 토큰(한글 보수 3자/토큰 가정) */
const DEFAULT_MAX_TOKEN_EQUIV = 800;
const DEFAULT_CHARS_PER_TOKEN = 3;

export function parseChunkMaxChars(): number {
  const rawT = process.env.LAW_CHAT_CHUNK_MAX_TOKENS?.trim();
  const rawC = process.env.LAW_CHAT_CHUNK_CHARS_PER_TOKEN?.trim();
  const maxTok = rawT ? Number.parseInt(rawT, 10) : DEFAULT_MAX_TOKEN_EQUIV;
  const cpt = rawC ? Number.parseFloat(rawC) : DEFAULT_CHARS_PER_TOKEN;
  const tok = Number.isFinite(maxTok) && maxTok > 0 ? maxTok : DEFAULT_MAX_TOKEN_EQUIV;
  const mult = Number.isFinite(cpt) && cpt > 0 ? cpt : DEFAULT_CHARS_PER_TOKEN;
  return Math.min(12000, Math.max(200, Math.round(tok * mult)));
}

export function parseExcerptMaxChars(): number {
  const raw = process.env.LAW_CHAT_EXCERPT_MAX_CHARS?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 560;
  if (!Number.isFinite(n) || n < 80) return 560;
  return Math.min(4000, n);
}

/**
 * 조·항·호 경계를 우선으로 maxChars 이하로 자름 (너무 긴 청크 방지).
 */
export function truncateChunkAtLawBoundary(
  text: string,
  maxChars: number,
): string {
  const t = text.trim();
  if (maxChars < 64) return t.slice(0, Math.max(0, maxChars));
  if (t.length <= maxChars) return t;

  const head = t.slice(0, maxChars);
  const boundaryRes = [
    /\n(?=제\s*\d+(?:조의\d+)?조)/g,
    /\n(?=\d+\s*항(?:\s|$|\.))/g,
    /\n(?=\d+\s*호(?:\s|$|\.))/g,
    /\n(?=[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮])/g,
  ];
  let cut = -1;
  for (const re of boundaryRes) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(head)) !== null) {
      if (m.index >= maxChars * 0.2) cut = Math.max(cut, m.index);
    }
  }
  if (cut > maxChars * 0.25) {
    return `${head.slice(0, cut).trimEnd()}\n…`;
  }

  const para = head.lastIndexOf("\n\n", maxChars - 40);
  if (para > maxChars * 0.2) {
    return `${head.slice(0, para).trimEnd()}\n…`;
  }
  return `${head.trimEnd()}…`;
}

export function formatLawSourceLine(
  metadata: Record<string, unknown> | null,
  sourceTitle: string | null,
): string {
  const lawName =
    typeof metadata?.law_name_kr === "string"
      ? metadata.law_name_kr.trim()
      : "";
  const title = (sourceTitle ?? "").trim();
  const parts: string[] = [];
  if (lawName) parts.push(lawName);
  if (title) parts.push(title);
  if (parts.length) return parts.join(" · ");
  return title || "출처 미상";
}
