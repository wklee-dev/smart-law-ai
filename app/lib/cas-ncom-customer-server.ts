import {
  buildCasNcomUrl,
  CAS_NCOM_API,
  type CasGatewayMode,
  getCasNcomApiBaseUrl,
  getCasNcomApiKey,
} from "@/app/lib/cas-ncom-api-paths";
import { gatewayJsonGet } from "@/app/lib/cas-ncom-gateway-client";

export type CasCustomerRow = {
  customerCode: string;
  /** 환급(엔컴) 거래처코드 — Gateway `DRAW_CUST_CD` */
  drawCustCd: string;
  customsId: string;
  customerName: string;
  representative: string;
  address: string;
  phone: string;
};

export type CasCustomerSearchResult = {
  apiBaseUrl: string;
  configured: boolean;
  items: CasCustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CasCustomerSearchParams = {
  field?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

type GatewayResponse = {
  ok?: boolean;
  tCnt?: number;
  items?: Record<string, string | null | undefined>[];
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function mapRow(raw: Record<string, string | null | undefined>): CasCustomerRow {
  const addr = str(raw.addr);
  const addr2 = str(raw.addr2);
  const address = [addr, addr2].filter(Boolean).join(" ");

  return {
    customerCode: str(raw.custCd),
    drawCustCd: str(raw.drawCustCd ?? raw.DRAW_CUST_CD),
    customsId: str(raw.cstmUniq || raw.customs_tong || raw.customsTong),
    customerName: str(raw.cmpNm),
    representative: str(raw.ceoNm),
    address,
    phone: str(raw.tel),
  };
}

function filterByField(
  rows: CasCustomerRow[],
  field: string,
  keyword: string,
): CasCustomerRow[] {
  const q = keyword.trim().toLowerCase();
  if (!q || field === "all" || field === "customer_name") return rows;

  if (field === "customer_code") {
    return rows.filter((r) => r.customerCode.toLowerCase().includes(q));
  }
  if (field === "customs_id") {
    return rows.filter((r) => r.customsId.toLowerCase().includes(q));
  }
  return rows;
}

export async function searchCasCustomers(
  params: CasCustomerSearchParams,
  gatewayMode: CasGatewayMode = "production",
): Promise<CasCustomerSearchResult> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(
    200,
    Math.max(1, Math.floor(params.pageSize ?? 50)),
  );
  const field = str(params.field) || "all";
  const keyword = str(params.keyword);
  const apiBaseUrl = getCasNcomApiBaseUrl(gatewayMode);

  if (!getCasNcomApiKey()) {
    return {
      apiBaseUrl,
      configured: false,
      items: [],
      total: 0,
      page,
      pageSize,
      totalPages: 1,
    };
  }

  if (!keyword) {
    return {
      apiBaseUrl,
      configured: true,
      items: [],
      total: 0,
      page: 1,
      pageSize,
      totalPages: 1,
    };
  }

  if (keyword.length < 2) {
    throw new Error("거래처명은 최소 2자 이상 입력해 주세요.");
  }

  const url = buildCasNcomUrl(
    CAS_NCOM_API.customerMstSearchQry,
    { cmpNm: keyword },
    gatewayMode,
  );

  const { body } = await gatewayJsonGet<GatewayResponse>(url, "cas.read");

  const mapped = (body.items ?? []).map(mapRow);
  const filtered = filterByField(mapped, field, keyword);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const items = filtered.slice(offset, offset + pageSize);

  return {
    apiBaseUrl,
    configured: true,
    items,
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}
