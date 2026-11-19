"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CustomerSearchDialog,
  type SelectedCustomer,
} from "@/app/(ai)/cas-ncom/import-performance/customer-search-dialog";
import { fetchCasNcomSearch } from "@/app/(ai)/cas-ncom/cas-ncom-search-client";
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
} from "@/app/(ai)/cas-ncom/cas-page-top-bar";
import { useCasGatewayMode, type CasGatewayMode } from "@/app/(ai)/cas-ncom/cas-gateway-mode";
import { useCasNcomAuth } from "@/app/(ai)/cas-ncom/use-cas-ncom-auth";
import {
  ledgerCellValue,
  REFUND_LEDGER_DETAIL_COLUMNS,
  REFUND_LEDGER_MASTER_COLUMNS,
  type RefundLedgerMasterRow,
} from "@/app/lib/cas-ncom-refund-import-ledger-columns";

type SearchKind =
  | "srlNo"
  | "impSingoNo"
  | "acceptDate"
  | "lcNo"
  | "hsCd";

function refundDealCd(c: SelectedCustomer | null): string {
  if (!c) return "";
  return (c.drawCustCd ?? "").trim() || c.customerCode.trim();
}

function formatCustomerLabel(c: SelectedCustomer | null): string {
  if (!c) return "";
  const code = refundDealCd(c);
  return [code, c.customerName].filter(Boolean).join(" / ");
}

export function RefundImportLedgerView() {
  const auth = useCasNcomAuth();
  const gateway = useCasGatewayMode();
  const [customerOpen, setCustomerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] =
    useState<SelectedCustomer | null>(null);
  const [searchKind, setSearchKind] = useState<SearchKind>("impSingoNo");
  const [keyword, setKeyword] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [masters, setMasters] = useState<RefundLedgerMasterRow[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [tCnt, setTCnt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const details = useMemo(() => {
    if (selectedIndex == null) return [];
    return masters[selectedIndex]?.details ?? [];
  }, [masters, selectedIndex]);

  const resetSearch = useCallback(() => {
    setSelectedCustomer(null);
    setSearchKind("impSingoNo");
    setKeyword("");
    setDateFrom("");
    setDateTo("");
    setMasters([]);
    setSelectedIndex(null);
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

  const loadList = useCallback(async () => {
    if (!auth.session) {
      setErr("CAS 로그인 후 조회하세요.");
      return;
    }
    const dealCd = refundDealCd(selectedCustomer);
    if (!selectedCustomer || !dealCd) {
      setErr(
        selectedCustomer && !dealCd
          ? "환급거래처코드(DRAW_CUST_CD)가 없습니다. 거래처를 다시 선택하세요."
          : "거래처를 선택하세요.",
      );
      return;
    }
    if (searchKind === "acceptDate") {
      const hasFrom = Boolean(dateFrom.trim());
      const hasTo = Boolean(dateTo.trim());
      if (hasFrom !== hasTo) {
        setErr("수입수리일은 시작일·종료일을 함께 입력하세요.");
        return;
      }
    }
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("cust_cd", dealCd);

      if (searchKind === "acceptDate") {
        if (dateFrom) params.set("from", dateFrom);
        if (dateTo) params.set("to", dateTo);
      } else if (keyword.trim()) {
        const map: Record<Exclude<SearchKind, "acceptDate">, string> = {
          srlNo: "srl_no",
          impSingoNo: "imp_singo_no",
          lcNo: "lc_no",
          hsCd: "hs_cd",
        };
        params.set(map[searchKind], keyword.trim());
      }

      const result = await fetchCasNcomSearch<RefundLedgerMasterRow>(
        "/api/cas-ncom/refund-import-ledger/search",
        params,
        auth.ensureSession,
        auth.handleAuthFailure,
      );

      setMasters(result.items);
      setTotal(result.total);
      setTCnt(result.tCnt);
      setSelectedIndex(result.items.length > 0 ? 0 : null);
      setSearched(true);
    } catch (e) {
      setMasters([]);
      setSelectedIndex(null);
      setTotal(0);
      setTCnt(0);
      setErr(e instanceof Error ? e.message : "조회 실패");
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, [
    auth,
    dateFrom,
    dateTo,
    keyword,
    searchKind,
    selectedCustomer,
  ]);

  const masterColSpan = REFUND_LEDGER_MASTER_COLUMNS.length;
  const detailColSpan = REFUND_LEDGER_DETAIL_COLUMNS.length;

  return (
    <CasPageShell>
      <CasPageHeader
        title="환급-수입원장"
        action={
          <CasPageTopBar
            auth={auth}
            gatewayMode={gateway.mode}
            onGatewayChange={handleGatewayChange}
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
          <CasSearchFieldsRow>
            <CasInlineField label="거래처코드" className="min-w-[min(100%,20rem)] flex-1">
              <div className="relative w-full max-w-md">
                <CasCompactInput
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
            <CasInlineField label="조회 구분">
              <select
                className="h-8 min-w-[10rem] rounded border border-[#d8dee6] bg-white px-2 text-[13px] text-[#333]"
                value={searchKind}
                onChange={(e) => setSearchKind(e.target.value as SearchKind)}
              >
                <option value="srlNo">원장번호</option>
                <option value="impSingoNo">수입신고번호</option>
                <option value="acceptDate">수입수리일</option>
                <option value="lcNo">근거서류번호</option>
                <option value="hsCd">HS</option>
              </select>
            </CasInlineField>
            {searchKind === "acceptDate" ? (
              <>
                <CasInlineField label="수리 From">
                  <CasCompactInput
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </CasInlineField>
                <CasInlineField label="수리 To">
                  <CasCompactInput
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </CasInlineField>
              </>
            ) : (
              <CasInlineField label="검색값" className="min-w-[12rem] flex-1">
                <CasCompactInput
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="선택 조건값 입력 (미입력 시 거래처 전체)"
                />
              </CasInlineField>
            )}
            <CasSearchFormActions>
              <CasSearchButton
                type="submit"
                disabled={loading || !auth.session}
              >
                {loading ? "조회 중…" : "조회"}
              </CasSearchButton>
              <CasResetButton type="button" disabled={loading} onClick={resetSearch} />
            </CasSearchFormActions>
          </CasSearchFieldsRow>
        </form>
      </CasCard>

      {err ? <CasAlert tone="error">{err}</CasAlert> : null}
      <CasResultStats total={total} tCnt={tCnt} />

      <CasCard title="수입원장 목록">
        <div className="max-h-[min(42vh,22rem)] overflow-auto">
          <table className="min-w-max w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {REFUND_LEDGER_MASTER_COLUMNS.map((col) => (
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
              {masters.length === 0 ? (
                <CasTableEmpty
                  colSpan={masterColSpan}
                  loading={loading}
                  searched={searched}
                  hasItems={false}
                />
              ) : (
                masters.map((row, idx) => {
                  const sel = idx === selectedIndex;
                  return (
                    <tr
                      key={`${row.srlNo ?? idx}-${row.impSingoNo ?? idx}`}
                      className={`cursor-pointer ${sel ? "bg-sky-50" : "hover:bg-[#f4f8fc]"}`}
                      onClick={() => setSelectedIndex(idx)}
                    >
                      {REFUND_LEDGER_MASTER_COLUMNS.map((col) => (
                        <td
                          key={col.id}
                          className={`${tdClass}${col.align === "center" ? " text-center" : col.align === "right" ? " text-right tabular-nums" : ""}`}
                        >
                          {ledgerCellValue(row, col.key)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CasCard>

      <CasCard title="수입자재 (원장2)">
        <div className="max-h-[min(32vh,18rem)] overflow-auto">
          <table className="min-w-max w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {REFUND_LEDGER_DETAIL_COLUMNS.map((col) => (
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
              {details.length === 0 ? (
                <CasTableEmpty
                  colSpan={detailColSpan}
                  loading={false}
                  searched={selectedIndex != null}
                  hasItems={false}
                />
              ) : (
                details.map((row, idx) => (
                  <tr key={`${row.rowNo ?? idx}-${idx}`} className="hover:bg-[#f4f8fc]">
                    {REFUND_LEDGER_DETAIL_COLUMNS.map((col) => (
                      <td
                        key={col.id}
                        className={`${tdClass}${col.align === "center" ? " text-center" : col.align === "right" ? " text-right tabular-nums" : ""}`}
                      >
                        {ledgerCellValue(row, col.key)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CasCard>

      <CustomerSearchDialog
        open={customerOpen}
        onClose={() => setCustomerOpen(false)}
        onSelect={(c) => {
          setSelectedCustomer(c);
          setCustomerOpen(false);
        }}
      />
    </CasPageShell>
  );
}
