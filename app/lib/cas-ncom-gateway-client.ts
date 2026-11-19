import { getCasNcomApiKey } from "@/app/lib/cas-ncom-api-paths";

export type GatewayErrorBody = {
  ok?: boolean;
  status?: string;
  message?: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function gatewayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function gatewayConnectionError(url: string, cause: unknown): Error {
  const host = gatewayHost(url);
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new Error(
    `Gateway 연결 실패 (${host}). HANJOO_GATEWAY_API_URL·API Key·네트워크를 확인하세요. (${detail})`,
  );
}

export function gatewayErrorMessage(
  body: GatewayErrorBody,
  status: number,
  scope: "cas.read" | "customs.read",
): string {
  if (str(body.message)) return str(body.message);
  if (status === 401) return "API Key 인증 실패";
  if (status === 403) return `${scope} 권한 없음`;
  if (status === 503) return "Gateway 또는 DB 연결 실패";
  return `Gateway 오류 (HTTP ${status})`;
}

/** CAS Bearer 전용 — 3M 수출증명서 등 X-API-Key 미사용 API */
export function buildCasBearerHeaders(options: {
  bearerToken: string;
  accept?: string;
}): Record<string, string> {
  const token = str(options.bearerToken);
  if (!token) {
    throw new Error("CAS 로그인이 필요합니다.");
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: options.accept ?? "application/xml",
  };
}

/** Gateway 공통 헤더 — X-API-Key(앱) + 선택 Bearer(사용자) */
export function buildGatewayHeaders(options?: {
  bearerToken?: string;
  accept?: string;
  contentType?: string;
}): Record<string, string> {
  const apiKey = getCasNcomApiKey();
  if (!apiKey) {
    throw new Error(
      "Gateway API Key가 설정되지 않았습니다. .env.local에 HANJOO_GATEWAY_API_KEY를 설정하세요.",
    );
  }

  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    Accept: options?.accept ?? "application/json",
  };
  if (options?.contentType) {
    headers["Content-Type"] = options.contentType;
  }
  const token = str(options?.bearerToken);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function gatewayJsonGet<T extends GatewayErrorBody>(
  url: string,
  scope: "cas.read" | "customs.read",
): Promise<{ ok: true; body: T; status: number }> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: buildGatewayHeaders(),
      cache: "no-store",
    });
  } catch (e) {
    throw gatewayConnectionError(url, e);
  }

  const body = (await res.json().catch(() => ({}))) as T;

  if (!res.ok || body.ok === false) {
    throw new Error(gatewayErrorMessage(body, res.status, scope));
  }

  return { ok: true, body, status: res.status };
}
