"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CasAlert,
  CasCard,
  CasCompactInput,
  CasExcelButton,
  CasInlineField,
  CasSearchButton,
  CasSearchFormActions,
  CasSecondaryButton,
  stickyThClass,
  tdClass,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  CasSearchFieldsRow,
  CasSearchFormRow,
} from "@/app/(ai)/cas-ncom/cas-page-top-bar";
import {
  CALLER_TYPE_OPTIONS,
  GATEWAY_API_NAMES,
  formatGatewayApiDisplayLabel,
  GATEWAY_AUDIT_LOG_GRID_COLUMNS,
  HTTP_STATUS_FILTER_OPTIONS,
  cellValue,
  formatReqDt,
  isFailedAuditRow,
  type GatewayAuditLogRow,
} from "@/app/lib/gateway-audit-log-columns";

export type GatewayAuditLogListFilters = {
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  userName?: string;
  apiNm?: string;
};

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { from: fmt(from), to: fmt(to) };
}

function buildSearchParams(input: {
  dateFrom: string;
  dateTo: string;
  userId: string;
  userName: string;
  apiNm: string;
  apiNmCustom: string;
  callerType: string;
  httpStatusFilter: string;
  httpStatusCode: string;
  clientId: string;
  page: number;
  pageSize: number;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("from", input.dateFrom);
  params.set("to", input.dateTo);
  if (input.userId.trim()) params.set("user_id", input.userId.trim());
  if (input.userName.trim()) params.set("user_name", input.userName.trim());

  const apiNm =
    input.apiNm === "__custom__" ? input.apiNmCustom.trim() : input.apiNm.trim();
  if (apiNm) params.set("api_nm", apiNm);

  if (input.callerType.trim()) params.set("caller_type", input.callerType.trim());
  if (input.httpStatusFilter.trim()) {
    params.set("http_status_filter", input.httpStatusFilter.trim());
  }
  if (input.httpStatusFilter === "custom" && input.httpStatusCode.trim()) {
    params.set("http_status_code", input.httpStatusCode.trim());
  }
  if (input.clientId.trim()) params.set("client_id", input.clientId.trim());
  params.set("page", String(input.page));
  params.set("page_size", String(input.pageSize));
  return params;
}

function renderGridCell(row: GatewayAuditLogRow, key: keyof GatewayAuditLogRow) {
  if (key === "req_dt") return formatReqDt(row.req_dt);
  return cellValue(row, key);
}

function resolveApiNm(apiNm?: string): { apiNm: string; apiNmCustom: string } {
  if (!apiNm?.trim()) return { apiNm: "", apiNmCustom: "" };
  const known = GATEWAY_API_NAMES.includes(
    apiNm as (typeof GATEWAY_API_NAMES)[number],
  );
  if (known) return { apiNm, apiNmCustom: "" };
  return { apiNm: "__custom__", apiNmCustom: apiNm };
}

export function GatewayAuditLogListView({
  initialFilters,
  autoSearch = false,
}: {
  initialFilters?: GatewayAuditLogListFilters;
  autoSearch?: boolean;
}) {
  const initialRange = useMemo(() => defaultDateRange(), []);
  const initialApi = useMemo(
    () => resolveApiNm(initialFilters?.apiNm),
    [initialFilters?.apiNm],
  );

  const [dateFrom, setDateFrom] = useState(
    initialFilters?.dateFrom ?? initialRange.from,
  );
  const [dateTo, setDateTo] = useState(
    initialFilters?.dateTo ?? initialRange.to,
  );
  const [userId, setUserId] = useState(initialFilters?.userId ?? "");
  const [userName, setUserName] = useState(initialFilters?.userName ?? "");
  const [apiNm, setApiNm] = useState(initialApi.apiNm);
  const [apiNmCustom, setApiNmCustom] = useState(initialApi.apiNmCustom);
  const [callerType, setCallerType] = useState("user");
  const [httpStatusFilter, setHttpStatusFilter] = useState("");
  const [httpStatusCode, setHttpStatusCode] = useState("");
  const [clientId, setClientId] = useState("");
  const [pageSize, setPageSize] = useState<50 | 100>(50);
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<GatewayAuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [detailRow, setDetailRow] = useState<GatewayAuditLogRow | null>(null);

  const searchInput = useMemo(
    () => ({
      dateFrom,
      dateTo,
      userId,
      userName,
      apiNm,
      apiNmCustom,
      callerType,
      httpStatusFilter,
      httpStatusCode,
      clientId,
      page,
      pageSize,
    }),
    [
      dateFrom,
      dateTo,
      userId,
      userName,
      apiNm,
      apiNmCustom,
      callerType,
      httpStatusFilter,
      httpStatusCode,
      clientId,
      page,
      pageSize,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadList = useCallback(
    async (
      nextPage = page,
      overrides?: Partial<{ pageSize: 50 | 100 }>,
    ) => {
      if (!dateFrom || !dateTo) {
        setErr("조회 기간을 입력해 주세요.");
        return;
      }

      const effectivePageSize = overrides?.pageSize ?? pageSize;

      setLoading(true);
      setErr(null);
      try {
        const params = buildSearchParams({
          ...searchInput,
          page: nextPage,
          pageSize: effectivePageSize,
        });
        const res = await fetch(`/api/gateway-audit-log/search?${params}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok: boolean;
          items?: GatewayAuditLogRow[];
          total?: number;
          page?: number;
          pageSize?: number;
          error?: string;
        };

        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `조회 실패 (HTTP ${res.status})`);
        }

        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setPage(data.page ?? nextPage);
        if (overrides?.pageSize) setPageSize(overrides.pageSize);
        setSearched(true);
      } catch (e) {
        setItems([]);
        setTotal(0);
        setErr(e instanceof Error ? e.message : String(e));
        setSearched(true);
      } finally {
        setLoading(false);
      }
    },
    [dateFrom, dateTo, page, pageSize, searchInput],
  );

  useEffect(() => {
    if (!initialFilters) return;
    if (initialFilters.dateFrom) setDateFrom(initialFilters.dateFrom);
    if (initialFilters.dateTo) setDateTo(initialFilters.dateTo);
    if (initialFilters.userId != null) setUserId(initialFilters.userId);
    if (initialFilters.userName != null) setUserName(initialFilters.userName);
    if (initialFilters.apiNm != null) {
      const next = resolveApiNm(initialFilters.apiNm);
      setApiNm(next.apiNm);
      setApiNmCustom(next.apiNmCustom);
    }
  }, [initialFilters]);

  useEffect(() => {
    if (autoSearch) {
      void loadList(1);
    }
    // remount via key when drilling down from dashboard
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = useCallback(() => {
    setPage(1);
    void loadList(1);
  }, [loadList]);

  const handleExport = useCallback(async () => {
    if (!dateFrom || !dateTo) {
      setErr("조회 기간을 입력해 주세요.");
      return;
    }

    setExporting(true);
    setErr(null);
    try {
      const params = buildSearchParams({ ...searchInput, page: 1 });
      params.delete("page");
      params.delete("page_size");

      const res = await fetch(`/api/gateway-audit-log/export?${params}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        let message = `엑셀 다운로드 실패 (HTTP ${res.status})`;
        try {
          const data = JSON.parse(text) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          if (text.trim()) message = text.slice(0, 200);
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const truncated = res.headers.get("X-Export-Truncated");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gateway-audit-log_${dateFrom}_${dateTo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      if (truncated) {
        setErr(
          `엑셀은 최대 10,000건까지만 내려받습니다. (${truncated.replace("true; ", "")})`,
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }, [dateFrom, dateTo, searchInput]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <CasCard title="검색조건">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
        >
          <CasSearchFormRow
            singleLine
            fields={
              <CasSearchFieldsRow singleLine>
                <CasInlineField label="요청기간" aligned className="shrink-0">
                  <div className="flex shrink-0 flex-nowrap items-center gap-1">
                    <CasCompactInput
                      type="date"
                      className="!w-[130px] shrink-0"
                      value={dateFrom}
                      required
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                    <span className="shrink-0 text-slate-400">~</span>
                    <CasCompactInput
                      type="date"
                      className="!w-[130px] shrink-0"
                      value={dateTo}
                      required
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </CasInlineField>

                <CasInlineField label="사용자ID" aligned className="shrink-0">
                  <CasCompactInput
                    className="!w-[120px] shrink-0"
                    value={userId}
                    placeholder="부분검색"
                    onChange={(e) => setUserId(e.target.value)}
                  />
                </CasInlineField>

                <CasInlineField label="사용자명" aligned className="shrink-0">
                  <CasCompactInput
                    className="!w-[120px] shrink-0"
                    value={userName}
                    placeholder="부분검색"
                    onChange={(e) => setUserName(e.target.value)}
                  />
                </CasInlineField>

                <CasInlineField label="API명" aligned className="shrink-0">
                  <select
                    className="h-9 w-[160px] shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[13px] text-slate-800 shadow-sm focus:border-[#1e2f4f] focus:outline-none focus:ring-2 focus:ring-[#1e2f4f]/20"
                    value={apiNm}
                    onChange={(e) => setApiNm(e.target.value)}
                  >
                    <option value="">전체</option>
                    {GATEWAY_API_NAMES.map((name) => (
                      <option key={name} value={name} title={name}>
                        {formatGatewayApiDisplayLabel(name)}
                      </option>
                    ))}
                    <option value="__custom__">직접입력</option>
                  </select>
                </CasInlineField>

                {apiNm === "__custom__" ? (
                  <CasInlineField label="API명 입력" aligned className="shrink-0">
                    <CasCompactInput
                      className="!w-[160px] shrink-0"
                      value={apiNmCustom}
                      placeholder="API명"
                      onChange={(e) => setApiNmCustom(e.target.value)}
                    />
                  </CasInlineField>
                ) : null}

                <CasInlineField label="호출구분" aligned className="shrink-0">
                  <select
                    className="h-9 w-[110px] shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[13px] text-slate-800 shadow-sm focus:border-[#1e2f4f] focus:outline-none focus:ring-2 focus:ring-[#1e2f4f]/20"
                    value={callerType}
                    onChange={(e) => setCallerType(e.target.value)}
                  >
                    {CALLER_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value || "all"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </CasInlineField>

                <CasInlineField label="HTTP상태" aligned className="shrink-0">
                  <div className="flex shrink-0 flex-nowrap items-center gap-1">
                    <select
                      className="h-9 w-[120px] shrink-0 rounded-md border border-slate-200 bg-white px-2 text-[13px] text-slate-800 shadow-sm focus:border-[#1e2f4f] focus:outline-none focus:ring-2 focus:ring-[#1e2f4f]/20"
                      value={httpStatusFilter}
                      onChange={(e) => setHttpStatusFilter(e.target.value)}
                    >
                      {HTTP_STATUS_FILTER_OPTIONS.map((opt) => (
                        <option key={opt.value || "all"} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {httpStatusFilter === "custom" ? (
                      <CasCompactInput
                        className="!w-[70px] shrink-0"
                        value={httpStatusCode}
                        placeholder="404"
                        maxLength={3}
                        onChange={(e) =>
                          setHttpStatusCode(e.target.value.replace(/\D/g, ""))
                        }
                      />
                    ) : null}
                  </div>
                </CasInlineField>

                <CasInlineField label="클라이언트ID" aligned className="shrink-0">
                  <CasCompactInput
                    className="!w-[140px] shrink-0"
                    value={clientId}
                    placeholder="부분검색"
                    onChange={(e) => setClientId(e.target.value)}
                  />
                </CasInlineField>
              </CasSearchFieldsRow>
            }
            actions={
              <CasSearchFormActions inline>
                <CasExcelButton
                  type="button"
                  disabled={exporting || loading}
                  onClick={() => void handleExport()}
                >
                  {exporting ? "다운로드 중…" : "엑셀다운"}
                </CasExcelButton>
                <CasSearchButton type="submit" disabled={loading}>
                  {loading ? "조회 중…" : "조회"}
                </CasSearchButton>
              </CasSearchFormActions>
            }
          />
        </form>
      </CasCard>

      {err ? <CasAlert tone="error">{err}</CasAlert> : null}

      <CasCard
        title="조회결과"
        action={
          searched ? (
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
              <span className="inline-flex items-center rounded-full bg-[#1e2f4f]/10 px-2.5 py-1 font-medium text-[#1e2f4f]">
                전체 {total.toLocaleString()}건
              </span>
              <span>
                {page} / {totalPages} 페이지 · {pageSize}건/페이지 · 표시{" "}
                {items.length.toLocaleString()}건
              </span>
            </div>
          ) : null
        }
        className="min-h-0 flex-1"
        bodyClassName="flex min-h-0 flex-1 flex-col gap-2 p-2"
      >
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200/80">
          <table className="w-max min-w-full border-collapse text-left">
            <thead>
              <tr>
                {GATEWAY_AUDIT_LOG_GRID_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={stickyThClass}
                    style={
                      col.width
                        ? { minWidth: col.width, maxWidth: col.width }
                        : undefined
                    }
                  >
                    {col.label}
                  </th>
                ))}
                <th className={stickyThClass} style={{ minWidth: "3.5rem" }}>
                  IF상세
                </th>
              </tr>
            </thead>
            <tbody>
              {!searched ? (
                <tr>
                  <td
                    colSpan={GATEWAY_AUDIT_LOG_GRID_COLUMNS.length + 1}
                    className={`${tdClass} py-10 text-center text-slate-500`}
                  >
                    검색 조건을 입력한 뒤 조회를 눌러 주세요.
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={GATEWAY_AUDIT_LOG_GRID_COLUMNS.length + 1}
                    className={`${tdClass} py-10 text-center text-slate-500`}
                  >
                    {loading ? "조회 중…" : "조회 결과가 없습니다."}
                  </td>
                </tr>
              ) : (
                items.map((row) => {
                  const failed = isFailedAuditRow(row);
                  return (
                    <tr
                      key={row.log_id}
                      className={failed ? "bg-red-50/80" : undefined}
                    >
                      {GATEWAY_AUDIT_LOG_GRID_COLUMNS.map((col) => {
                        const text = renderGridCell(row, col.key);
                        return (
                          <td
                            key={col.key}
                            className={`${tdClass} ${col.wrap ? "max-w-[16rem] whitespace-pre-wrap break-words" : ""} ${failed ? "bg-red-50/80" : ""}`}
                            title={text || undefined}
                          >
                            {text || "—"}
                          </td>
                        );
                      })}
                      <td
                        className={`${tdClass} text-center ${failed ? "bg-red-50/80" : ""}`}
                      >
                        {row.interface_fields?.trim() ? (
                          <button
                            type="button"
                            className="rounded px-1.5 py-0.5 text-[11px] font-medium text-[#1e2f4f] hover:bg-sky-50"
                            onClick={() => setDetailRow(row)}
                          >
                            보기
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {searched && total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
            <div className="flex items-center gap-2 text-[12px] text-slate-600">
              <span>페이지 크기</span>
              <select
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[12px]"
                value={pageSize}
                onChange={(e) => {
                  const next = Number(e.target.value) === 100 ? 100 : 50;
                  setPage(1);
                  void loadList(1, { pageSize: next });
                }}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <CasSecondaryButton
                type="button"
                disabled={loading || page <= 1}
                onClick={() => void loadList(page - 1)}
              >
                이전
              </CasSecondaryButton>
              <span className="text-[12px] tabular-nums text-slate-600">
                {page} / {totalPages}
              </span>
              <CasSecondaryButton
                type="button"
                disabled={loading || page >= totalPages}
                onClick={() => void loadList(page + 1)}
              >
                다음
              </CasSecondaryButton>
            </div>
          </div>
        ) : null}
      </CasCard>

      {detailRow ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-detail-title"
          onClick={() => setDetailRow(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3
                id="audit-detail-title"
                className="text-sm font-semibold text-slate-800"
              >
                인터페이스 항목 · log_id {detailRow.log_id}
              </h3>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
                onClick={() => setDetailRow(null)}
              >
                닫기
              </button>
            </div>
            <div className="max-h-[calc(80vh-3rem)] overflow-auto px-4 py-3 text-[13px] leading-relaxed text-slate-700">
              <p className="mb-2 text-[12px] text-slate-500">
                {formatReqDt(detailRow.req_dt)} · {detailRow.api_nm ?? ""} ·
                항목 {detailRow.interface_field_cnt ?? 0}개
              </p>
              <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-[12px]">
                {detailRow.interface_fields?.trim() || "(없음)"}
              </pre>
              {detailRow.search_cond?.trim() ? (
                <>
                  <p className="mt-4 mb-1 text-[12px] font-semibold text-slate-600">
                    조회조건
                  </p>
                  <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-[12px]">
                    {detailRow.search_cond}
                  </pre>
                </>
              ) : null}
              {detailRow.fail_reason?.trim() ? (
                <>
                  <p className="mt-4 mb-1 text-[12px] font-semibold text-red-700">
                    실패사유
                  </p>
                  <pre className="whitespace-pre-wrap break-words rounded-lg bg-red-50 p-3 text-[12px] text-red-800">
                    {detailRow.fail_reason}
                  </pre>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
