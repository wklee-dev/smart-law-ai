import {
  buildCasNcomUrl,
  CAS_NCOM_API,
  type CasGatewayMode,
  getCasNcomApiBaseUrl,
  getCasNcomApiKey,
} from "@/app/lib/cas-ncom-api-paths";
import { gatewayJsonGet } from "@/app/lib/cas-ncom-gateway-client";

export type CasCommCodeRow = Record<string, string>;

export type CasCommCodeSearchParams = {
  codeGroup: string;
  searchWord?: string;
  searchMode?: string;
};

export type CasCommCodeSearchResult = {
  apiBaseUrl: string;
  configured: boolean;
  items: CasCommCodeRow[];
  total: number;
};

type GatewayResponse = {
  ok?: boolean;
  tCnt?: number;
  items?: Record<string, string | null | undefined>[];
};

function normalizeRow(
  raw: Record<string, string | null | undefined>,
): CasCommCodeRow {
  const out: CasCommCodeRow = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = value == null ? "" : String(value);
  }
  return out;
}

export async function searchCasCommCodes(
  params: CasCommCodeSearchParams,
  gatewayMode: CasGatewayMode = "production",
): Promise<CasCommCodeSearchResult> {
  const apiBaseUrl = getCasNcomApiBaseUrl(gatewayMode);
  const codeGroup = params.codeGroup?.trim() ?? "";

  if (!getCasNcomApiKey()) {
    return { apiBaseUrl, configured: false, items: [], total: 0 };
  }

  if (!codeGroup) {
    throw new Error("codeGroup(그룹코드)은 필수입니다.");
  }

  const url = buildCasNcomUrl(
    CAS_NCOM_API.casSearchCommQry,
    {
      codeGroup,
      searchWord: params.searchWord?.trim(),
      searchMode: params.searchMode?.trim(),
    },
    gatewayMode,
  );

  const { body } = await gatewayJsonGet<GatewayResponse>(url, "cas.read");
  const items = (body.items ?? []).map(normalizeRow);

  return {
    apiBaseUrl,
    configured: true,
    items,
    total: body.tCnt ?? items.length,
  };
}
