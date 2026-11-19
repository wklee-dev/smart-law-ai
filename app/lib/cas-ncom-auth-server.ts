import {
  buildCasNcomUrl,
  CAS_NCOM_API,
  type CasGatewayMode,
  getCasNcomApiBaseUrl,
} from "@/app/lib/cas-ncom-api-paths";
import {
  buildGatewayHeaders,
  gatewayConnectionError,
} from "@/app/lib/cas-ncom-gateway-client";

export type CasLoginResult = {
  apiBaseUrl: string;
  token: string;
  userId: string;
  userName: string;
  expiresAt: string;
};

export class CasNcomAuthError extends Error {
  readonly authRequired = true;

  constructor(message: string) {
    super(message);
    this.name = "CasNcomAuthError";
  }
}

export async function loginCasUser(
  userId: string,
  password: string,
  gatewayMode: CasGatewayMode = "production",
): Promise<CasLoginResult> {
  const trimmedId = userId.trim();
  if (!trimmedId || !password) {
    throw new Error("CAS userId와 password를 입력하세요.");
  }

  const url = buildCasNcomUrl(CAS_NCOM_API.authLogin, undefined, gatewayMode);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: buildGatewayHeaders({
        contentType: "application/json",
        accept: "application/json",
      }),
      body: JSON.stringify({ userId: trimmedId, password }),
      cache: "no-store",
    });
  } catch (e) {
    throw gatewayConnectionError(url, e);
  }

  const body = (await res.json().catch(() => ({}))) as {
    status?: string;
    token?: string;
    userId?: string;
    userName?: string;
    expiresAt?: string;
    message?: string;
  };

  if (res.status === 503) {
    throw new Error(
      formatCasLoginUnavailableMessage(
        gatewayMode,
        getCasNcomApiBaseUrl(gatewayMode),
        body.message,
      ),
    );
  }

  if (!res.ok || body.status !== "ok" || !body.token) {
    throw new Error(body.message?.trim() || "CAS 로그인에 실패했습니다.");
  }

  return {
    apiBaseUrl: getCasNcomApiBaseUrl(gatewayMode),
    token: body.token,
    userId: body.userId?.trim() || trimmedId,
    userName: body.userName?.trim() || trimmedId,
    expiresAt: body.expiresAt ?? "",
  };
}

export function extractBearerToken(authorizationHeader: string | null): string {
  const raw = authorizationHeader?.trim() ?? "";
  if (!raw.toLowerCase().startsWith("bearer ")) return "";
  return raw.slice(7).trim();
}

export function requireBearerToken(authorizationHeader: string | null): string {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    throw new CasNcomAuthError("CAS 로그인이 필요합니다.");
  }
  return token;
}

function formatCasLoginUnavailableMessage(
  gatewayMode: CasGatewayMode,
  apiBaseUrl: string,
  gatewayMessage?: string,
): string {
  const modeLabel = gatewayMode === "local" ? "로컬" : "운영";
  const raw = gatewayMessage?.trim() ?? "";
  if (
    raw.includes("Login service is not configured") ||
    raw.includes("not configured")
  ) {
    if (gatewayMode === "production") {
      return (
        `[${modeLabel} Gateway] ${apiBaseUrl} — 로그인 서비스가 설정되지 않았습니다. ` +
        "운영 HanjooGatewayAPI 서버에 HANJOO_JWT_SECRET, DB_HOST/DB_USER/DB_PASSWORD/DB_NAME을 OS 환경변수로 등록한 뒤 서비스를 재시작하세요."
      );
    }
    return (
      `[${modeLabel} Gateway] ${apiBaseUrl} — 로그인 서비스가 설정되지 않았습니다. ` +
      "Gateway PC에서 HanjooGatewayAPI .env(HANJOO_JWT_SECRET, DB_*) 확인 후 dotnet run으로 실행하세요."
    );
  }
  return (
    `[${modeLabel} Gateway] ${apiBaseUrl} — ` +
    (raw ||
      "Gateway 로그인 서비스를 사용할 수 없습니다. HANJOO_JWT_SECRET 설정을 확인하세요.")
  );
}
