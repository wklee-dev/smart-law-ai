/** HS 해설 SQLite meta 행 → RAG 청크 텍스트 */

export type HsManualMetaRow = {
  id: number;
  aply_year: string;
  manl_orgn_tpcd: string | null;
  manl_orgn_tpcd_nm: string | null;
  manl_ut_tpcd: string;
  manl_ut_tpcd_nm: string | null;
  manl_ut_sgn: string;
  display_title: string | null;
};

const MAX_CHUNK_CHARS = 5000;

export function contentTypeForUnitTpcd(manlUtTpcd: string): "sct" | "hstd" | "hsfd" {
  if (manlUtTpcd === "01") return "sct";
  if (manlUtTpcd === "02") return "hstd";
  return "hsfd";
}

export function sourceTypeForUnitTpcd(manlUtTpcd: string): string {
  if (manlUtTpcd === "01") return "section";
  if (manlUtTpcd === "02") return "chapter";
  if (manlUtTpcd === "03") return "heading";
  return "other";
}

export function unitLabelKo(manlUtTpcd: string, manlUtTpcdNm: string | null): string {
  if (manlUtTpcdNm?.trim()) return manlUtTpcdNm.trim();
  if (manlUtTpcd === "01") return "부";
  if (manlUtTpcd === "02") return "류";
  if (manlUtTpcd === "03") return "호";
  return "단위";
}

export function divisionFromMeta(meta: HsManualMetaRow): "KR" | "WCO" {
  const tpcd = (meta.manl_orgn_tpcd ?? "").trim().toUpperCase();
  const nm = meta.manl_orgn_tpcd_nm ?? "";
  if (tpcd === "KR" || nm.includes("한국")) return "KR";
  return "WCO";
}

export function buildHsChunkHeader(
  meta: HsManualMetaRow,
  division: "KR" | "WCO",
  langCode: string,
): string {
  const divLabel = division === "KR" ? "한국" : "WCO";
  const unit = unitLabelKo(meta.manl_ut_tpcd, meta.manl_ut_tpcd_nm);
  const hs = meta.manl_ut_sgn.trim();
  const title = (meta.display_title ?? "").trim().split(/\r?\n/)[0]?.slice(0, 200);
  const lines = [
    `[HS 해설] 적용연도:${meta.aply_year} 출처:${divLabel} 단위:${unit} HS:${hs}`,
  ];
  if (title) lines.push(`제목: ${title}`);
  lines.push(`언어: ${langCode}`);
  return lines.join("\n");
}

export function buildFullChunkText(
  meta: HsManualMetaRow,
  body: string,
  division: "KR" | "WCO",
  langCode: string,
): string {
  const header = buildHsChunkHeader(meta, division, langCode);
  const trimmed = body.trim();
  if (!trimmed) return "";
  return `${header}\n---\n${trimmed}`;
}

/** 긴 본문을 chunk_index 별로 분할 */
export function splitBodyIntoChunks(body: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const parts: string[] = [];
  const paragraphs = trimmed.split(/\n{2,}/);
  let buf = "";

  for (const p of paragraphs) {
    const piece = p.trim();
    if (!piece) continue;
    const next = buf ? `${buf}\n\n${piece}` : piece;
    if (next.length <= maxChars) {
      buf = next;
      continue;
    }
    if (buf) parts.push(buf);
    if (piece.length <= maxChars) {
      buf = piece;
      continue;
    }
    for (let i = 0; i < piece.length; i += maxChars) {
      parts.push(piece.slice(i, i + maxChars));
    }
    buf = "";
  }
  if (buf) parts.push(buf);
  return parts.length ? parts : [trimmed.slice(0, maxChars)];
}
