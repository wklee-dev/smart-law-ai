import {
  buildCasNcomUrl,
  CAS_NCOM_API,
  type CasGatewayMode,
  getCasNcomApiBaseUrl,
} from "@/app/lib/cas-ncom-api-paths";
import { CasNcomAuthError } from "@/app/lib/cas-ncom-auth-server";
import {
  buildCasBearerHeaders,
  gatewayConnectionError,
} from "@/app/lib/cas-ncom-gateway-client";
import type { CasItemMasterRow } from "@/app/lib/cas-ncom-item-master-columns";
import {
  parseExpMasterSearchQryXml,
  parseMasterSearchQryXml,
  parseNdrawSearchWanjangQryXml,
  type NdrawWanjangMasterRow,
} from "@/app/lib/cas-ncom-ncom-xml";
import fs from "node:fs";
import path from "node:path";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Guide V1.4 샘플 XML (custCd=0966, mstCd=MM3629-2703A16RA4) */
export const IMPORT_ITEM_MASTER_SAMPLE_REL =
  "samples/cas/masterSearchQry_0966_MM3629-2703A16RA4.xml";

function normalizeMasterItems(
  rows: Array<Record<string, unknown>>,
): CasItemMasterRow[] {
  return rows.map((row) => {
    const r = row as CasItemMasterRow;
    return {
      ...r,
      tpList: Array.isArray(r.tpList) ? r.tpList : [],
      lawList: Array.isArray(r.lawList) ? r.lawList : [],
      dutyList: Array.isArray(r.dutyList) ? r.dutyList : [],
    };
  });
}

function toYmd(date: string): string {
  const s = str(date);
  if (!s) return "";
  if (/^\d{8}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}${m[2]}${m[3]}`;
  return s.replace(/\D/g, "").slice(0, 8);
}

async function fetchCasBearerXml(
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
    const ntce = xml.match(/<ntceInfo[^>]*>([^<]*)</)?.[1]?.trim();
    throw new Error(ntce || `CAS 조회 실패 (HTTP ${res.status})`);
  }

  return xml;
}

export type ItemMasterSearchParams = {
  custCd: string;
  mstCd?: string;
};

export type ItemMasterSearchResult = {
  apiBaseUrl: string;
  tCnt: number;
  total: number;
  items: CasItemMasterRow[];
  ntceInfo: string;
};

async function searchItemMaster(
  path: string,
  parse: (xml: string) => {
    tCnt: number;
    ntceInfo: string;
    rows: Array<Record<string, unknown>>;
  },
  params: ItemMasterSearchParams,
  bearerToken: string,
  gatewayMode: CasGatewayMode,
): Promise<ItemMasterSearchResult> {
  const custCd = str(params.custCd);
  if (!custCd) {
    throw new Error("거래처를 선택하세요.");
  }

  const apiBaseUrl = getCasNcomApiBaseUrl(gatewayMode);
  const url = buildCasNcomUrl(
    path,
    {
      custCd,
      mstCd: str(params.mstCd) || undefined,
    },
    gatewayMode,
  );

  const xml = await fetchCasBearerXml(url, bearerToken);
  const parsed = parse(xml);

  return {
    apiBaseUrl,
    tCnt: parsed.tCnt,
    total: parsed.rows.length,
    items: normalizeMasterItems(parsed.rows),
    ntceInfo: parsed.ntceInfo,
  };
}

/** 로컬 샘플 XML로 수입품목마스터 표시 (Gateway 미호출) */
export function loadImportItemMasterSample(): ItemMasterSearchResult {
  const abs = path.resolve(process.cwd(), IMPORT_ITEM_MASTER_SAMPLE_REL);
  if (!fs.existsSync(abs)) {
    throw new Error(`샘플 XML 없음: ${abs}`);
  }
  const xml = fs.readFileSync(abs, "utf8");
  const parsed = parseMasterSearchQryXml(xml);
  return {
    apiBaseUrl: `sample://${IMPORT_ITEM_MASTER_SAMPLE_REL}`,
    tCnt: parsed.tCnt,
    total: parsed.rows.length,
    items: normalizeMasterItems(parsed.rows),
    ntceInfo: parsed.ntceInfo || "샘플 XML 표시",
  };
}

export function searchImportItemMaster(
  params: ItemMasterSearchParams,
  bearerToken: string,
  gatewayMode?: CasGatewayMode,
): Promise<ItemMasterSearchResult> {
  return searchItemMaster(
    CAS_NCOM_API.masterSearchQry,
    parseMasterSearchQryXml,
    params,
    bearerToken,
    gatewayMode ?? "production",
  );
}

export function searchExportItemMaster(
  params: ItemMasterSearchParams,
  bearerToken: string,
  gatewayMode?: CasGatewayMode,
): Promise<ItemMasterSearchResult> {
  return searchItemMaster(
    CAS_NCOM_API.expMasterSearchQry,
    parseExpMasterSearchQryXml,
    params,
    bearerToken,
    gatewayMode ?? "production",
  );
}

export type RefundImportLedgerSearchParams = {
  custCd: string;
  srlNo?: string;
  impSingoNo?: string;
  dateFrom?: string;
  dateTo?: string;
  lcNo?: string;
  hsCd?: string;
};

export type RefundImportLedgerSearchResult = {
  apiBaseUrl: string;
  tCnt: number;
  total: number;
  items: NdrawWanjangMasterRow[];
  ntceInfo: string;
};

export async function searchRefundImportLedger(
  params: RefundImportLedgerSearchParams,
  bearerToken: string,
  gatewayMode: CasGatewayMode = "production",
): Promise<RefundImportLedgerSearchResult> {
  const custCd = str(params.custCd);
  if (!custCd) {
    throw new Error("거래처를 선택하세요.");
  }

  const fromDt = toYmd(str(params.dateFrom));
  const toDt = toYmd(str(params.dateTo));
  if ((fromDt && !toDt) || (!fromDt && toDt)) {
    throw new Error("수입수리일은 시작일·종료일을 함께 입력하세요.");
  }

  const apiBaseUrl = getCasNcomApiBaseUrl(gatewayMode);
  const url = buildCasNcomUrl(
    CAS_NCOM_API.ndrawSearchWanjangQry,
    {
      custCd,
      srlNo: str(params.srlNo) || undefined,
      impSingoNo: str(params.impSingoNo) || undefined,
      fromDt: fromDt || undefined,
      toDt: toDt || undefined,
      lcNo: str(params.lcNo) || undefined,
      hsCd: str(params.hsCd) || undefined,
    },
    gatewayMode,
  );

  const xml = await fetchCasBearerXml(url, bearerToken);
  const parsed = parseNdrawSearchWanjangQryXml(xml);

  return {
    apiBaseUrl,
    tCnt: parsed.tCnt,
    total: parsed.masters.length,
    items: parsed.masters,
    ntceInfo: parsed.ntceInfo,
  };
}
