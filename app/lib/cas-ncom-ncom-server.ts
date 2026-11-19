import {
  buildCasNcomUrl,
  CAS_NCOM_API,
  type CasGatewayMode,
  getCasNcomApiBaseUrl,
} from "@/app/lib/cas-ncom-api-paths";
import { CasNcomAuthError } from "@/app/lib/cas-ncom-auth-server";
import {
  gatewayConnectionError,
  gatewayErrorMessage,
  buildGatewayHeaders,
} from "@/app/lib/cas-ncom-gateway-client";
import type { ExportPerformanceRow } from "@/app/lib/cas-ncom-export-performance-columns";
import type { ImportPerformanceRow } from "@/app/lib/cas-ncom-import-performance-columns";
import {
  parseNcomExpoSearchXml,
  parseNcomSearchXml,
} from "@/app/lib/cas-ncom-ncom-xml";

export type ImportPerformanceSearchParams = {
  customsId?: string;
  dateFrom?: string;
  dateTo?: string;
  importDeclNo?: string;
  lanNo?: string;
  rowNo?: string;
  year?: string;
  blNo?: string;
  materialCode?: string;
  hsCode?: string;
};

export type ImportPerformanceSearchResult = {
  apiBaseUrl: string;
  configured: boolean;
  mode: "A" | "B" | "C" | null;
  tCnt: number;
  total: number;
  items: ImportPerformanceRow[];
  ntceInfo: string;
};

export type ExportPerformanceSearchParams = {
  trustTong?: string;
  dateFrom?: string;
  dateTo?: string;
  exportDeclNo?: string;
  lanNo?: string;
  rowNo?: string;
  year?: string;
  invNo?: string;
  productCode?: string;
  hsCode?: string;
};

export type ExportPerformanceSearchResult = {
  apiBaseUrl: string;
  configured: boolean;
  mode: "A" | "B" | "C" | null;
  tCnt: number;
  total: number;
  items: ExportPerformanceRow[];
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

function includesFold(hay: string, needle: string): boolean {
  if (!needle) return true;
  return hay.toLowerCase().includes(needle.toLowerCase());
}

function applyClientFilters(
  rows: ImportPerformanceRow[],
  materialCode: string,
  hsCode: string,
): ImportPerformanceRow[] {
  let out = rows;
  const mat = materialCode.trim();
  const hs = hsCode.trim().replace(/\D/g, "");
  if (mat) {
    out = out.filter((r) => includesFold(str(r.impumJajaeCode), mat));
  }
  if (hs) {
    out = out.filter((r) => {
      const rowHs = str(r.imlanHs).replace(/\D/g, "");
      return rowHs.includes(hs);
    });
  }
  return out;
}

function applyExportClientFilters(
  rows: ExportPerformanceRow[],
  productCode: string,
  hsCode: string,
): ExportPerformanceRow[] {
  let out = rows;
  const prod = productCode.trim();
  const hs = hsCode.trim().replace(/\D/g, "");
  if (prod) {
    out = out.filter((r) => includesFold(str(r.expumJepumCode), prod));
  }
  if (hs) {
    out = out.filter((r) => {
      const rowHs = str(r.exlanHs).replace(/\D/g, "");
      return rowHs.includes(hs);
    });
  }
  return out;
}

async function fetchNcomImportXml(
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
      headers: buildGatewayHeaders({
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
    if (xml.includes("<ncomSearchQryRtnVo")) {
      const parsed = parseNcomSearchXml(xml);
      throw new Error(parsed.ntceInfo || `NCOM 조회 실패 (HTTP ${res.status})`);
    }
    throw new Error(gatewayErrorMessage({}, res.status, "customs.read"));
  }

  return xml;
}

async function fetchNcomExpoXml(
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
      headers: buildGatewayHeaders({
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
    if (xml.includes("<ncomSearchExpoQryRtnVo")) {
      const parsed = parseNcomExpoSearchXml(xml);
      throw new Error(
        parsed.ntceInfo || `NCOM 수출 조회 실패 (HTTP ${res.status})`,
      );
    }
    throw new Error(gatewayErrorMessage({}, res.status, "customs.read"));
  }

  return xml;
}

function toYear4(year: string): string {
  const s = str(year).replace(/\D/g, "");
  if (s.length === 4) return s;
  return s.slice(0, 4);
}

export async function searchImportPerformance(
  params: ImportPerformanceSearchParams,
  bearerToken: string,
  gatewayMode: CasGatewayMode = "production",
): Promise<ImportPerformanceSearchResult> {
  const apiBaseUrl = getCasNcomApiBaseUrl(gatewayMode);
  const importDeclNo = str(params.importDeclNo);
  const customsId = str(params.customsId);
  const fromDt = toYmd(str(params.dateFrom));
  const toDt = toYmd(str(params.dateTo));
  const lanNo = str(params.lanNo);
  const rowNo = str(params.rowNo);
  const year = toYear4(str(params.year));
  const blNo = str(params.blNo);
  const materialCode = str(params.materialCode);
  const hsCode = str(params.hsCode);

  let url: string;
  let mode: "A" | "B" | "C";

  if (importDeclNo) {
    mode = "B";
    url = buildCasNcomUrl(
      CAS_NCOM_API.ncomSearchQry,
      {
        singono: importDeclNo,
        lanno: lanNo || undefined,
        heangno: rowNo || undefined,
      },
      gatewayMode,
    );
  } else if (customsId && year && blNo) {
    mode = "C";
    url = buildCasNcomUrl(
      CAS_NCOM_API.ncomSearchQry,
      {
        napsetong: customsId,
        year,
        bl_no: blNo,
        jajae_code: materialCode || undefined,
      },
      gatewayMode,
    );
  } else {
    if (!customsId || !fromDt || !toDt) {
      throw new Error(
        "거래처(통관고유부호)와 검색기간을 선택하거나, 수입신고번호를 입력하거나, 년도·BL번호를 입력하세요.",
      );
    }
    mode = "A";
    url = buildCasNcomUrl(
      CAS_NCOM_API.ncomSearchQry,
      {
        napsetong: customsId,
        from_dt: fromDt,
        to_dt: toDt,
      },
      gatewayMode,
    );
  }

  const xml = await fetchNcomImportXml(url, bearerToken);
  const parsed = parseNcomSearchXml(xml);
  if (parsed.ntceInfo) {
    throw new Error(parsed.ntceInfo);
  }

  const items =
    mode === "C"
      ? applyClientFilters(parsed.rows, "", hsCode)
      : applyClientFilters(parsed.rows, materialCode, hsCode);

  return {
    apiBaseUrl,
    configured: true,
    mode,
    tCnt: parsed.tCnt,
    total: items.length,
    items,
    ntceInfo: parsed.ntceInfo,
  };
}

export async function searchExportPerformance(
  params: ExportPerformanceSearchParams,
  bearerToken: string,
  gatewayMode: CasGatewayMode = "production",
): Promise<ExportPerformanceSearchResult> {
  const apiBaseUrl = getCasNcomApiBaseUrl(gatewayMode);
  const exportDeclNo = str(params.exportDeclNo);
  const trustTong = str(params.trustTong);
  const fromDt = toYmd(str(params.dateFrom));
  const toDt = toYmd(str(params.dateTo));
  const lanNo = str(params.lanNo);
  const rowNo = str(params.rowNo);
  const year = toYear4(str(params.year));
  const invNo = str(params.invNo);
  const productCode = str(params.productCode);
  const hsCode = str(params.hsCode);

  let url: string;
  let mode: "A" | "B" | "C";

  if (exportDeclNo) {
    mode = "B";
    url = buildCasNcomUrl(
      CAS_NCOM_API.ncomSearchExpoQry,
      {
        singono: exportDeclNo,
        lanno: lanNo || undefined,
        heangno: rowNo || undefined,
      },
      gatewayMode,
    );
  } else if (trustTong && year && invNo) {
    mode = "C";
    url = buildCasNcomUrl(
      CAS_NCOM_API.ncomSearchExpoQry,
      {
        expo_trust_tong: trustTong,
        year,
        inv_no: invNo,
        jepum_code: productCode || undefined,
      },
      gatewayMode,
    );
  } else {
    if (!trustTong || !fromDt || !toDt) {
      throw new Error(
        "거래처(통관고유부호)와 검색기간을 선택하거나, 수출신고번호를 입력하거나, 년도·Invoice번호를 입력하세요.",
      );
    }
    mode = "A";
    url = buildCasNcomUrl(
      CAS_NCOM_API.ncomSearchExpoQry,
      {
        expo_trust_tong: trustTong,
        from_dt: fromDt,
        to_dt: toDt,
      },
      gatewayMode,
    );
  }

  const xml = await fetchNcomExpoXml(url, bearerToken);
  const parsed = parseNcomExpoSearchXml(xml);
  if (parsed.ntceInfo) {
    throw new Error(parsed.ntceInfo);
  }

  const items =
    mode === "C"
      ? applyExportClientFilters(parsed.rows, "", hsCode)
      : applyExportClientFilters(parsed.rows, productCode, hsCode);

  return {
    apiBaseUrl,
    configured: true,
    mode,
    tCnt: parsed.tCnt,
    total: items.length,
    items,
    ntceInfo: parsed.ntceInfo,
  };
}
