import type { AdminRulesSourceWithCrawl } from "@/app/lib/admin-rules-crawl-targets-server";
import type { AdminRulesDb } from "@/app/lib/admin-rules-server";
import { tableExists } from "@/app/lib/admin-rules-server";

export type AnnexSatelliteMatch = {
  hostParam: string;
  hostDescription: string;
  annexIds: number[];
  matchedAnnexTitles: string[];
};

/** 단독으로 쓰이면 오매칭이 많은 토큰 */
const WEAK_TOKENS = new Set([
  "평가",
  "영상",
  "검색",
  "교육",
  "기록",
  "점검",
  "운영",
  "관리",
  "신청",
  "보고",
  "확인",
  "대장",
]);

const MATCH_STOP = new Set([
  "등",
  "및",
  "에",
  "의",
  "을",
  "를",
  "이",
  "가",
  "은",
  "는",
  "로",
  "으로",
  "관한",
  "등에",
  "훈령",
  "고시",
  "규칙",
  "법",
  "시행령",
  "시행규칙",
  "요령",
  "세칙",
  "지침",
  "에관한",
  "등에관한",
  "기준",
  "운영",
  "관리",
  "에",
  "한",
]);

/** 별표 제목 매칭용 토큰 (요청 규칙명에서 추출) */
export function extractAnnexMatchTokens(lawName: string): string[] {
  const norm = lawName.trim().replace(/\s+/g, " ");
  const raw = norm.split(/[^\w가-힣·]+/u).filter(Boolean);
  const tokens = new Set<string>();
  for (const part of raw) {
    const p = part.trim();
    if (!p) continue;
    const lower = p.toLowerCase();
    if (/^x[\s-]?ray$/i.test(p) || lower === "x-ray") {
      tokens.add("x-ray");
      continue;
    }
    if (p.length < 2) continue;
    if (MATCH_STOP.has(p) || MATCH_STOP.has(lower)) continue;
    tokens.add(lower);
    if (p.length >= 4) {
      tokens.add(lower.slice(0, 3));
    }
  }
  return [...tokens].filter((t) => t.length >= 2 || t === "x-ray");
}

function isStrongMatchToken(tok: string): boolean {
  if (tok === "x-ray") return true;
  if (tok.length >= 5 && !WEAK_TOKENS.has(tok)) return true;
  if (tok.length >= 4 && !WEAK_TOKENS.has(tok) && tok.endsWith("기")) return true;
  return false;
}

function strongMatchTokens(lawName: string): string[] {
  return extractAnnexMatchTokens(lawName).filter(isStrongMatchToken);
}

function annexTitleMatchScore(title: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const t = title.toLowerCase().replace(/\s+/g, "");
  let hits = 0;
  let hasXray = false;
  for (const tok of tokens) {
    const needle = tok.replace(/\s+/g, "");
    if (!needle) continue;
    if (needle === "x-ray") {
      if (/x[\s-]?ray/i.test(title)) {
        hits += 2;
        hasXray = true;
      }
      continue;
    }
    if (t.includes(needle)) hits += 1;
  }
  if (hits === 0) return 0;
  if (hasXray && hits >= 2) return hits;
  if (hits >= 2) return hits;
  return 0;
}

type AnnexRow = { param: string; id: number; annex_title: string; law_name: string };

/**
 * 본문·부칙·별표가 없는 규칙명 → 다른 param의 admin_rule_annex 행 매칭
 */
export async function findAnnexSatelliteMatch(
  db: AdminRulesDb,
  lawDescription: string,
): Promise<AnnexSatelliteMatch | null> {
  const tokens = strongMatchTokens(lawDescription);
  if (tokens.length === 0) return null;
  if (!(await tableExists(db, "admin_rule_annex"))) return null;

  const likes = tokens
    .slice(0, 10)
    .map(() => `LOWER(COALESCE(annex_title,'')) LIKE ?`);
  const binds = tokens.slice(0, 10).map((t) => `%${t.replace(/%/g, "")}%`);
  const sql = `SELECT param, id, annex_title, COALESCE(law_name,'') AS law_name FROM admin_rule_annex WHERE ${likes.join(" OR ")}`;

  const rows = (await db.all(sql, binds)) as AnnexRow[];
  if (rows.length === 0) return null;

  const byParam = new Map<
    string,
    { score: number; ids: number[]; titles: string[]; lawName: string }
  >();
  for (const row of rows) {
    const hits = annexTitleMatchScore(row.annex_title ?? "", tokens);
    if (hits === 0) continue;
    const param = String(row.param ?? "").trim();
    if (!param) continue;
    const cur = byParam.get(param) ?? {
      score: 0,
      ids: [],
      titles: [],
      lawName: String(row.law_name ?? "").trim(),
    };
    cur.score += hits;
    cur.ids.push(Number(row.id));
    cur.titles.push(String(row.annex_title ?? "").trim());
    if (!cur.lawName && row.law_name) cur.lawName = String(row.law_name).trim();
    byParam.set(param, cur);
  }

  if (byParam.size === 0) return null;

  let bestParam = "";
  let best = { score: 0, ids: [] as number[], titles: [] as string[], lawName: "" };
  for (const [param, v] of byParam) {
    const rank = v.score * 100 + v.ids.length;
    const bestRank = best.score * 100 + best.ids.length;
    if (rank > bestRank) {
      bestParam = param;
      best = v;
    }
  }
  if (!bestParam || best.ids.length === 0) return null;
  if (best.score < 1) return null;

  let hostDescription = best.lawName;
  if (!hostDescription && (await tableExists(db, "rule_master"))) {
    const rm = (await db.get(
      "SELECT description FROM rule_master WHERE param = ? LIMIT 1",
      [bestParam],
    )) as { description?: string } | undefined;
    hostDescription = String(rm?.description ?? "").trim();
  }

  return {
    hostParam: bestParam,
    hostDescription: hostDescription || bestParam,
    annexIds: [...new Set(best.ids)],
    matchedAnnexTitles: best.titles,
  };
}

/** 목록 API: 미적재 건에 호스트 별표가 있으면 `table_in_db`·위임 메타 설정 */
export async function applySatelliteAnnexFlagsToSources(
  db: AdminRulesDb,
  sources: AdminRulesSourceWithCrawl[],
): Promise<void> {
  for (const s of sources) {
    if (s.table_in_db) continue;
    const match = await findAnnexSatelliteMatch(db, s.description ?? "");
    if (!match) continue;
    s.table_in_db = true;
    s.satellite_annex_host_param = match.hostParam;
    s.satellite_annex_host_description = match.hostDescription;
    s.satellite_matched_annex_count = match.annexIds.length;
    s.table_presence = {
      addendum: false,
      annex: true,
      attachment: true,
    };
  }
}
