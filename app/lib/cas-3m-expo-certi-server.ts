import {
  buildCasNcomUrl,
  CAS_NCOM_API,
  type CasGatewayMode,
  getCasNcomApiBaseUrl,
} from "@/app/lib/cas-ncom-api-paths";
import type { ExpoCertiRow } from "@/app/lib/cas-3m-expo-certi-columns";
import { CasNcomAuthError } from "@/app/lib/cas-ncom-auth-server";
import {
  buildCasBearerHeaders,
  gatewayConnectionError,
} from "@/app/lib/cas-ncom-gateway-client";
import { parseSelectExpoCertiListXml } from "@/app/lib/cas-ncom-ncom-xml";

export type ExpoCertiSearchParams = {
  dateFrom: string;
  dateTo: string;
  searchMode?: string;
  searchWord?: string;
};

export type ExpoCertiSearchResult = {
  apiBaseUrl: string;
  tCnt: number;
  total: number;
  items: ExpoCertiRow[];
  ntceInfo: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function toYmd(date: string): string {
  const s = str(date);
  if (!s) return "";
  if (/^\d{8}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  return s.replace(/\D/g, "").slice(0, 8);
}

async function fetchExpoCertiXml(
  url: string,
  bearerToken: string,
): Promise<string> {
  const token = str(bearerToken);
  if (!token) {
    throw new CasNcomAuthError("CAS 로그인이 필요합니다.");
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: buildCasBearerHeaders({
        bearerToken: token,
        accept: "application/xml",
      }),
      cache: "no-store",
    });
  } catch (e) {
    throw gatewayConnectionError(url, e);
  }

  const xml = await res.text();

  if (res.status === 401) {
    throw new CasNcomAuthError("세션이 만료되었습니다. 다시 로그인하세요.");
  }

  if (!res.ok) {
    if (xml.includes("<selectExpoCertiListRtnVo")) {
      const parsed = parseSelectExpoCertiListXml(xml);
      throw new Error(
        parsed.ntceInfo || `3M 수출증명서 조회 실패 (HTTP ${res.status})`,
      );
    }
    throw new Error(`3M 수출증명서 조회 실패 (HTTP ${res.status})`);
  }

  return xml;
}

export async function searchExpoCertiList(
  params: ExpoCertiSearchParams,
  bearerToken: string,
  gatewayMode: CasGatewayMode = "production",
): Promise<ExpoCertiSearchResult> {
  const apiBaseUrl = getCasNcomApiBaseUrl(gatewayMode);
  const fromDt = toYmd(params.dateFrom);
  const toDt = toYmd(params.dateTo);
  const searchMode = str(params.searchMode);
  const searchWord = str(params.searchWord);

  if (!fromDt || !toDt) {
    throw new Error("수리일자(시작·종료)를 입력하세요.");
  }

  if (searchMode && !searchWord) {
    throw new Error("검색구분을 선택한 경우 검색어를 입력하세요.");
  }

  const url = buildCasNcomUrl(
    CAS_NCOM_API.selectExpoCertiList,
    {
      from_dt: fromDt,
      to_dt: toDt,
      searchMode: searchMode || undefined,
      searchWord: searchMode ? searchWord : undefined,
    },
    gatewayMode,
  );

  const xml = await fetchExpoCertiXml(url, bearerToken);
  const parsed = parseSelectExpoCertiListXml(xml);
  if (parsed.ntceInfo) {
    throw new Error(parsed.ntceInfo);
  }

  return {
    apiBaseUrl,
    tCnt: parsed.tCnt,
    total: parsed.rows.length,
    items: parsed.rows,
    ntceInfo: parsed.ntceInfo,
  };
}
