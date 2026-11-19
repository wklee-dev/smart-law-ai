import {
  type GatewayAuditLogRow,
  GATEWAY_AUDIT_LOG_COLUMNS,
} from "@/app/lib/gateway-audit-log-columns";
import { getCasDbPool, sql } from "@/app/lib/cas-db-server";
import {
  GATEWAY_REQ_DT_SQL,
  formatGatewayReqDtExport,
  normalizeGatewayReqDt,
} from "@/app/lib/gateway-audit-req-dt";

export type GatewayAuditLogSearchParams = {
  dateFrom: string;
  dateTo: string;
  userId?: string;
  userName?: string;
  apiNm?: string;
  callerType?: string;
  httpStatusFilter?: string;
  httpStatusCode?: string;
  clientId?: string;
  page?: number;
  pageSize?: number;
};

export type GatewayAuditLogSearchResult = {
  items: GatewayAuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
};

export const GATEWAY_AUDIT_LOG_EXPORT_MAX = 10000;

const SELECT_COLUMNS = [
  "log_id",
  GATEWAY_REQ_DT_SQL,
  "caller_type",
  "user_id",
  "user_name",
  "client_id",
  "api_nm",
  "search_mode",
  "search_cond",
  "result_cnt",
  "http_status",
  "client_ip",
  "elapsed_ms",
  "fail_reason",
  "interface_fields",
  "interface_field_cnt",
].join(", ");

function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizePageSize(value: number | undefined): number {
  if (value === 100) return 100;
  return 50;
}

function normalizePage(value: number | undefined): number {
  if (!value || value < 1) return 1;
  return Math.floor(value);
}

function buildWhereClause(params: GatewayAuditLogSearchParams): string {
  const conditions = ["req_dt >= @from_dt", "req_dt < @to_dt_exclusive"];

  if (params.userId?.trim()) {
    conditions.push("user_id LIKE @user_id");
  }
  if (params.userName?.trim()) {
    conditions.push("user_name LIKE @user_name");
  }
  if (params.apiNm?.trim()) {
    conditions.push("api_nm = @api_nm");
  }
  if (params.callerType?.trim()) {
    conditions.push("caller_type = @caller_type");
  }
  if (params.clientId?.trim()) {
    conditions.push("client_id LIKE @client_id");
  }

  const httpFilter = params.httpStatusFilter?.trim() ?? "";
  if (httpFilter === "success") {
    conditions.push("http_status >= 200 AND http_status < 300");
  } else if (httpFilter === "fail") {
    conditions.push("http_status >= 400");
  } else if (httpFilter === "custom") {
    const code = params.httpStatusCode?.trim() ?? "";
    if (/^\d{3}$/.test(code)) {
      conditions.push("http_status = @http_status");
    }
  }

  return conditions.join(" AND ");
}

function bindSearchParams(
  request: sql.Request,
  params: GatewayAuditLogSearchParams,
): { from: Date; toExclusive: Date } {
  const from = parseDateOnly(params.dateFrom);
  const to = parseDateOnly(params.dateTo);
  if (!from || !to) {
    throw new Error("기간(from, to)은 YYYY-MM-DD 형식이어야 합니다.");
  }
  if (from > to) {
    throw new Error("시작일은 종료일보다 클 수 없습니다.");
  }

  const toExclusive = new Date(to);
  toExclusive.setDate(toExclusive.getDate() + 1);

  request.input("from_dt", sql.DateTime2, from);
  request.input("to_dt_exclusive", sql.DateTime2, toExclusive);

  if (params.userId?.trim()) {
    request.input("user_id", sql.NVarChar(52), `%${params.userId.trim()}%`);
  }
  if (params.userName?.trim()) {
    request.input("user_name", sql.NVarChar(102), `%${params.userName.trim()}%`);
  }
  if (params.apiNm?.trim()) {
    request.input("api_nm", sql.VarChar(50), params.apiNm.trim());
  }
  if (params.callerType?.trim()) {
    request.input("caller_type", sql.VarChar(10), params.callerType.trim());
  }
  if (params.clientId?.trim()) {
    request.input("client_id", sql.NVarChar(102), `%${params.clientId.trim()}%`);
  }

  const httpFilter = params.httpStatusFilter?.trim() ?? "";
  if (httpFilter === "custom") {
    const code = params.httpStatusCode?.trim() ?? "";
    if (/^\d{3}$/.test(code)) {
      request.input("http_status", sql.Int, Number(code));
    }
  }

  return { from, toExclusive };
}

function mapRow(raw: Record<string, unknown>): GatewayAuditLogRow {
  return {
    log_id: Number(raw.log_id ?? 0),
    req_dt: normalizeGatewayReqDt(raw.req_dt),
    caller_type: raw.caller_type == null ? null : String(raw.caller_type),
    user_id: raw.user_id == null ? null : String(raw.user_id),
    user_name: raw.user_name == null ? null : String(raw.user_name),
    client_id: raw.client_id == null ? null : String(raw.client_id),
    api_nm: raw.api_nm == null ? null : String(raw.api_nm),
    search_mode: raw.search_mode == null ? null : String(raw.search_mode),
    search_cond: raw.search_cond == null ? null : String(raw.search_cond),
    result_cnt:
      raw.result_cnt == null || raw.result_cnt === ""
        ? null
        : Number(raw.result_cnt),
    http_status:
      raw.http_status == null || raw.http_status === ""
        ? null
        : Number(raw.http_status),
    client_ip: raw.client_ip == null ? null : String(raw.client_ip),
    elapsed_ms:
      raw.elapsed_ms == null || raw.elapsed_ms === ""
        ? null
        : Number(raw.elapsed_ms),
    fail_reason: raw.fail_reason == null ? null : String(raw.fail_reason),
    interface_fields:
      raw.interface_fields == null ? null : String(raw.interface_fields),
    interface_field_cnt:
      raw.interface_field_cnt == null || raw.interface_field_cnt === ""
        ? null
        : Number(raw.interface_field_cnt),
  };
}

export function parseGatewayAuditLogSearchParams(
  searchParams: URLSearchParams,
): GatewayAuditLogSearchParams {
  return {
    dateFrom: searchParams.get("from")?.trim() ?? "",
    dateTo: searchParams.get("to")?.trim() ?? "",
    userId: searchParams.get("user_id")?.trim() ?? "",
    userName: searchParams.get("user_name")?.trim() ?? "",
    apiNm: searchParams.get("api_nm")?.trim() ?? "",
    callerType: searchParams.get("caller_type")?.trim() ?? "",
    httpStatusFilter: searchParams.get("http_status_filter")?.trim() ?? "",
    httpStatusCode: searchParams.get("http_status_code")?.trim() ?? "",
    clientId: searchParams.get("client_id")?.trim() ?? "",
    page: Number(searchParams.get("page") ?? "1"),
    pageSize: Number(searchParams.get("page_size") ?? "50"),
  };
}

export async function searchGatewayAuditLog(
  params: GatewayAuditLogSearchParams,
): Promise<GatewayAuditLogSearchResult> {
  const page = normalizePage(params.page);
  const pageSize = normalizePageSize(params.pageSize);
  const offset = (page - 1) * pageSize;
  const whereClause = buildWhereClause(params);
  const pool = await getCasDbPool();

  const countRequest = pool.request();
  bindSearchParams(countRequest, params);
  const countResult = await countRequest.query<{ total: number }>(`
    SELECT COUNT(1) AS total
    FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
    WHERE ${whereClause}
  `);
  const total = Number(countResult.recordset[0]?.total ?? 0);

  const dataRequest = pool.request();
  bindSearchParams(dataRequest, params);
  dataRequest.input("offset", sql.Int, offset);
  dataRequest.input("page_size", sql.Int, pageSize);

  const dataResult = await dataRequest.query<Record<string, unknown>>(`
    SELECT ${SELECT_COLUMNS}
    FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
    WHERE ${whereClause}
    ORDER BY req_dt DESC, log_id DESC
    OFFSET @offset ROWS FETCH NEXT @page_size ROWS ONLY
  `);

  return {
    items: dataResult.recordset.map(mapRow),
    total,
    page,
    pageSize,
  };
}

export async function exportGatewayAuditLogRows(
  params: GatewayAuditLogSearchParams,
): Promise<{ rows: GatewayAuditLogRow[]; truncated: boolean; total: number }> {
  const result = await searchGatewayAuditLog({
    ...params,
    page: 1,
    pageSize: GATEWAY_AUDIT_LOG_EXPORT_MAX,
  });

  return {
    rows: result.items,
    truncated: result.total > result.items.length,
    total: result.total,
  };
}

export function buildGatewayAuditLogWorkbook(
  rows: GatewayAuditLogRow[],
): Buffer {
  const XLSX = require("xlsx") as typeof import("xlsx");
  const exportColumns = GATEWAY_AUDIT_LOG_COLUMNS.filter(
    (col) => col.export !== false,
  );
  const header = exportColumns.map((col) => col.label);
  const body = rows.map((row) =>
    exportColumns.map((col) => {
      if (col.key === "req_dt") {
        return formatReqDtForExport(row.req_dt);
      }
      return cellValue(row, col.key);
    }),
  );
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "감사로그");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function cellValue(
  row: GatewayAuditLogRow,
  key: keyof GatewayAuditLogRow,
): string {
  const value = row[key];
  if (value == null) return "";
  return String(value);
}

function formatReqDtForExport(value: string): string {
  return formatGatewayReqDtExport(value);
}
