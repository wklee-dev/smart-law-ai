/** HS 해설 출처 — DB·RPC 에는 항상 `WCO` / `KR` (대문자) 저장 */
export type HsDivisionCode = "KR" | "WCO";

/** `wco`, `WCO`, npm 스크립트명 등 → `WCO` */
export function normalizeHsDivision(raw: string | undefined): HsDivisionCode {
  const d = (raw ?? "WCO").trim();
  const upper = d.toUpperCase();
  if (upper === "KR" || d.includes("한국")) return "KR";
  if (upper === "WCO" || d.toLowerCase() === "wco") return "WCO";
  return "WCO";
}
