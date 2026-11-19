import {
  fetchEflawLawSearchXml,
  parseEflawLawSearchXml,
  type EflawLawSearchHit,
} from "@/app/lib/law-eflaw-search-parse";

export type FetchLawIdResult =
  | { ok: true; hit: EflawLawSearchHit; requestUrl: string }
  | { ok: false; error: string; requestUrl?: string };

function lawApiOc(): string {
  return (
    process.env.LAW_API_OC?.trim() ||
    process.env.LAW_OC?.trim() ||
    "hanjoo_api"
  );
}

/** 제공API명(법령명)으로 eflaw 검색 → 약칭명·법령ID */
export async function fetchLawIdForApiName(
  apiName: string,
): Promise<FetchLawIdResult> {
  const name = apiName.trim();
  if (!name) {
    return { ok: false, error: "제공API명이 비어 있습니다." };
  }

  try {
    const { xml, requestUrl } = await fetchEflawLawSearchXml(name, lawApiOc());
    const hit = parseEflawLawSearchXml(xml);
    if (!hit) {
      const totalMatch = xml.match(/<totalCnt>(\d+)<\/totalCnt>/i);
      const total = totalMatch ? totalMatch[1] : "?";
      return {
        ok: false,
        error: `검색 결과 없음 (totalCnt=${total})`,
        requestUrl,
      };
    }
    return { ok: true, hit, requestUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
