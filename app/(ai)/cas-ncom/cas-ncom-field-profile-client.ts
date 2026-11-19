import type { CasAuthSession } from "@/app/(ai)/cas-ncom/cas-auth-storage";
import {
  casGatewayRequestHeaders,
  loadCasGatewayMode,
} from "@/app/(ai)/cas-ncom/cas-gateway-mode";
import type {
  NcomFieldProfileApi,
  SaveUserFieldProfileBody,
  UserFieldProfile,
} from "@/app/lib/cas-ncom-user-field-profile-server";

type ProfileApiResponse = {
  ok?: boolean;
  error?: string;
  authRequired?: boolean;
} & Partial<UserFieldProfile>;

type EnsureSession = () => Promise<CasAuthSession>;
type OnAuthFailure = () => void;

async function profileFetch<T>(
  path: string,
  init: RequestInit,
  onAuthFailure: OnAuthFailure,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: casGatewayRequestHeaders(loadCasGatewayMode(), {
      ...(init.headers as Record<string, string>),
    }),
  });
  const data = (await res.json()) as ProfileApiResponse & T;

  if (res.status === 401 || data.authRequired) {
    onAuthFailure();
    throw new Error(data.error ?? "세션이 만료되었습니다. 다시 로그인하세요.");
  }

  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? "필드 프로필 요청 실패");
  }

  return data as T;
}

export async function fetchUserFieldProfile(
  api: NcomFieldProfileApi,
  ensureSession: EnsureSession,
  onAuthFailure: OnAuthFailure,
): Promise<UserFieldProfile> {
  const session = await ensureSession();
  const params = new URLSearchParams({ api });
  return profileFetch<UserFieldProfile>(
    `/api/cas-ncom/auth/user-field-profile?${params}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.token}`,
        Accept: "application/json",
      },
    },
    onAuthFailure,
  );
}

export async function saveUserFieldProfileViaApi(
  payload: SaveUserFieldProfileBody,
  ensureSession: EnsureSession,
  onAuthFailure: OnAuthFailure,
): Promise<UserFieldProfile> {
  const session = await ensureSession();
  return profileFetch<UserFieldProfile>(
    "/api/cas-ncom/auth/user-field-profile",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    onAuthFailure,
  );
}

export const FIELD_PROFILE_REQUIRED_MSG =
  "인터페이스 항목이 설정되지 않았습니다.\n공통/란/모델규격 항목을 먼저 설정한 후 조회하세요.";

export function assertFieldProfileConfigured(profile: UserFieldProfile): void {
  if (!profile.hasRestrictions) {
    throw new Error(FIELD_PROFILE_REQUIRED_MSG);
  }
}
