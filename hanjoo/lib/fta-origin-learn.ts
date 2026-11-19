/**
 * FTA PASS 약어(co_prt_cd / abbreviation)를 학습해 참조 팝업 항목을 구성한다. cl_fta_* 는 사용하지 않는다.
 *
 * 원산지확인서 = FTA PASS 약어 그대로(또는 CTH + BU(BD) 형태로 축약)
 * 원산지증명서 기재부호는 FTA PASS 약어에서 변환하지 않는다(fta-co-codes.ts 참조).
 */

export type OriginLearnDetail = {
  wholly: string;
  process: string;
  change: string;
  deMinimis: string;
  vaBuildUp: string;
  vaBuildDown: string;
  vaMc: string;
  vaNet: string;
  confirm: string;
};

/** 협정 최소허용기준(de minimis). HS별이 아니라 협정 일반 조항. */
const DE_MINIMIS_BY_FTA: Record<string, string> = {
  FCL: "조정가격의 8% 이하 및 6단위 이상의 세번변경(CTSH)",
};

function pct(kind: "BD" | "BU" | "MC", code: string): string {
  const m = code.match(new RegExp(`\\b${kind}\\s*(\\d+)\\s*%`, "i"));
  if (!m) return "";
  const n = m[1];
  if (kind === "MC") return `MC ${n}% 이하`;
  return `${kind} ${n}% 이상`;
}

function changeLabel(code: string): string {
  const u = code.toUpperCase();
  if (/\bCTSH\b/.test(u)) return "CTSH [HS 6단위 이상의 세번 변경]";
  if (/\bCTH\b/.test(u)) return "CTH [HS 4단위 이상의 세번 변경]";
  if (/\bCC\b/.test(u)) return "CC [HS 2단위(류) 이상의 세번 변경]";
  return "";
}

function confirmLabel(code: string): string {
  const u = code.replace(/\s+/g, " ").trim();
  const change = /\bCTSH\b/i.test(u) ? "CTSH" : /\bCTH\b/i.test(u) ? "CTH" : /\bCC\b/i.test(u) ? "CC" : "";
  const bu = /\bBU\b/i.test(u);
  const bd = /\bBD\b/i.test(u);
  const mc = /\bMC\b/i.test(u);
  const wo = /\bWO\b/i.test(u);
  const sp = /\bSP\b/i.test(u);
  if (wo && !change && !bu && !bd && !mc && !sp) return "WO";
  const va =
    bu && bd ? "BU (BD)" : bu ? "BU" : bd ? "BD" : mc ? "MC" : "";
  const parts = [change, sp ? "SP" : "", va].filter(Boolean);
  return parts.length ? parts.join(" + ") : u;
}

export function learnOriginDetail(ftaCd: string, abbrev: string): OriginLearnDetail {
  const code = abbrev.replace(/\s+/g, " ").trim();
  const wo = /\bWO\b|완전생산/i.test(code);
  return {
    wholly: wo ? code : "",
    process: /\bSP\b/i.test(code) ? "특정가공공정(SP)" : "",
    change: changeLabel(code),
    deMinimis: DE_MINIMIS_BY_FTA[ftaCd.trim().toUpperCase()] ?? "",
    vaBuildUp: pct("BU", code),
    vaBuildDown: pct("BD", code),
    vaMc: pct("MC", code),
    vaNet: "",
    confirm: confirmLabel(code),
  };
}

export function originDetailNote(): string {
  return "원산지확인서는 FTA PASS 약어입니다. 원산지증명서 기재부호는 협정 서식 작성방법의 후보 부호이며, 실제 부호는 물품의 원산지판정 결과에 따라 정해집니다(판정: 미판정).";
}
