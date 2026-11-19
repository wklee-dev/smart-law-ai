import type { CasAuthSession } from "@/app/(ai)/cas-ncom/cas-auth-storage";
import {
  casGatewayRequestHeaders,
  loadCasGatewayMode,
} from "@/app/(ai)/cas-ncom/cas-gateway-mode";

type SearchApiResponse<T> = {
  ok?: boolean;
  items?: T[];
  total?: number;
  tCnt?: number;
  error?: string;
  authRequired?: boolean;
};

type EnsureSession = () => Promise<CasAuthSession>;
type OnAuthFailure = () => void;

export async function fetchCasNcomSearch<T>(
  path: string,
  params: URLSearchParams,
  ensureSession: EnsureSession,
  onAuthFailure: OnAuthFailure,
): Promise<{ items: T[]; total: number; tCnt: number }> {
  const session = await ensureSession();
  const res = await fetch(`${path}?${params}`, {
    cache: "no-store",
    headers: casGatewayRequestHeaders(loadCasGatewayMode(), {
      Authorization: `Bearer ${session.token}`,
      Accept: "application/json",
    }),
  });
  const data = (await res.json()) as SearchApiResponse<T>;

  if (res.status === 401 || data.authRequired) {
    onAuthFailure();
    throw new Error(data.error ?? "세션이 만료되었습니다. 다시 로그인하세요.");
  }

  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "조회 실패");
  }

  return {
    items: data.items ?? [],
    total: data.total ?? 0,
    tCnt: data.tCnt ?? 0,
  };
}
