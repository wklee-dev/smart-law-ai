import { normalizeLawIdForStorage } from "@/app/shared/law-id";

export type EflawLawSearchHit = {
  lawShortName: string;
  lawId: string;
  lawNameKo?: string;
  historyCode?: string;
};

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  const inner = m[1] ?? "";
  const cdata = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
  return (cdata ? cdata[1] : inner).trim();
}

/** 국가법령정보 lawSearch.do (target=eflaw) XML → 약칭명·법령ID */
export function parseEflawLawSearchXml(xml: string): EflawLawSearchHit | null {
  const trimmed = xml.trim();
  if (!trimmed) return null;

  const resultCode = extractTag(trimmed, "resultCode");
  if (resultCode && resultCode !== "00") return null;

  const totalRaw = extractTag(trimmed, "totalCnt");
  const total = totalRaw ? Number.parseInt(totalRaw, 10) : 0;
  if (Number.isFinite(total) && total <= 0) return null;

  const blocks = [...trimmed.matchAll(/<law\b[^>]*>([\s\S]*?)<\/law>/gi)];
  if (blocks.length === 0) return null;

  const preferred =
    blocks.find((b) => extractTag(b[1] ?? "", "현행연혁코드") === "현행") ??
    blocks[0];

  const block = preferred[1] ?? "";
  const lawShortName = extractTag(block, "법령약칭명");
  const lawId = normalizeLawIdForStorage(extractTag(block, "법령ID"));
  if (!lawId) return null;

  return {
    lawShortName,
    lawId,
    lawNameKo: extractTag(block, "법령명한글") || undefined,
    historyCode: extractTag(block, "현행연혁코드") || undefined,
  };
}

export function buildEflawLawSearchUrl(query: string, oc: string): string {
  const raw =
    process.env.LAW_XMLSERVICE_URL?.trim() ||
    "https://www.law.go.kr/DRF/lawSearch.do";
  const base = raw.replace(/lawService\.do$/i, "lawSearch.do");
  const url = new URL(base);
  if (url.hostname === "law.go.kr") {
    url.hostname = "www.law.go.kr";
  }
  if (url.protocol === "http:") {
    url.protocol = "https:";
  }
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", "eflaw");
  url.searchParams.set("query", query);
  return url.toString();
}

export async function fetchEflawLawSearchXml(
  query: string,
  oc: string,
  timeoutMs = 20_000,
): Promise<{ xml: string; requestUrl: string }> {
  const requestUrl = buildEflawLawSearchUrl(query, oc);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Accept: "application/xml, text/xml, */*",
        "User-Agent": "smart-law-ai/1.0",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const xml = await res.text();
    if (!res.ok) {
      throw new Error(
        `법령 검색 API HTTP ${res.status} ${res.statusText}`.trim(),
      );
    }
    return { xml, requestUrl };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("abort")) {
      throw new Error(
        `법령 검색 API 시간 초과(${timeoutMs / 1000}초). 잠시 후 다시 시도하세요.`,
      );
    }
    throw new Error(`법령 검색 API 호출 실패: ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }
}
