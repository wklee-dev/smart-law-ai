"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CustomerSearchDialog,
  type SelectedCustomer,
} from "@/app/(ai)/cas-ncom/import-performance/customer-search-dialog";
import { fetchCasNcomSearch } from "@/app/(ai)/cas-ncom/cas-ncom-search-client";
import { CasFieldSettingsDialog } from "@/app/(ai)/cas-ncom/cas-field-settings-dialog";
import { useCasNcomFieldProfile } from "@/app/(ai)/cas-ncom/use-cas-ncom-field-profile";
import {
  CasAlert,
  CasCard,
  CasCompactInput,
  CasInlineField,
  CasPageHeader,
  CasPageShell,
  CasResetButton,
  CasResultStats,
  CasSearchButton,
  CasSearchFormActions,
  CasSearchIconButton,
  CasTableEmpty,
  stickyThClass,
  tdClass,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import {
  CasPageTopBar,
  CasSearchFieldsRow,
  CasSearchFormRow,
} from "@/app/(ai)/cas-ncom/cas-page-top-bar";
import {
  useCasNcomAuth,
} from "@/app/(ai)/cas-ncom/use-cas-ncom-auth";
import {
  type CasGatewayMode,
  useCasGatewayMode,
} from "@/app/(ai)/cas-ncom/cas-gateway-mode";
import {
  cellValue,
  IMPORT_PERFORMANCE_COLUMNS,
  type ImportPerformanceRow,
} from "@/app/lib/cas-ncom-import-performance-columns";
import { buildImportColumnsFromProfile } from "@/app/lib/cas-ncom-field-profile-columns";

function todayRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const today = `${y}-${m}-${d}`;
  return { from: today, to: today };
}

function formatCustomerLabel(c: SelectedCustomer | null): string {
  if (!c) return "";
  const parts = [c.customerCode, c.customerName].filter(Boolean);
  return parts.join(" / ");
}

export function ImportPerformanceView() {
  const auth = useCasNcomAuth();
  const gateway = useCasGatewayMode();
  const fieldProfile = useCasNcomFieldProfile("ncomSearchQry", auth);
  const initialRange = useMemo(() => todayRange(), []);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] =
    useState<SelectedCustomer | null>(null);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [importDeclNo, setImportDeclNo] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [blNo, setBlNo] = useState("");
  const [materialCode, setMaterialCode] = useState("");

  const [items, setItems] = useState<ImportPerformanceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [tCnt, setTCnt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const displayColumns = useMemo(() => {
    if (!fieldProfile.profile?.hasRestrictions) {
      return IMPORT_PERFORMANCE_COLUMNS;
    }
    const fromProfile = buildImportColumnsFromProfile(fieldProfile.profile);
    return fromProfile.length > 0 ? fromProfile : IMPORT_PERFORMANCE_COLUMNS;
  }, [fieldProfile.profile]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      await fieldProfile.ensureProfileForSearch();

      const params = new URLSearchParams();
      if (selectedCustomer?.customsId) {
        params.set("customs_id", selectedCustomer.customsId);
      }
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      if (importDeclNo.trim()) params.set("singono", importDeclNo.trim());
      if (year.trim()) params.set("year", year.trim());
      if (blNo.trim()) params.set("bl_no", blNo.trim());
      if (materialCode.trim()) params.set("material_code", materialCode.trim());

      const result = await fetchCasNcomSearch<ImportPerformanceRow>(
        "/api/cas-ncom/import-performance/search",
        params,
        auth.ensureSession,
        auth.handleAuthFailure,
      );

      setItems(result.items);
      setTotal(result.total);
      setTCnt(result.tCnt);
      setSearched(true);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setTCnt(0);
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("인터페이스 항목이 설정되지 않았습니다")) {
        setErr(msg);
      }
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [
    auth.ensureSession,
    auth.handleAuthFailure,
    blNo,
    dateFrom,
    dateTo,
    fieldProfile.ensureProfileForSearch,
    importDeclNo,
    materialCode,
    selectedCustomer?.customsId,
    year,
  ]);

  const colSpan = displayColumns.length + 1;

  const resetSearch = useCallback(() => {
    const range = todayRange();
    setSelectedCustomer(null);
    setDateFrom(range.from);
    setDateTo(range.to);
    setImportDeclNo("");
    setYear(String(new Date().getFullYear()));
    setBlNo("");
    setMaterialCode("");
    setItems([]);
    setTotal(0);
    setTCnt(0);
    setErr(null);
    setSearched(false);
  }, []);

  const handleGatewayChange = useCallback(
    (next: CasGatewayMode) => {
      if (next === gateway.mode) return;
      gateway.setMode(next);
      auth.logout();
      resetSearch();
    },
    [auth, gateway, resetSearch],
  );

  const openFieldSettings = useCallback(() => {
    void fieldProfile.reloadProfile().then((p) => {
      if (p) fieldProfile.setSettingsOpen(true);
    });
  }, [fieldProfile]);

  return (
    <CasPageShell>
      <CasPageHeader
        title="수입실적 조회"
        action={
          <CasPageTopBar
            auth={auth}
            gatewayMode={gateway.mode}
            onGatewayChange={handleGatewayChange}
            onFieldSettings={openFieldSettings}
            fieldSettingsDisabled={loading || !auth.session}
          />
        }
      />

      <CasCard title="조회 조건">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void loadList();
          }}
        >
          <CasSearchFormRow
            singleLine
            compact
            fields={
            <CasSearchFieldsRow singleLine compact>
              <CasInlineField label="거래처" stacked className="shrink-0">
                <div className="relative w-[240px]">
                  <CasCompactInput
                    type="text"
                    readOnly
                    className="cursor-pointer pr-9"
                    value={formatCustomerLabel(selectedCustomer)}
                    placeholder="거래처 선택"
                    onClick={() => setCustomerOpen(true)}
                  />
                  <CasSearchIconButton
                    label="거래처 찾기"
                    onClick={() => setCustomerOpen(true)}
                  />
                </div>
              </CasInlineField>

              <CasInlineField label="수리일자" stacked className="shrink-0">
                <div className="flex items-center gap-1">
                  <CasCompactInput
                    type="date"
                    className="w-[130px]"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                  <span className="shrink-0 text-slate-400">~</span>
                  <CasCompactInput
                    type="date"
                    className="w-[130px]"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </CasInlineField>

              <CasInlineField label="수입신고번호" stacked className="shrink-0">
                <CasCompactInput
                  className="w-[160px]"
                  value={importDeclNo}
                  onChange={(e) => setImportDeclNo(e.target.value)}
                />
              </CasInlineField>

              <CasInlineField label="신고년도" stacked className="shrink-0">
                <CasCompactInput
                  className="w-[68px]"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="YYYY"
                  maxLength={4}
                />
              </CasInlineField>

              <CasInlineField label="BL번호" stacked className="shrink-0">
                <CasCompactInput
                  className="w-[140px]"
                  value={blNo}
                  onChange={(e) => setBlNo(e.target.value)}
                />
              </CasInlineField>

              <CasInlineField label="자재코드" stacked className="shrink-0">
                <CasCompactInput
                  className="w-[120px]"
                  value={materialCode}
                  onChange={(e) => setMaterialCode(e.target.value)}
                />
              </CasInlineField>
            </CasSearchFieldsRow>
            }
            actions={
              <CasSearchFormActions inline>
                <CasResetButton type="button" disabled={loading} onClick={resetSearch} />
                <CasSearchButton
                  type="submit"
                  disabled={loading || !auth.session}
                >
                  {loading ? "조회 중…" : "수입실적 조회"}
                </CasSearchButton>
              </CasSearchFormActions>
            }
          />
        </form>
      </CasCard>

      <CasCard
        title="조회 결과"
        className="flex min-h-[420px] flex-1 flex-col"
        bodyClassName="flex min-h-0 flex-1 flex-col"
        action={
          searched && !loading ? (
            <CasResultStats total={total} tCnt={tCnt} />
          ) : undefined
        }
      >
        {err ? (
          <div className="mb-4">
            <CasAlert tone="error">{err}</CasAlert>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-100">
          <table className="min-w-max w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${stickyThClass} w-12`}>#</th>
                {displayColumns.map((col) => (
                  <th
                    key={col.id}
                    className={stickyThClass}
                    style={col.width ? { minWidth: col.width } : undefined}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <CasTableEmpty
                colSpan={colSpan}
                loading={loading}
                searched={searched}
                hasItems={items.length > 0}
              />
              {!loading && items.length > 0
                ? items.map((row, idx) => (
                    <tr
                      key={`${row.impoSingoNo}-${row.impumLan}-${row.impumHeang}-${idx}`}
                      className="transition-colors hover:bg-slate-50/80"
                    >
                      <td className={`${tdClass} text-center text-slate-500`}>
                        {idx + 1}
                      </td>
                      {displayColumns.map((col) => (
                        <td
                          key={col.id}
                          className={`${tdClass}${
                            col.align === "center"
                              ? " text-center"
                              : col.align === "right"
                                ? " text-right tabular-nums"
                                : ""
                          }${col.mono ? " font-mono text-[11px]" : ""}`}
                        >
                          {cellValue(row, col.key)}
                        </td>
                      ))}
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </CasCard>

      <CasFieldSettingsDialog
        open={fieldProfile.settingsOpen}
        api="ncomSearchQry"
        profile={fieldProfile.profile}
        auth={auth}
        onClose={() => fieldProfile.setSettingsOpen(false)}
        onSaved={fieldProfile.onProfileSaved}
      />

      <CustomerSearchDialog
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        onSelect={(row) => {
          setSelectedCustomer(row);
          setCustomerOpen(false);
        }}
      />
    </CasPageShell>
  );
}
