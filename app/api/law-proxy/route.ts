import { NextRequest, NextResponse } from "next/server";

type ProxyRequestBody = {
  params?: Record<string, unknown>;
  /** true이면 JSON/XML 베이스 URL의 lawService.do를 lawSearch.do로 바꿔 목록 조회에 사용 */
  useLawSearchEndpoint?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ProxyRequestBody;

    const oc = process.env.LAW_API_OC?.trim();
    const lawXmlServiceUrl = process.env.LAW_XMLSERVICE_URL?.trim();
    const lawJsonServiceUrl = process.env.LAW_JSONSERVICE_URL?.trim();

    if (!oc) {
      return NextResponse.json(
        { error: ".env.local에 LAW_API_OC가 설정되어 있지 않습니다." },
        { status: 500 },
      );
    }

    if (!lawXmlServiceUrl) {
      return NextResponse.json(
        { error: ".env.local에 LAW_XMLSERVICE_URL이 설정되어 있지 않습니다." },
        { status: 500 },
      );
    }

    if (!lawJsonServiceUrl) {
      return NextResponse.json(
        { error: ".env.local에 LAW_JSONSERVICE_URL이 설정되어 있지 않습니다." },
        { status: 500 },
      );
    }

    const params = body.params ?? {};
    const useLawSearch = Boolean(body.useLawSearchEndpoint);

    const fileTypeRaw = params.type;
    const fileType = String(fileTypeRaw ?? "XML").trim().toUpperCase();

    let baseUrl = "";

    if (fileType === "XML") {
      baseUrl = lawXmlServiceUrl;
    } else if (fileType === "JSON") {
      baseUrl = lawJsonServiceUrl;
    } else {
      return NextResponse.json(
        { error: `지원하지 않는 파일타입입니다: ${fileType}` },
        { status: 400 },
      );
    }

    let normalizedBaseUrl = normalizeLawApiBaseUrl(baseUrl);
    if (useLawSearch) {
      normalizedBaseUrl = normalizedBaseUrl.replace(
        /lawService\.do/gi,
        "lawSearch.do",
      );
    }
    const url = new URL(normalizedBaseUrl);
    url.searchParams.set("OC", oc);

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;

      const stringValue = String(value).trim();
      if (!stringValue) continue;

      url.searchParams.set(key, stringValue);
    }

    const requestUrl = url.toString();
    const externalResponse = await fetchWithTimeout(requestUrl, 15000);

    const contentType = externalResponse.headers.get("content-type") ?? "";
    const rawText = await externalResponse.text();

    let parsedJson: unknown | null = null;
    if (
      fileType === "JSON" ||
      contentType.toLowerCase().includes("application/json")
    ) {
      try {
        parsedJson = JSON.parse(rawText);
      } catch {
        parsedJson = null;
      }
    }

    return NextResponse.json({
      ok: externalResponse.ok,
      status: externalResponse.status,
      statusText: externalResponse.statusText,
      contentType,
      requestedUrl: requestUrl,
      rawText,
      parsedJson,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeLawApiBaseUrl(rawUrl: string) {
  const url = new URL(rawUrl);

  // 국가법령정보 Open API는 law.go.kr 도메인 기준으로 사용하는 것이 안정적이다.
  if (url.hostname === "www.law.go.kr") {
    url.hostname = "law.go.kr";
  }

  return url.toString();
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`외부 API 호출 실패 (${url}): ${message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}