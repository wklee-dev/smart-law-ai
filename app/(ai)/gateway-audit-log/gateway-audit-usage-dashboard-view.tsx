"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CasAlert,
  CasCard,
  CasCompactInput,
  CasInlineField,
  CasExcelButton,
  CasSearchButton,
  CasSearchFormActions,
  CasSecondaryButton,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  CasSearchFieldsRow,
  CasSearchFormRow,
} from "@/app/(ai)/cas-ncom/cas-page-top-bar";
import {
  GATEWAY_API_NAMES,
  formatGatewayApiDisplayLabel,
  formatReqDt,
} from "@/app/lib/gateway-audit-log-columns";
import type {
  GatewayUsageApiShare,
  GatewayUsageDailyPoint,
  GatewayUsageDashboard,
  GatewayUsageHourlyPoint,
  GatewayUsageUserDetail,
  GatewayUsageUserRow,
} from "@/app/lib/gateway-audit-usage-server";

function defaultDateRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { from: fmt(from), to: fmt(to) };
}

function fmtNum(n: number): string {
  return n.toLocaleString("ko-KR");
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function shortDate(dt: string): string {
  if (!dt) return "";
  const parts = dt.split("-");
  if (parts.length !== 3) return dt;
  return `${parts[1]}/${parts[2]}`;
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1 text-[28px] font-bold tabular-nums leading-none ${accent ?? "text-[#1e2f4f]"}`}
      >
        {value}
      </p>
      {sub ? <p className="mt-1.5 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function DailyTrendSection({
  points,
  trendMode,
  onTrendModeChange,
}: {
  points: GatewayUsageDailyPoint[];
  trendMode: "users" | "calls";
  onTrendModeChange: (mode: "users" | "calls") => void;
}) {
  const maxUsers = Math.max(1, ...points.map((p) => p.activeUsers));
  const maxCalls = Math.max(1, ...points.map((p) => p.calls));

  if (points.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-500">
        기간 내 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          className={`rounded-full px-3 py-1 text-[11px] font-medium ${
            trendMode === "users"
              ? "bg-[#1e2f4f] text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
          onClick={() => onTrendModeChange("users")}
        >
          활성 사용자
        </button>
        <button
          type="button"
          className={`rounded-full px-3 py-1 text-[11px] font-medium ${
            trendMode === "calls"
              ? "bg-slate-700 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
          onClick={() => onTrendModeChange("calls")}
        >
          호출 수
        </button>
      </div>
      <div className="flex h-52 items-end gap-1 overflow-x-auto pb-6">
        {points.map((point) => {
          const value =
            trendMode === "users" ? point.activeUsers : point.calls;
          const max = trendMode === "users" ? maxUsers : maxCalls;
          const heightPct = Math.max(4, (value / max) * 100);
          return (
            <div
              key={point.dt}
              className="flex min-w-[2.4rem] flex-1 flex-col items-center gap-1"
              title={`${point.dt}\n활성 ${point.activeUsers}명 · 호출 ${point.calls}건`}
            >
              <span className="text-[10px] tabular-nums text-slate-500">
                {value > 0 ? fmtNum(value) : ""}
              </span>
              <div className="flex h-36 w-full items-end justify-center">
                <div
                  className={`w-full max-w-[2rem] rounded-t-md ${
                    trendMode === "users" ? "bg-[#1e2f4f]/85" : "bg-slate-500/80"
                  }`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500">{shortDate(point.dt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ApiShareSection({ items }: { items: GatewayUsageApiShare[] }) {
  const top = items.slice(0, 8);
  if (top.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-500">API 호출 데이터 없음</p>
    );
  }

  return (
    <div className="space-y-2.5">
      {top.map((item) => (
        <div key={item.apiNm}>
          <div className="mb-1 flex items-center justify-between gap-2 text-[12px]">
            <span
              className="truncate font-medium text-slate-700"
              title={item.apiNm}
            >
              {formatGatewayApiDisplayLabel(item.apiNm)}
            </span>
            <span className="shrink-0 tabular-nums text-slate-500">
              {fmtNum(item.calls)} · {fmtPct(item.sharePct)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#1e2f4f]/75"
              style={{ width: `${Math.max(item.sharePct, 2)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function HourlySection({ points }: { points: GatewayUsageHourlyPoint[] }) {
  const filled = useMemo(() => {
    const map = new Map(points.map((p) => [p.hour, p.calls]));
    return Array.from({ length: 24 }, (_, hour) => ({
      hour,
      calls: map.get(hour) ?? 0,
    }));
  }, [points]);

  const max = Math.max(1, ...filled.map((p) => p.calls));
  const peak = filled.reduce(
    (best, p) => (p.calls > best.calls ? p : best),
    filled[0],
  );

  return (
    <div>
      <p className="mb-3 text-[12px] text-slate-500">
        피크 시간대:{" "}
        <span className="font-semibold text-slate-700">
          {peak.hour}시 ({fmtNum(peak.calls)}건)
        </span>
      </p>
      <div className="flex h-28 items-end gap-0.5">
        {filled.map((point) => {
          const heightPct = Math.max(2, (point.calls / max) * 100);
          return (
            <div
              key={point.hour}
              className="flex flex-1 flex-col items-center gap-0.5"
              title={`${point.hour}시 · ${point.calls}건`}
            >
              <div className="flex h-20 w-full items-end">
                <div
                  className="w-full rounded-t bg-violet-400/70"
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              {point.hour % 3 === 0 ? (
                <span className="text-[9px] text-slate-400">{point.hour}</span>
              ) : (
                <span className="text-[9px] text-transparent">·</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UserRankSection({
  users,
  maxCalls,
  onSelect,
}: {
  users: GatewayUsageUserRow[];
  maxCalls: number;
  onSelect: (user: GatewayUsageUserRow) => void;
}) {
  if (users.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        사용자 접속 데이터가 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {users.map((user, index) => {
        const barPct = Math.max(4, (user.calls / maxCalls) * 100);
        return (
          <button
            key={user.userId}
            type="button"
            className="w-full rounded-xl border border-slate-200/80 bg-white p-3 text-left transition hover:border-[#1e2f4f]/40 hover:bg-sky-50/40"
            onClick={() => onSelect(user)}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-600">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-semibold text-slate-800">{user.userId}</span>
                  {user.userName ? (
                    <span className="text-[12px] text-slate-500">{user.userName}</span>
                  ) : null}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#1e2f4f]"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                  <span>
                    호출 <strong className="text-slate-800">{fmtNum(user.calls)}</strong>
                  </span>
                  <span>성공률 {fmtPct(user.successRate)}</span>
                  <span>평균 {fmtNum(user.avgMs)}ms</span>
                  <span>API {user.apiCnt}종</span>
                  {user.topApiNm ? (
                    <span className="truncate" title={user.topApiNm}>
                      주요 {user.topApiNm}
                    </span>
                  ) : null}
                  <span className="text-slate-400">
                    최근 {formatReqDt(user.lastAccess)}
                  </span>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function UserDetailModal({
  detail,
  loading,
  onClose,
  onOpenRawLog,
}: {
  detail: GatewayUsageUserDetail | null;
  loading: boolean;
  onClose: () => void;
  onOpenRawLog: (userId: string) => void;
}) {
  if (!detail && !loading) return null;

  const maxDaily = Math.max(1, ...(detail?.dailyTrend.map((d) => d.calls) ?? []));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              {detail?.userId ?? "사용자"} 사용 요약
            </h3>
            {detail?.userName ? (
              <p className="text-[12px] text-slate-500">{detail.userName}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            onClick={onClose}
          >
            닫기
          </button>
        </div>

        <div className="max-h-[calc(85vh-3.5rem)] overflow-auto p-4">
          {loading ? (
            <p className="py-12 text-center text-sm text-slate-500">불러오는 중…</p>
          ) : detail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard label="호출 수" value={fmtNum(detail.calls)} />
                <KpiCard
                  label="성공률"
                  value={fmtPct(detail.successRate)}
                  accent="text-emerald-600"
                />
                <KpiCard label="평균 응답" value={`${fmtNum(detail.avgMs)}ms`} />
                <KpiCard
                  label="사용 API"
                  value={fmtNum(detail.apis.length)}
                  accent="text-violet-600"
                />
              </div>

              <CasCard title="일별 호출 추이" bodyClassName="p-3">
                {detail.dailyTrend.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">데이터 없음</p>
                ) : (
                  <div className="flex h-36 items-end gap-1">
                    {detail.dailyTrend.map((point) => {
                      const heightPct = Math.max(
                        4,
                        (point.calls / maxDaily) * 100,
                      );
                      return (
                        <div
                          key={point.dt}
                          className="flex min-w-[2rem] flex-1 flex-col items-center gap-1"
                          title={`${point.dt}: ${point.calls}건`}
                        >
                          <span className="text-[10px] tabular-nums text-slate-500">
                            {point.calls || ""}
                          </span>
                          <div className="flex h-24 w-full items-end">
                            <div
                              className="w-full rounded-t bg-[#1e2f4f]/80"
                              style={{ height: `${heightPct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {shortDate(point.dt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CasCard>

              <CasCard title="사용 API" bodyClassName="p-3">
                {detail.apis.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">데이터 없음</p>
                ) : (
                  <div className="space-y-2">
                    {detail.apis.map((api) => (
                      <div
                        key={api.apiNm}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px]"
                      >
                        <span className="font-medium text-slate-800" title={api.apiNm}>
                          {formatGatewayApiDisplayLabel(api.apiNm)}
                        </span>
                        <span className="tabular-nums text-slate-600">
                          {fmtNum(api.calls)}건 · {fmtPct(api.successRate)} ·{" "}
                          {fmtNum(api.avgMs)}ms
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CasCard>

              <div className="flex justify-end">
                <CasSecondaryButton
                  type="button"
                  onClick={() => onOpenRawLog(detail.userId)}
                >
                  API사용로그에서 보기
                </CasSecondaryButton>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function GatewayAuditUsageDashboardView({
  onOpenRawLog,
}: {
  onOpenRawLog: (filters: {
    dateFrom: string;
    dateTo: string;
    userId: string;
    apiNm?: string;
  }) => void;
}) {
  const initialRange = useMemo(() => defaultDateRange(7), []);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [apiNm, setApiNm] = useState("");
  const [apiNmCustom, setApiNmCustom] = useState("");

  const [data, setData] = useState<GatewayUsageDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [trendMode, setTrendMode] = useState<"users" | "calls">("users");

  const [userDetail, setUserDetail] = useState<GatewayUsageUserDetail | null>(
    null,
  );
  const [userDetailLoading, setUserDetailLoading] = useState(false);

  const effectiveApiNm =
    apiNm === "__custom__" ? apiNmCustom.trim() : apiNm.trim();

  const loadDashboard = useCallback(async () => {
    if (!dateFrom || !dateTo) {
      setErr("조회 기간을 입력해 주세요.");
      return;
    }

    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo });
      if (effectiveApiNm) params.set("api_nm", effectiveApiNm);

      const res = await fetch(
        `/api/gateway-audit-log/usage/dashboard?${params}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
      } & Partial<GatewayUsageDashboard>;

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `조회 실패 (HTTP ${res.status})`);
      }

      setData({
        kpi: json.kpi!,
        dailyTrend: json.dailyTrend ?? [],
        topUsers: json.topUsers ?? [],
        apiShare: json.apiShare ?? [],
        hourly: json.hourly ?? [],
        insight: json.insight ?? { top20UserCount: 0, top20CallSharePct: 0 },
      });
      setSearched(true);
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : String(e));
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, effectiveApiNm]);

  const handleExport = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    setExporting(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ from: dateFrom, to: dateTo });
      if (effectiveApiNm) params.set("api_nm", effectiveApiNm);
      const res = await fetch(
        `/api/gateway-audit-log/usage/export?${params}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gateway-usage_${dateFrom}_${dateTo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }, [dateFrom, dateTo, effectiveApiNm]);

  const openUserDetail = useCallback(
    async (user: GatewayUsageUserRow) => {
      setUserDetail(null);
      setUserDetailLoading(true);
      try {
        const params = new URLSearchParams({
          from: dateFrom,
          to: dateTo,
          user_id: user.userId,
        });
        if (effectiveApiNm) params.set("api_nm", effectiveApiNm);
        const res = await fetch(`/api/gateway-audit-log/usage/user?${params}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          ok: boolean;
          detail?: GatewayUsageUserDetail;
          error?: string;
        };
        if (!res.ok || !json.ok || !json.detail) {
          throw new Error(json.error ?? "사용자 상세 조회 실패");
        }
        setUserDetail(json.detail);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setUserDetailLoading(false);
      }
    },
    [dateFrom, dateTo, effectiveApiNm],
  );

  const applyQuickRange = (days: number) => {
    const range = defaultDateRange(days);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const maxUserCalls = Math.max(1, ...(data?.topUsers.map((u) => u.calls) ?? []));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <CasCard title="분석 기간" bodyClassName="px-3 py-2.5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void loadDashboard();
          }}
        >
          <CasSearchFormRow
            compact
            singleLine
            fields={
              <CasSearchFieldsRow compact singleLine>
                <CasInlineField label="기간" aligned className="shrink-0 gap-1.5">
                  <div className="flex shrink-0 flex-nowrap items-center gap-1">
                    <CasCompactInput
                      type="date"
                      className="!w-[118px] shrink-0"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                    <span className="shrink-0 text-slate-400">~</span>
                    <CasCompactInput
                      type="date"
                      className="!w-[118px] shrink-0"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                      onClick={() => applyQuickRange(7)}
                    >
                      7일
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                      onClick={() => applyQuickRange(30)}
                    >
                      30일
                    </button>
                  </div>
                </CasInlineField>

                <CasInlineField label="API" aligned className="shrink-0 gap-1.5">
                  <select
                    className="h-8 w-[14rem] max-w-[14rem] shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-800 shadow-sm focus:border-[#1e2f4f] focus:outline-none focus:ring-2 focus:ring-[#1e2f4f]/20"
                    value={apiNm}
                    onChange={(e) => setApiNm(e.target.value)}
                  >
                    <option value="">전체 API</option>
                    {GATEWAY_API_NAMES.map((name) => (
                      <option key={name} value={name} title={name}>
                        {formatGatewayApiDisplayLabel(name)}
                      </option>
                    ))}
                    <option value="__custom__">직접입력</option>
                  </select>
                </CasInlineField>

                {apiNm === "__custom__" ? (
                  <CasInlineField label="API 입력" aligned>
                    <CasCompactInput
                      className="w-[160px]"
                      value={apiNmCustom}
                      onChange={(e) => setApiNmCustom(e.target.value)}
                    />
                  </CasInlineField>
                ) : null}
              </CasSearchFieldsRow>
            }
            actions={
              <CasSearchFormActions inline>
                <CasExcelButton
                  type="button"
                  disabled={exporting || loading || !searched}
                  onClick={() => void handleExport()}
                >
                  {exporting ? "다운로드 중…" : "사용자통계 엑셀"}
                </CasExcelButton>
                <CasSearchButton type="submit" disabled={loading}>
                  {loading ? "분석 중…" : "조회"}
                </CasSearchButton>
              </CasSearchFormActions>
            }
          />
        </form>
      </CasCard>

      {err ? <CasAlert tone="error">{err}</CasAlert> : null}

      {!searched ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
          기간을 선택하고 조회하면 사용자 접속·사용 현황을 분석합니다.
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
          집계 데이터를 불러오는 중…
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="활성 사용자"
              value={fmtNum(data.kpi.activeUsers)}
              sub="caller_type=user"
            />
            <KpiCard label="총 호출" value={fmtNum(data.kpi.totalCalls)} />
            <KpiCard
              label="1인당 평균 호출"
              value={fmtNum(data.kpi.avgCallsPerUser)}
            />
            <KpiCard
              label="성공률"
              value={fmtPct(data.kpi.successRate)}
              accent="text-emerald-600"
            />
            <KpiCard
              label="평균 응답"
              value={`${fmtNum(data.kpi.avgMs)}ms`}
            />
            <KpiCard
              label="기간 내 신규 사용자"
              value={fmtNum(data.kpi.firstTimeUsers)}
              sub="전체 이력상 첫 호출"
              accent="text-violet-600"
            />
          </div>

          {data.insight.top20CallSharePct > 0 ? (
            <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-[13px] text-amber-900">
              상위 {data.insight.top20UserCount}명(약 20%)이 전체 호출의{" "}
              <strong>{fmtPct(data.insight.top20CallSharePct)}</strong>를
              차지합니다.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <CasCard
              title="일별 접속 추이"
              description="활성 사용자 / 호출 수"
              className="xl:col-span-2"
              bodyClassName="p-4"
            >
              <DailyTrendSection
                points={data.dailyTrend}
                trendMode={trendMode}
                onTrendModeChange={setTrendMode}
              />
            </CasCard>

            <CasCard title="시간대별 호출" bodyClassName="p-4">
              <HourlySection points={data.hourly} />
            </CasCard>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <CasCard
              title="사용자 사용량 TOP"
              description="클릭하면 요약 패널이 열립니다"
              className="xl:col-span-2"
              bodyClassName="p-3"
            >
              <UserRankSection
                users={data.topUsers}
                maxCalls={maxUserCalls}
                onSelect={(user) => void openUserDetail(user)}
              />
            </CasCard>

            <CasCard title="API별 호출 비중" bodyClassName="p-4">
              <ApiShareSection items={data.apiShare} />
            </CasCard>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500">
          표시할 데이터가 없습니다.
        </div>
      )}

      <UserDetailModal
        detail={userDetail}
        loading={userDetailLoading}
        onClose={() => {
          setUserDetail(null);
        }}
        onOpenRawLog={(userId) => {
          onOpenRawLog({
            dateFrom,
            dateTo,
            userId,
            apiNm: effectiveApiNm || undefined,
          });
          setUserDetail(null);
        }}
      />
    </div>
  );
}
