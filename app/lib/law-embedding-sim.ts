/** Supabase pgvector / JSON 등에서 읽은 임베딩을 숫자 배열로 통일 */

export function parseVector(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const n = raw.map((x) => Number(x));
    return n.length > 0 && n.every((x) => Number.isFinite(x)) ? n : null;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t.startsWith("[") && t.endsWith("]")) {
      try {
        const j = JSON.parse(t) as unknown;
        return parseVector(j);
      } catch {
        return null;
      }
    }
    if (t.startsWith("{") && t.endsWith("}")) {
      const inner = t.slice(1, -1);
      const parts = inner.split(",").map((s) => Number(s.trim()));
      if (parts.length > 0 && parts.every((x) => Number.isFinite(x))) {
        return parts;
      }
    }
    const inner = t
      .replace(/^\(/, "")
      .replace(/\)$/, "")
      .replace(/^\{/, "")
      .replace(/\}$/, "");
    const parts = inner.split(",").map((s) => Number(s.trim()));
    if (parts.length > 0 && parts.every((x) => Number.isFinite(x))) {
      return parts;
    }
  }
  return null;
}

/** L2 정규화되지 않은 경우 대비 코사인 유사도 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}
