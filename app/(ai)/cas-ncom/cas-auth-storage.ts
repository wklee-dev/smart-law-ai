import {
  casGatewayRequestHeaders,
  loadCasGatewayMode,
} from "@/app/(ai)/cas-ncom/cas-gateway-mode";

export type CasAuthSession = {
  token: string;
  userId: string;
  userName: string;
  expiresAt: string;
};

const STORAGE_KEY = "cas-ncom-auth-session";

export function loadCasAuthSession(): CasAuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CasAuthSession;
    if (!parsed.token?.trim()) return null;
    if (parsed.expiresAt) {
      const exp = Date.parse(parsed.expiresAt);
      if (!Number.isNaN(exp) && exp <= Date.now()) {
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCasAuthSession(session: CasAuthSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearCasAuthSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export async function loginCasViaApi(
  userId: string,
  password: string,
  gatewayMode = loadCasGatewayMode(),
): Promise<CasAuthSession> {
  const res = await fetch("/api/cas-ncom/auth/login", {
    method: "POST",
    headers: casGatewayRequestHeaders(gatewayMode, {
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: JSON.stringify({ userId, password }),
    cache: "no-store",
  });
  const data = (await res.json()) as {
    ok?: boolean;
    token?: string;
    userId?: string;
    userName?: string;
    expiresAt?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.token) {
    throw new Error(data.error ?? "CAS 로그인에 실패했습니다.");
  }
  const session: CasAuthSession = {
    token: data.token,
    userId: data.userId ?? userId.trim(),
    userName: data.userName ?? userId.trim(),
    expiresAt: data.expiresAt ?? "",
  };
  saveCasAuthSession(session);
  return session;
}
