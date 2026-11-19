import { getCasDbPool, sql } from "@/app/lib/cas-db-server";
import { normalizeGatewayReqDt } from "@/app/lib/gateway-audit-req-dt";

export type GatewayUsageParams = {
  dateFrom: string;
  dateTo: string;
  apiNm?: string;
};

export type GatewayUsageKpi = {
  activeUsers: number;
  totalCalls: number;
  avgCallsPerUser: number;
  successRate: number;
  avgMs: number;
  firstTimeUsers: number;
};

export type GatewayUsageDailyPoint = {
  dt: string;
  activeUsers: number;
  calls: number;
};

export type GatewayUsageUserRow = {
  userId: string;
  userName: string;
  calls: number;
  okCnt: number;
  failCnt: number;
  successRate: number;
  avgMs: number;
  apiCnt: number;
  lastAccess: string;
  topApiNm: string;
  topApiCalls: number;
};

export type GatewayUsageApiShare = {
  apiNm: string;
  calls: number;
  sharePct: number;
};

export type GatewayUsageHourlyPoint = {
  hour: number;
  calls: number;
};

export type GatewayUsageInsight = {
  top20UserCount: number;
  top20CallSharePct: number;
};

export type GatewayUsageDashboard = {
  kpi: GatewayUsageKpi;
  dailyTrend: GatewayUsageDailyPoint[];
  topUsers: GatewayUsageUserRow[];
  apiShare: GatewayUsageApiShare[];
  hourly: GatewayUsageHourlyPoint[];
  insight: GatewayUsageInsight;
};

export type GatewayUsageUserDetail = {
  userId: string;
  userName: string;
  calls: number;
  successRate: number;
  avgMs: number;
  dailyTrend: { dt: string; calls: number }[];
  apis: {
    apiNm: string;
    calls: number;
    successRate: number;
    avgMs: number;
  }[];
};

function parseDateOnly(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildUsageWhereClause(params: GatewayUsageParams): string {
  const conditions = [
    "req_dt >= @from_dt",
    "req_dt < @to_dt_exclusive",
    "caller_type = 'user'",
    "user_id IS NOT NULL",
  ];
  if (params.apiNm?.trim()) {
    conditions.push("api_nm = @api_nm");
  }
  return conditions.join(" AND ");
}

function bindUsageParams(
  request: sql.Request,
  params: GatewayUsageParams,
): void {
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

  if (params.apiNm?.trim()) {
    request.input("api_nm", sql.VarChar(50), params.apiNm.trim());
  }
}

function num(value: unknown): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function dateText(value: unknown): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (value == null) return "";
  return String(value).slice(0, 10);
}

function dateTimeText(value: unknown): string {
  return normalizeGatewayReqDt(value);
}

export function parseGatewayUsageParams(
  searchParams: URLSearchParams,
): GatewayUsageParams {
  return {
    dateFrom: searchParams.get("from")?.trim() ?? "",
    dateTo: searchParams.get("to")?.trim() ?? "",
    apiNm: searchParams.get("api_nm")?.trim() ?? "",
  };
}

export async function fetchGatewayUsageDashboard(
  params: GatewayUsageParams,
): Promise<GatewayUsageDashboard> {
  const whereClause = buildUsageWhereClause(params);
  const pool = await getCasDbPool();

  const kpiRequest = pool.request();
  bindUsageParams(kpiRequest, params);

  const dailyRequest = pool.request();
  bindUsageParams(dailyRequest, params);

  const usersRequest = pool.request();
  bindUsageParams(usersRequest, params);

  const apiRequest = pool.request();
  bindUsageParams(apiRequest, params);

  const hourlyRequest = pool.request();
  bindUsageParams(hourlyRequest, params);

  const firstTimeRequest = pool.request();
  bindUsageParams(firstTimeRequest, params);

  const [
    kpiResult,
    dailyResult,
    usersResult,
    apiResult,
    hourlyResult,
    firstTimeResult,
  ] = await Promise.all([
    kpiRequest.query<{
      active_users: number;
      total_calls: number;
      avg_ms: number | null;
      ok_cnt: number;
    }>(`
      SELECT
        COUNT(DISTINCT user_id) AS active_users,
        COUNT(*) AS total_calls,
        AVG(CAST(elapsed_ms AS float)) AS avg_ms,
        SUM(CASE WHEN http_status < 400 THEN 1 ELSE 0 END) AS ok_cnt
      FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
      WHERE ${whereClause}
    `),
    dailyRequest.query<{
      dt: Date;
      active_users: number;
      calls: number;
    }>(`
      SELECT
        CONVERT(date, req_dt) AS dt,
        COUNT(DISTINCT user_id) AS active_users,
        COUNT(*) AS calls
      FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
      WHERE ${whereClause}
      GROUP BY CONVERT(date, req_dt)
      ORDER BY dt
    `),
    usersRequest.query<{
      user_id: string;
      user_name: string | null;
      calls: number;
      ok_cnt: number;
      fail_cnt: number;
      avg_ms: number | null;
      api_cnt: number;
      last_access: Date;
      top_api_nm: string | null;
      top_api_calls: number | null;
    }>(`
      WITH filtered AS (
        SELECT *
        FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
        WHERE ${whereClause}
      ),
      user_stats AS (
        SELECT
          user_id,
          MAX(user_name) AS user_name,
          COUNT(*) AS calls,
          SUM(CASE WHEN http_status < 400 THEN 1 ELSE 0 END) AS ok_cnt,
          SUM(CASE WHEN http_status >= 400 THEN 1 ELSE 0 END) AS fail_cnt,
          AVG(CAST(elapsed_ms AS float)) AS avg_ms,
          COUNT(DISTINCT api_nm) AS api_cnt,
          CONVERT(varchar(23), MAX(req_dt), 121) AS last_access
        FROM filtered
        GROUP BY user_id
      ),
      user_api AS (
        SELECT
          user_id,
          api_nm,
          COUNT(*) AS api_calls,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY COUNT(*) DESC, api_nm
          ) AS rn
        FROM filtered
        GROUP BY user_id, api_nm
      )
      SELECT TOP 20
        u.user_id,
        u.user_name,
        u.calls,
        u.ok_cnt,
        u.fail_cnt,
        u.avg_ms,
        u.api_cnt,
        u.last_access,
        a.api_nm AS top_api_nm,
        a.api_calls AS top_api_calls
      FROM user_stats u
      LEFT JOIN user_api a
        ON u.user_id = a.user_id AND a.rn = 1
      ORDER BY u.calls DESC, u.user_id
    `),
    apiRequest.query<{ api_nm: string; calls: number }>(`
      SELECT
        api_nm,
        COUNT(*) AS calls
      FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
      WHERE ${whereClause}
      GROUP BY api_nm
      ORDER BY calls DESC, api_nm
    `),
    hourlyRequest.query<{ hour: number; calls: number }>(`
      SELECT
        DATEPART(hour, req_dt) AS hour,
        COUNT(*) AS calls
      FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
      WHERE ${whereClause}
      GROUP BY DATEPART(hour, req_dt)
      ORDER BY hour
    `),
    firstTimeRequest.query<{ first_time_users: number }>(`
      SELECT COUNT(*) AS first_time_users
      FROM (
        SELECT user_id
        FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
        WHERE caller_type = 'user' AND user_id IS NOT NULL
        GROUP BY user_id
        HAVING MIN(req_dt) >= @from_dt AND MIN(req_dt) < @to_dt_exclusive
      ) t
    `),
  ]);

  const kpiRaw = kpiResult.recordset[0];
  const activeUsers = num(kpiRaw?.active_users);
  const totalCalls = num(kpiRaw?.total_calls);
  const okCnt = num(kpiRaw?.ok_cnt);

  const topUsers: GatewayUsageUserRow[] = usersResult.recordset.map((row) => {
    const calls = num(row.calls);
    const ok = num(row.ok_cnt);
    return {
      userId: String(row.user_id),
      userName: row.user_name?.trim() ?? "",
      calls,
      okCnt: ok,
      failCnt: num(row.fail_cnt),
      successRate: calls > 0 ? (ok / calls) * 100 : 0,
      avgMs: Math.round(num(row.avg_ms)),
      apiCnt: num(row.api_cnt),
      lastAccess: dateTimeText(row.last_access),
      topApiNm: row.top_api_nm?.trim() ?? "",
      topApiCalls: num(row.top_api_calls),
    };
  });

  const apiRows = apiResult.recordset.map((row) => ({
    apiNm: String(row.api_nm ?? ""),
    calls: num(row.calls),
  }));
  const apiShare: GatewayUsageApiShare[] = apiRows.map((row) => ({
    ...row,
    sharePct: totalCalls > 0 ? (row.calls / totalCalls) * 100 : 0,
  }));

  const allUsersRequest = pool.request();
  bindUsageParams(allUsersRequest, params);
  const allUsersResult = await allUsersRequest.query<{
    user_id: string;
    calls: number;
  }>(`
    SELECT user_id, COUNT(*) AS calls
    FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
    WHERE ${whereClause}
    GROUP BY user_id
    ORDER BY calls DESC
  `);
  const allUserCalls = allUsersResult.recordset.map((row) => ({
    userId: String(row.user_id),
    calls: num(row.calls),
  }));
  const top20Count = Math.max(1, Math.ceil(allUserCalls.length * 0.2));
  const top20Calls = allUserCalls
    .slice(0, top20Count)
    .reduce((sum, row) => sum + row.calls, 0);

  return {
    kpi: {
      activeUsers,
      totalCalls,
      avgCallsPerUser:
        activeUsers > 0 ? Math.round((totalCalls / activeUsers) * 10) / 10 : 0,
      successRate:
        totalCalls > 0 ? Math.round((okCnt / totalCalls) * 1000) / 10 : 0,
      avgMs: Math.round(num(kpiRaw?.avg_ms)),
      firstTimeUsers: num(firstTimeResult.recordset[0]?.first_time_users),
    },
    dailyTrend: dailyResult.recordset.map((row) => ({
      dt: dateText(row.dt),
      activeUsers: num(row.active_users),
      calls: num(row.calls),
    })),
    topUsers,
    apiShare,
    hourly: hourlyResult.recordset.map((row) => ({
      hour: num(row.hour),
      calls: num(row.calls),
    })),
    insight: {
      top20UserCount: top20Count,
      top20CallSharePct:
        totalCalls > 0 ? Math.round((top20Calls / totalCalls) * 1000) / 10 : 0,
    },
  };
}

export async function fetchGatewayUsageUserDetail(
  params: GatewayUsageParams & { userId: string },
): Promise<GatewayUsageUserDetail> {
  const userId = params.userId.trim();
  if (!userId) {
    throw new Error("user_id가 필요합니다.");
  }

  const whereClause = buildUsageWhereClause(params);
  const pool = await getCasDbPool();

  const summaryRequest = pool.request();
  bindUsageParams(summaryRequest, params);
  summaryRequest.input("user_id", sql.NVarChar(50), userId);

  const dailyRequest = pool.request();
  bindUsageParams(dailyRequest, params);
  dailyRequest.input("user_id", sql.NVarChar(50), userId);

  const apiRequest = pool.request();
  bindUsageParams(apiRequest, params);
  apiRequest.input("user_id", sql.NVarChar(50), userId);

  const [summaryResult, dailyResult, apiResult] = await Promise.all([
    summaryRequest.query<{
      user_name: string | null;
      calls: number;
      ok_cnt: number;
      avg_ms: number | null;
    }>(`
      SELECT
        MAX(user_name) AS user_name,
        COUNT(*) AS calls,
        SUM(CASE WHEN http_status < 400 THEN 1 ELSE 0 END) AS ok_cnt,
        AVG(CAST(elapsed_ms AS float)) AS avg_ms
      FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
      WHERE ${whereClause} AND user_id = @user_id
    `),
    dailyRequest.query<{ dt: Date; calls: number }>(`
      SELECT
        CONVERT(date, req_dt) AS dt,
        COUNT(*) AS calls
      FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
      WHERE ${whereClause} AND user_id = @user_id
      GROUP BY CONVERT(date, req_dt)
      ORDER BY dt
    `),
    apiRequest.query<{
      api_nm: string;
      calls: number;
      ok_cnt: number;
      avg_ms: number | null;
    }>(`
      SELECT
        api_nm,
        COUNT(*) AS calls,
        SUM(CASE WHEN http_status < 400 THEN 1 ELSE 0 END) AS ok_cnt,
        AVG(CAST(elapsed_ms AS float)) AS avg_ms
      FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
      WHERE ${whereClause} AND user_id = @user_id
      GROUP BY api_nm
      ORDER BY calls DESC, api_nm
    `),
  ]);

  const summary = summaryResult.recordset[0];
  const calls = num(summary?.calls);

  return {
    userId,
    userName: summary?.user_name?.trim() ?? "",
    calls,
    successRate: calls > 0 ? Math.round((num(summary?.ok_cnt) / calls) * 1000) / 10 : 0,
    avgMs: Math.round(num(summary?.avg_ms)),
    dailyTrend: dailyResult.recordset.map((row) => ({
      dt: dateText(row.dt),
      calls: num(row.calls),
    })),
    apis: apiResult.recordset.map((row) => {
      const apiCalls = num(row.calls);
      return {
        apiNm: String(row.api_nm ?? ""),
        calls: apiCalls,
        successRate:
          apiCalls > 0 ? Math.round((num(row.ok_cnt) / apiCalls) * 1000) / 10 : 0,
        avgMs: Math.round(num(row.avg_ms)),
      };
    }),
  };
}

export async function fetchGatewayUsageAllUsers(
  params: GatewayUsageParams,
): Promise<GatewayUsageUserRow[]> {
  const whereClause = buildUsageWhereClause(params);
  const pool = await getCasDbPool();
  const request = pool.request();
  bindUsageParams(request, params);

  const result = await request.query<{
    user_id: string;
    user_name: string | null;
    calls: number;
    ok_cnt: number;
    fail_cnt: number;
    avg_ms: number | null;
    api_cnt: number;
    last_access: Date;
    top_api_nm: string | null;
    top_api_calls: number | null;
  }>(`
    WITH filtered AS (
      SELECT *
      FROM dbo.GATEWAY_API_AUDIT_LOG WITH (NOLOCK)
      WHERE ${whereClause}
    ),
    user_stats AS (
      SELECT
        user_id,
        MAX(user_name) AS user_name,
        COUNT(*) AS calls,
        SUM(CASE WHEN http_status < 400 THEN 1 ELSE 0 END) AS ok_cnt,
        SUM(CASE WHEN http_status >= 400 THEN 1 ELSE 0 END) AS fail_cnt,
        AVG(CAST(elapsed_ms AS float)) AS avg_ms,
        COUNT(DISTINCT api_nm) AS api_cnt,
        CONVERT(varchar(23), MAX(req_dt), 121) AS last_access
      FROM filtered
      GROUP BY user_id
    ),
    user_api AS (
      SELECT
        user_id,
        api_nm,
        COUNT(*) AS api_calls,
        ROW_NUMBER() OVER (
          PARTITION BY user_id
          ORDER BY COUNT(*) DESC, api_nm
        ) AS rn
      FROM filtered
      GROUP BY user_id, api_nm
    )
    SELECT
      u.user_id,
      u.user_name,
      u.calls,
      u.ok_cnt,
      u.fail_cnt,
      u.avg_ms,
      u.api_cnt,
      u.last_access,
      a.api_nm AS top_api_nm,
      a.api_calls AS top_api_calls
    FROM user_stats u
    LEFT JOIN user_api a
      ON u.user_id = a.user_id AND a.rn = 1
    ORDER BY u.calls DESC, u.user_id
  `);

  return result.recordset.map((row) => {
    const calls = num(row.calls);
    const ok = num(row.ok_cnt);
    return {
      userId: String(row.user_id),
      userName: row.user_name?.trim() ?? "",
      calls,
      okCnt: ok,
      failCnt: num(row.fail_cnt),
      successRate: calls > 0 ? (ok / calls) * 100 : 0,
      avgMs: Math.round(num(row.avg_ms)),
      apiCnt: num(row.api_cnt),
      lastAccess: dateTimeText(row.last_access),
      topApiNm: row.top_api_nm?.trim() ?? "",
      topApiCalls: num(row.top_api_calls),
    };
  });
}

export function buildGatewayUsageWorkbook(rows: GatewayUsageUserRow[]): Buffer {
  const XLSX = require("xlsx") as typeof import("xlsx");
  const header = [
    "사용자ID",
    "사용자명",
    "호출수",
    "성공률(%)",
    "평균응답(ms)",
    "사용API수",
    "최근접속",
    "주요API",
    "주요API호출수",
  ];
  const body = rows.map((row) => [
    row.userId,
    row.userName,
    row.calls,
    Math.round(row.successRate * 10) / 10,
    row.avgMs,
    row.apiCnt,
    formatExportDateTime(row.lastAccess),
    row.topApiNm,
    row.topApiCalls,
  ]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "사용자통계");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function formatExportDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
}
