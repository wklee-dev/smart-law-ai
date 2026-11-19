import {
  buildCasNcomUrl,
  CAS_NCOM_API,
  type CasGatewayMode,
  getCasNcomApiBaseUrl,
} from "@/app/lib/cas-ncom-api-paths";
import { CasNcomAuthError } from "@/app/lib/cas-ncom-auth-server";
import {
  buildGatewayHeaders,
  gatewayConnectionError,
} from "@/app/lib/cas-ncom-gateway-client";

export type NcomFieldProfileApi = "ncomSearchQry" | "ncomSearchExpoQry";

export type UserFieldProfileField = {
  fieldKey: string;
  xmlName: string;
  selected: boolean;
  label?: string;
};

export type UserFieldProfileLevel = {
  tableNm: string;
  levelName: string;
  fields: UserFieldProfileField[];
};

export type UserFieldProfile = {
  apiBaseUrl: string;
  hasRestrictions: boolean;
  levels: UserFieldProfileLevel[];
};

export type SaveUserFieldProfileBody = {
  apiNm: NcomFieldProfileApi;
  levels: Array<{ level: string; fieldKeys: string[] }>;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function parseProfileBody(body: Record<string, unknown>): UserFieldProfile {
  const levelsRaw = Array.isArray(body.levels) ? body.levels : [];
  const levels: UserFieldProfileLevel[] = levelsRaw.map((lv) => {
    const level = lv as Record<string, unknown>;
    const fieldsRaw = Array.isArray(level.fields) ? level.fields : [];
    return {
      tableNm: str(level.tableNm),
      levelName: str(level.levelName),
      fields: fieldsRaw.map((f) => {
        const field = f as Record<string, unknown>;
        return {
          fieldKey: str(field.fieldKey),
          xmlName: str(field.xmlName),
          selected: field.selected === true,
          label: str(field.label) || undefined,
        };
      }),
    };
  });

  return {
    apiBaseUrl: "",
    hasRestrictions: body.hasRestrictions === true,
    levels,
  };
}

export async function getUserFieldProfile(
  api: NcomFieldProfileApi,
  bearerToken: string,
  gatewayMode: CasGatewayMode = "production",
): Promise<UserFieldProfile> {
  const token = str(bearerToken);
  if (!token) {
    throw new CasNcomAuthError("CAS 로그인이 필요합니다.");
  }

  const url = buildCasNcomUrl(
    CAS_NCOM_API.userFieldProfile,
    { api },
    gatewayMode,
  );

  let res: Response;
  try {
    res = await fetch(url, {
      headers: buildGatewayHeaders({
        bearerToken: token,
        accept: "application/json",
      }),
      cache: "no-store",
    });
  } catch (e) {
    throw gatewayConnectionError(url, e);
  }

  if (res.status === 401) {
    throw new CasNcomAuthError("세션이 만료되었습니다. 다시 로그인하세요.");
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(str(body.message) || `필드 프로필 조회 실패 (HTTP ${res.status})`);
  }

  const profile = parseProfileBody(body);
  profile.apiBaseUrl = getCasNcomApiBaseUrl(gatewayMode);
  return profile;
}

export async function saveUserFieldProfile(
  payload: SaveUserFieldProfileBody,
  bearerToken: string,
  gatewayMode: CasGatewayMode = "production",
): Promise<UserFieldProfile> {
  const token = str(bearerToken);
  if (!token) {
    throw new CasNcomAuthError("CAS 로그인이 필요합니다.");
  }

  const url = buildCasNcomUrl(CAS_NCOM_API.userFieldProfile, undefined, gatewayMode);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: buildGatewayHeaders({
        bearerToken: token,
        accept: "application/json",
        contentType: "application/json",
      }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (e) {
    throw gatewayConnectionError(url, e);
  }

  if (res.status === 401) {
    throw new CasNcomAuthError("세션이 만료되었습니다. 다시 로그인하세요.");
  }

  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(str(body.message) || `필드 프로필 저장 실패 (HTTP ${res.status})`);
  }

  const profile = parseProfileBody(body);
  profile.apiBaseUrl = getCasNcomApiBaseUrl(gatewayMode);
  return profile;
}
