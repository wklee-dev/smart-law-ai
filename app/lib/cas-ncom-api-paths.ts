export type CasGatewayMode = "production" | "local";

export const CAS_GATEWAY_MODE_HEADER = "X-Cas-Gateway-Mode";

/** HanjooGatewayAPI 운영 Base URL (ShipmentTracking HANJOO_GATEWAY_API_URL 과 동일) */
export const GATEWAY_PRODUCTION_BASE_URL =
  "https://gateway.hjcustoms.co.kr:8444";

/** Gateway PC 로컬 진단용 (외부망 불가) */
export const GATEWAY_LOCAL_BASE_URL = "http://127.0.0.1:5050";

/** Gateway API 경로 — HanjooGatewayAPI Guide V1.1 기준 */
export const CAS_NCOM_API = {
  /** GET cas.read — 거래처마스터 */
  customerMstSearchQry: "/api/cas/customerMstSearchQry",
  /** GET — 수입품목마스터 (XML, CAS Bearer 전용) */
  masterSearchQry: "/api/cas/masterSearchQry",
  /** GET — 수출품목마스터 (XML, CAS Bearer 전용) */
  expMasterSearchQry: "/api/cas/expMasterSearchQry",
  /** GET — 환급 수입원장 (XML 계층, CAS Bearer 전용) */
  ndrawSearchWanjangQry: "/api/cas/ndrawSearchWanjangQry",
  /** GET cas.read — 공통코드 */
  casSearchCommQry: "/api/cas/casSearchCommQry",
  /** GET customs.read — 수입실적 (XML) */
  ncomSearchQry: "/api/ncom/ncomSearchQry",
  /** GET customs.read — 수출실적 (XML) */
  ncomSearchExpoQry: "/api/ncom/ncomSearchExpoQry",
  /** GET — 3M 수출증명서 (XML, CAS Bearer 전용) */
  selectExpoCertiList: "/api/ncom/selectExpoCertiList",
  /** GET — 3M 품목·원산지판정기준 (XML, CAS Bearer 전용) */
  selectExpprooMstFtaList: "/api/ncom/selectExpprooMstFtaList",
  /** GET — 3M HS·원산지판정기준 (XML, CAS Bearer 전용) */
  selectExpprooCoDeciStdiList: "/api/ncom/selectExpprooCoDeciStdiList",
  /** POST — CAS 사용자 로그인 (Bearer token) */
  authLogin: "/api/auth/login",
  /** GET/POST — NCOM 인터페이스 항목 설정 */
  userFieldProfile: "/api/auth/userFieldProfile",
} as const;

export function getCasNcomApiBaseUrl(mode?: CasGatewayMode): string {
  if (mode === "local") return GATEWAY_LOCAL_BASE_URL;
  if (mode === "production") return GATEWAY_PRODUCTION_BASE_URL;

  const raw =
    process.env.CAS_NCOM_API_BASE_URL?.trim() ||
    process.env.HANJOO_GATEWAY_API_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return GATEWAY_PRODUCTION_BASE_URL;
}

export function buildCasNcomUrl(
  path: string,
  params?: Record<string, string | undefined>,
  mode?: CasGatewayMode,
): string {
  const base = getCasNcomApiBaseUrl(mode);
  if (!params) return `${base}${path}`;

  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") {
      q.set(key, value);
    }
  }
  const qs = q.toString();
  return qs ? `${base}${path}?${qs}` : `${base}${path}`;
}

/** 서버 전용 — X-API-Key (cas.read / customs.read) */
export function getCasNcomApiKey(): string {
  return (
    process.env.HANJOO_GATEWAY_API_KEY?.trim() ||
    process.env.HANJOO_API_KEY_SHIPMENT_TRACKING?.trim() ||
    ""
  );
}
