/**
 * GATEWAY_API_AUDIT_LOG.req_dt — SQL Server datetime (KST 벽시계, TZ 없음)
 * mssql Date → ISO(Z) → 브라우저 KST 변환 시 +9h 오차 방지
 */

const WALL_CLOCK_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

export const GATEWAY_REQ_DT_SQL =
  "CONVERT(varchar(23), req_dt, 121) AS req_dt";

export function normalizeGatewayReqDt(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return "";
    // 드라이버가 UTC로 해석한 경우: UTC 필드 = DB에 저장된 KST 벽시계
    const y = raw.getUTCFullYear();
    const mo = String(raw.getUTCMonth() + 1).padStart(2, "0");
    const d = String(raw.getUTCDate()).padStart(2, "0");
    const h = String(raw.getUTCHours()).padStart(2, "0");
    const mi = String(raw.getUTCMinutes()).padStart(2, "0");
    const s = String(raw.getUTCSeconds()).padStart(2, "0");
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
  }
  return String(raw).trim();
}

/** 목록·상세 UI — req_dt 그대로 KST 벽시계로 표시 */
export function formatGatewayReqDtDisplay(
  value: string | null | undefined,
): string {
  if (!value?.trim()) return "";
  const trimmed = value.trim();
  const m = WALL_CLOCK_RE.exec(trimmed);
  if (m) {
    const d = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    );
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("ko-KR", { hour12: false });
    }
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleString("ko-KR", {
    hour12: false,
    timeZone: "Asia/Seoul",
  });
}

export function formatGatewayReqDtExport(
  value: string | null | undefined,
): string {
  if (!value?.trim()) return "";
  const m = WALL_CLOCK_RE.exec(value.trim());
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
  }
  return formatGatewayReqDtDisplay(value);
}
