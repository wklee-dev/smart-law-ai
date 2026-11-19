/**
 * 국가법령정보 Open API 공통 GET (서버 전용).
 * 클라이언트는 `/api/law-proxy` POST 를 쓰고, 서버 라우트는 이 모듈을 직접 호출합니다.
 */

function normalizeLawApiBaseUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.hostname === "www.law.go.kr") {
    url.hostname = "law.go.kr";
  }
  return url.toString();
}

export type LawOpenApiFetchResult = {
  ok: boolean;
  status: number;
  statusText: string;
  contentType: string;
  requestedUrl: string;
  rawText: string;
  parsedJson: unknown | null;
};

export async function fetchLawOpenApiJson(
  params: Record<string, string | number | undefined | null>,
  options?: { timeoutMs?: number },
): Promise<LawOpenApiFetchResult> {
  const oc = process.env.LAW_API_OC?.trim();
  const lawJsonServiceUrl = process.env.LAW_JSONSERVICE_URL?.trim();

  if (!oc) {
    throw new Error(".env 에 LAW_API_OC 가 없습니다.");
  }
  if (!lawJsonServiceUrl) {
    throw new Error(".env 에 LAW_JSONSERVICE_URL 이 없습니다.");
  }

  const normalizedBaseUrl = normalizeLawApiBaseUrl(lawJsonServiceUrl);
  const url = new URL(normalizedBaseUrl);
  url.searchParams.set("OC", oc);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const s = String(value).trim();
    if (!s) continue;
    url.searchParams.set(key, s);
  }

  const requestedUrl = url.toString();
  const timeoutMs = options?.timeoutMs ?? 20000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let externalResponse: Response;
  try {
    externalResponse = await fetch(requestedUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`외부 API 호출 실패: ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = externalResponse.headers.get("content-type") ?? "";
  const rawText = await externalResponse.text();
  let parsedJson: unknown | null = null;
  if (contentType.toLowerCase().includes("application/json")) {
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      parsedJson = null;
    }
  } else {
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      parsedJson = null;
    }
  }

  return {
    ok: externalResponse.ok,
    status: externalResponse.status,
    statusText: externalResponse.statusText,
    contentType,
    requestedUrl,
    rawText,
    parsedJson,
  };
}
