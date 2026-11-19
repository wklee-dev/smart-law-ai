/**
 * 현행법령(시행일) 본문 조항호목 조회 API — target=eflawjosub
 * @see 국가법령정보센터 OPEN API 활용가이드
 */

import { lawIdForStatuteOpenApi } from "@/app/shared/law-id";

export function padSixDigits(raw: string | number): string {
  const s = String(raw).replace(/\D/g, "");
  if (!s) return "000000";
  const n = parseInt(s, 10);
  if (!Number.isFinite(n)) {
    return s.slice(0, 6).padStart(6, "0");
  }
  return String(n).padStart(6, "0");
}

export type EflawJosubFetchParams = {
  /** 법령ID (API ID). MST 와 택일 */
  lawApiId?: string;
  /** 법령 마스터 일련번호 (lsi_seq). ID 와 택일 */
  mst?: string;
  /** 시행일자 YYYYMMDD (선택, 입력 시 8자리만 허용) */
  efYd?: string;
  /** 조 (선택, 입력 시 6자리 패딩) */
  jo?: string;
  /** 항 (6자리, 선택) */
  hang?: string;
  /** 호 (6자리, 선택) */
  ho?: string;
  /** 목 (가·나·다 또는 API 예시의 la 등, UTF-8) */
  mok?: string;
};

export function buildEflawJosubSearchParams(
  p: EflawJosubFetchParams,
): Record<string, string> {
  const id = p.lawApiId?.trim();
  const mst = p.mst?.trim();
  if (!id && !mst) {
    throw new Error("lawApiId(법령ID) 또는 mst 중 하나는 필요합니다.");
  }
  const out: Record<string, string> = {
    target: "eflawjosub",
    type: "JSON",
  };
  if (id) out.ID = lawIdForStatuteOpenApi(id);
  if (mst) out.MST = mst;

  const efRaw = (p.efYd ?? "").replace(/\D/g, "");
  if ((p.efYd ?? "").trim() !== "") {
    if (efRaw.length !== 8) {
      throw new Error("efYd 는 YYYYMMDD 8자리여야 합니다.");
    }
    out.efYd = efRaw;
  }

  if ((p.jo ?? "").trim() !== "") {
    out.JO = padSixDigits(p.jo ?? "");
  }

  if (p.hang?.trim()) out.HANG = padSixDigits(p.hang);
  if (p.ho?.trim()) out.HO = padSixDigits(p.ho);
  if (p.mok?.trim()) out.MOK = p.mok.trim();
  return out;
}

/** law.go.kr JSON 에서 조문·항·호·목 본문과 제목 추출 (필드명 한글 가정) */
export function extractEflawJosubDisplayParts(parsed: unknown): {
  sourceTitle: string;
  chunkText: string;
} {
  const parts: string[] = [];
  let title = "";

  const pushTitle = (v: string) => {
    const t = v.trim();
    if (t && !title) title = t;
  };

  const pushBody = (v: string) => {
    const t = v.trim();
    if (t) parts.push(t);
  };

  const walk = (node: unknown, keyHint?: string): void => {
    if (node == null) return;
    if (typeof node === "string") {
      if (
        keyHint &&
        (keyHint.includes("제목") || keyHint.includes("조문제목"))
      ) {
        pushTitle(node);
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") {
        if (k.includes("조문제목") || k === "조문제목") pushTitle(v);
        else if (
          k.includes("조문내용") ||
          k.includes("항내용") ||
          k.includes("호내용") ||
          k.includes("목내용")
        ) {
          pushBody(v);
        }
      }
      walk(v, k);
    }
  };

  walk(parsed);

  const chunkText = parts.join("\n\n").trim() || JSON.stringify(parsed);
  const sourceTitle =
    title ||
    (chunkText.length > 120 ? `${chunkText.slice(0, 120)}…` : chunkText);

  return { sourceTitle, chunkText };
}

export function buildEflawJosubSourceKey(p: {
  lawId: string;
  efYd: string;
  jo: string;
  hang?: string;
  ho?: string;
  mok?: string;
}): string {
  const ef = (p.efYd ?? "").replace(/\D/g, "");
  const j = (p.jo ?? "").trim() ? padSixDigits(p.jo) : "";
  const h = p.hang ? padSixDigits(p.hang) : "";
  const o = p.ho ? padSixDigits(p.ho) : "";
  const m = p.mok?.trim() ?? "";
  return `eflawjosub:${p.lawId}:${ef}:${j}:${h}:${o}:${m}`;
}
