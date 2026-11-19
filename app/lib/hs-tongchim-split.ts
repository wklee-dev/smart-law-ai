export type TongchimSection = {
  ruleNo: number;
  ko: string;
  en: string;
};

function normNl(s: string): string {
  return s.replace(/\r\n/g, "\n").trim();
}

/** 국문 블록별 본문 → 통칙 번호 */
function splitKoBlocks(body: string): Map<number, string> {
  const m = new Map<number, string>();
  const t = normNl(body);
  if (!t) return m;
  if (/DB에 없습니다|국문 본문 없음/.test(t)) return m;

  const headerRe = /(?:^|\n{2,})통칙\s*제\s*(\d+)\s*호\s*(?:\n|$)/g;
  const markers: { ruleNo: number; index: number; contentStart: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = headerRe.exec(t)) !== null) {
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n < 1) continue;
    markers.push({
      ruleNo: n,
      index: match.index,
      contentStart: match.index + match[0].length,
    });
  }
  if (!markers.length) return m;

  /** API 래퍼·본문에 중복 헤더가 있으면 마지막 헤더 기준 */
  const lastStartByRule = new Map<number, number>();
  const headerIndexByRule = new Map<number, number>();
  for (const mk of markers) {
    lastStartByRule.set(mk.ruleNo, mk.contentStart);
    headerIndexByRule.set(mk.ruleNo, mk.index);
  }

  const finals = [...lastStartByRule.entries()]
    .map(([ruleNo, contentStart]) => ({
      ruleNo,
      index: headerIndexByRule.get(ruleNo)!,
      contentStart,
    }))
    .sort((a, b) => a.index - b.index);

  for (let i = 0; i < finals.length; i += 1) {
    const f = finals[i]!;
    const end = i + 1 < finals.length ? finals[i + 1]!.index : t.length;
    m.set(f.ruleNo, t.slice(f.contentStart, end).trim());
  }
  return m;
}

/**
 * 다음 블록이 영문 통칙 머리줄로 시작하는 위치 앞에서만 쪼갬 (줄바꿈 2개 이상).
 */
const EN_BLOCK_SPLIT =
  /\n\n+(?=(?:(?:General\s+Rule)|RULE|Rule)\s*\d+\s*(?:\n|$))/i;

/** 첫 줄: `General Rule 1`, `RULE 1`, `RULE1`, `Rule 1` 등 */
function parseEnChunk(
  chunk: string,
): { ruleNo: number; body: string } | null {
  const m = chunk.match(
    /^(?:(?:General\s+Rule)|RULE|Rule)\s*(\d+)\s*\n?/im,
  );
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1) return null;
  return { ruleNo: n, body: chunk.slice(m[0].length).trim() };
}

/** 영문 블록별 본문 → 통칙 번호 (API·WCO·DB 표기 차이 흡수) */
function splitEnBlocks(body: string): Map<number, string> {
  const out = new Map<number, string>();
  const t = normNl(body);
  if (!t) return out;
  if (/No English general rules|영문 본문 없음/i.test(t)) return out;

  const fillFromParts = (parts: string[]): boolean => {
    out.clear();
    for (const raw of parts) {
      const p = parseEnChunk(raw);
      if (p) out.set(p.ruleNo, p.body);
    }
    return out.size > 0;
  };

  const triple = t.split(
    /\n\n\n(?=(?:(?:General\s+Rule)|RULE|Rule)\s*\d+)/i,
  );
  if (triple.length > 1 && fillFromParts(triple)) return out;

  const doubleParts = t.split(EN_BLOCK_SPLIT);
  if (doubleParts.length > 1 && fillFromParts(doubleParts)) return out;

  const single = parseEnChunk(t);
  if (single) {
    out.clear();
    out.set(single.ruleNo, single.body);
    return out;
  }

  out.clear();
  const headOnly =
    /^(?:(?:General\s+Rule)|RULE|Rule)\s*(\d+)\s*$/i;
  const lines = t.split("\n");
  const blocks: { n: number; lines: string[] }[] = [];
  let cur: { n: number; lines: string[] } | null = null;
  for (const line of lines) {
    const hm = line.trim().match(headOnly);
    if (hm) {
      const n = Number(hm[1]);
      if (Number.isFinite(n) && n >= 1) {
        if (cur) blocks.push(cur);
        cur = { n, lines: [] };
        continue;
      }
    }
    if (cur) cur.lines.push(line);
  }
  if (cur) blocks.push(cur);
  if (blocks.length > 1) {
    for (const b of blocks) {
      out.set(b.n, b.lines.join("\n").trim());
    }
  }

  return out;
}

/** 통칙 탭용: 국·영 본문에서 통칙별로 정렬된 섹션 목록 */
export function parseTongchimPaneBodies(
  bodyKo: string,
  bodyEn: string,
): TongchimSection[] {
  const koMap = splitKoBlocks(bodyKo);
  const enMap = splitEnBlocks(bodyEn);
  const nums = new Set<number>([...koMap.keys(), ...enMap.keys()]);
  return [...nums]
    .sort((a, b) => a - b)
    .map((ruleNo) => ({
      ruleNo,
      ko: koMap.get(ruleNo) ?? "",
      en: enMap.get(ruleNo) ?? "",
    }));
}

export function tongchimRuleHasContent(s: TongchimSection): boolean {
  return Boolean(s.ko.trim() || s.en.trim());
}
