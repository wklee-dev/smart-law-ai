import {
  buildCasNcomUrl,
  CAS_NCOM_API,
  type CasGatewayMode,
  getCasNcomApiBaseUrl,
} from "@/app/lib/cas-ncom-api-paths";
import type { HsOriginRow } from "@/app/lib/cas-3m-hs-origin-columns";
import { CasNcomAuthError } from "@/app/lib/cas-ncom-auth-server";
import {
  buildCasBearerHeaders,
  gatewayConnectionError,
} from "@/app/lib/cas-ncom-gateway-client";
import { parseSelectExpprooCoDeciStdiListXml } from "@/app/lib/cas-ncom-ncom-xml";

export type HsOriginSearchParams = {
  year: string;
  custCd?: string;
  searchMode?: string;
  searchWord?: string;
};

export type HsOriginSearchResult = {
  apiBaseUrl: string;
  tCnt: number;
  total: number;
  items: HsOriginRow[];
  ntceInfo: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function toYear4(year: string): string {
  const s = str(year).replace(/\D/g, "");
  if (s.length === 4) return s;
  return s.slice(0, 4);
}

async function fetchHsOriginXml(
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
    if (xml.includes("<selectExpprooCoDeciStdiListRtnVo")) {
      const parsed = parseSelectExpprooCoDeciStdiListXml(xml);
      throw new Error(
        parsed.ntceInfo ||
          `3M HS·원산지판정기준 조회 실패 (HTTP ${res.status})`,
      );
    }
    throw new Error(
      `3M HS·원산지판정기준 조회 실패 (HTTP ${res.status})`,
    );
  }

  return xml;
}

export async function searchHsOriginList(
  params: HsOriginSearchParams,
  bearerToken: string,
  gatewayMode: CasGatewayMode = "production",
): Promise<HsOriginSearchResult> {
  const apiBaseUrl = getCasNcomApiBaseUrl(gatewayMode);
  const yr = toYear4(params.year);
  const searchMode = str(params.searchMode);
  const searchWord = str(params.searchWord);
  const custCd = str(params.custCd);

  if (!yr || yr.length !== 4) {
    throw new Error("조회년도(YYYY)를 입력하세요.");
  }

  if (searchMode && !searchWord) {
    throw new Error("검색구분을 선택한 경우 검색어를 입력하세요.");
  }

  const url = buildCasNcomUrl(
    CAS_NCOM_API.selectExpprooCoDeciStdiList,
    {
      yr,
      custCd: custCd || undefined,
      searchMode: searchMode || undefined,
      searchWord: searchMode ? searchWord : undefined,
    },
    gatewayMode,
  );

  const xml = await fetchHsOriginXml(url, bearerToken);
  const parsed = parseSelectExpprooCoDeciStdiListXml(xml);
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
