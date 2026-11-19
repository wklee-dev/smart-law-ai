export type GatewayAuditLogRow = {
  log_id: number;
  req_dt: string;
  caller_type: string | null;
  user_id: string | null;
  user_name: string | null;
  client_id: string | null;
  api_nm: string | null;
  search_mode: string | null;
  search_cond: string | null;
  result_cnt: number | null;
  http_status: number | null;
  client_ip: string | null;
  elapsed_ms: number | null;
  fail_reason: string | null;
  interface_fields: string | null;
  interface_field_cnt: number | null;
};

export type GatewayAuditLogColumnKey = keyof GatewayAuditLogRow;

export type GatewayAuditLogColumn = {
  key: GatewayAuditLogColumnKey;
  label: string;
  width?: string;
  wrap?: boolean;
  grid?: boolean;
  export?: boolean;
};

/** HanjooGatewayAPI_API목록 V1.0 — 감사로그 대상·주요 Gateway API */
export const GATEWAY_API_PURPOSE_BY_NAME: Record<string, string> = {
  ncomSearchQry: "수입실적 (Mode A/B/C)",
  ncomSearchExpoQry: "수출실적 (Mode A/B/C)",
  selectExpoCertiList: "3M 수출증명서",
  selectExpprooMstFtaList: "3M 품목·원산지판정기준",
  selectExpprooCoDeciStdiList: "3M HS·원산지판정기준",
  customerMstSearchQry: "거래처 조회",
  casSearchCommQry: "공통코드 조회",
  masterSearchQry: "수입품목마스터",
  expMasterSearchQry: "수출품목마스터",
  ndrawSearchWanjangQry: "환급 수입원장",
  ncomInsUpImpo41Qry: "수입모델규격 요건 Upsert",
};

/** 감사 로그(GATEWAY_API_AUDIT_LOG) 기록 대상 — API목록 V1.0 §8 */
export const GATEWAY_AUDIT_LOG_API_NAMES = [
  "ncomSearchQry",
  "ncomSearchExpoQry",
  "selectExpoCertiList",
  "selectExpprooMstFtaList",
  "selectExpprooCoDeciStdiList",
  "masterSearchQry",
  "expMasterSearchQry",
  "ndrawSearchWanjangQry",
] as const;

/** 조회 필터 드롭다운 — 감사 대상 + 기타 연동 API */
export const GATEWAY_API_NAMES = [
  ...GATEWAY_AUDIT_LOG_API_NAMES,
  "customerMstSearchQry",
  "casSearchCommQry",
] as const;

export type GatewayApiName = (typeof GATEWAY_API_NAMES)[number];

export function formatGatewayApiPurpose(apiNm: string | null | undefined): string {
  const key = apiNm?.trim() ?? "";
  if (!key) return "";
  return GATEWAY_API_PURPOSE_BY_NAME[key] ?? key;
}

/** UI 표시: 용도명 (기술명은 title·툴팁용) */
export function formatGatewayApiDisplayLabel(
  apiNm: string | null | undefined,
): string {
  const key = apiNm?.trim() ?? "";
  if (!key) return "";
  const purpose = GATEWAY_API_PURPOSE_BY_NAME[key];
  return purpose ?? key;
}

export const CALLER_TYPE_OPTIONS = [
  { value: "", label: "전체" },
  { value: "user", label: "user" },
  { value: "client", label: "client" },
  { value: "unknown", label: "unknown" },
] as const;

export const HTTP_STATUS_FILTER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "success", label: "2xx 성공" },
  { value: "fail", label: "4xx 이상 실패" },
  { value: "custom", label: "직접입력" },
] as const;

export const GATEWAY_AUDIT_LOG_COLUMNS: GatewayAuditLogColumn[] = [
  { key: "req_dt", label: "요청일시", width: "9.5rem", grid: true, export: true },
  { key: "caller_type", label: "호출구분", width: "4.5rem", grid: true, export: true },
  { key: "user_id", label: "사용자ID", width: "5.5rem", grid: true, export: true },
  { key: "user_name", label: "사용자명", width: "6rem", grid: true, export: true },
  { key: "client_id", label: "클라이언트ID", width: "7rem", grid: true, export: true },
  { key: "api_nm", label: "API명", width: "8.5rem", grid: true, export: true },
  { key: "search_mode", label: "조회모드", width: "4rem", grid: true, export: true },
  {
    key: "search_cond",
    label: "조회조건",
    width: "12rem",
    wrap: true,
    grid: true,
    export: true,
  },
  { key: "result_cnt", label: "건수", width: "3.5rem", grid: true, export: true },
  { key: "http_status", label: "HTTP", width: "3.5rem", grid: true, export: true },
  { key: "client_ip", label: "IP", width: "6rem", grid: true, export: true },
  { key: "elapsed_ms", label: "처리(ms)", width: "4.5rem", grid: true, export: true },
  {
    key: "fail_reason",
    label: "실패사유",
    width: "10rem",
    wrap: true,
    grid: true,
    export: true,
  },
  {
    key: "interface_field_cnt",
    label: "IF항목수",
    width: "4rem",
    grid: true,
    export: true,
  },
  {
    key: "interface_fields",
    label: "인터페이스항목",
    wrap: true,
    grid: false,
    export: true,
  },
];

export const GATEWAY_AUDIT_LOG_GRID_COLUMNS = GATEWAY_AUDIT_LOG_COLUMNS.filter(
  (col) => col.grid !== false,
);

export function cellValue(
  row: GatewayAuditLogRow,
  key: GatewayAuditLogColumnKey,
): string {
  const value = row[key];
  if (value == null) return "";
  return String(value);
}

export function isFailedAuditRow(row: GatewayAuditLogRow): boolean {
  const status = row.http_status ?? 0;
  return status >= 400 || Boolean(row.fail_reason?.trim());
}

export { formatGatewayReqDtDisplay as formatReqDt } from "@/app/lib/gateway-audit-req-dt";
