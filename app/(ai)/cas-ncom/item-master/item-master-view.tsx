"use client";

import { useCallback, useMemo, useState } from "react";
import { useCasGatewayMode, type CasGatewayMode } from "@/app/(ai)/cas-ncom/cas-gateway-mode";
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
  CasSecondaryButton,
  CasSubNavTabs,
  CasTableEmpty,
  stickyThClass,
  tdClass,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { CasPageTopBar } from "@/app/(ai)/cas-ncom/cas-page-top-bar";
import { useCasNcomAuth } from "@/app/(ai)/cas-ncom/use-cas-ncom-auth";
import {
  cellValue,
  ITEM_MASTER_DUTY_COLUMNS,
  ITEM_MASTER_LAW_COLUMNS,
  ITEM_MASTER_TP_COLUMNS,
  type CasGridColumn,
  type CasItemMasterChildRow,
  type CasItemMasterRow,
} from "@/app/lib/cas-ncom-item-master-columns";

function formatCustomerLabel(c: SelectedCustomer | null): string {
  if (!c) return "";
  return [c.customerCode, c.customerName].filter(Boolean).join(" / ");
}

type DetailTab = "law" | "tp" | "duty";

const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: "law", label: "수출입요령" },
  { key: "tp", label: "TP" },
  { key: "duty", label: "유의사항" },
];

type Props = {
  title: string;
  apiPath: string;
  columns: CasGridColumn[];
  /** 수입품목마스터: TP·수출입요령·유의사항 하단 표시 */
  showDetailTabs?: boolean;
};

function isCheckedValue(v: string | undefined): boolean {
  const s = (v ?? "").trim().toUpperCase();
  return s === "Y" || s === "1" || s === "TRUE" || s === "YES";
}

function ChildGridCell({
  column,
  value,
  fit,
}: {
  column: CasGridColumn;
  value: string;
  fit: boolean;
}) {
  if (column.asCheckbox) {
    return (
      <input
        type="checkbox"
        checked={isCheckedValue(value)}
        readOnly
        tabIndex={-1}
        className="h-3.5 w-3.5 accent-[#1e2f4f]"
        aria-label={column.label}
      />
    );
  }
  if (column.linkStyle && value) {
    return (
      <span className="cursor-pointer text-[#2563eb] hover:underline">
        {value}
      </span>
    );
  }
  return (
    <span
      className={
        fit && !column.width ? "break-words whitespace-normal" : undefined
      }
    >
      {value}
    </span>
  );
}

function ChildGrid({
  columns,
  rows,
  emptyMessage,
  /** 화면 폭에 맞춤 (TP·유의사항) */
  fit = false,
  /** 좌측 선택 체크박스 열 */
  showSelect = false,
}: {
  columns: CasGridColumn[];
  rows: CasItemMasterChildRow[];
  emptyMessage: string;
  fit?: boolean;
  showSelect?: boolean;
}) {
  const leadCols = showSelect ? 1 : 1;
  return (
    <div
      className={`min-h-0 max-h-[min(40vh,20rem)] overflow-auto ${
        fit ? "w-full max-w-full" : ""
      }`}
    >
      <table
        className={`w-full border-separate border-spacing-0 text-[12px] ${
          fit ? "table-fixed" : "min-w-max"
        }`}
      >
        <colgroup>
          <col style={{ width: showSelect ? "36px" : "40px" }} />
          {columns.map((c) => (
            <col
              key={c.id}
              style={c.width ? { width: c.width } : undefined}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className={`${stickyThClass} px-1 text-center`}>
              {showSelect ? (
                <span className="sr-only">선택</span>
              ) : (
                "#"
              )}
            </th>
            {columns.map((c) => (
              <th
                key={c.id}
                className={`${stickyThClass} px-2 text-${c.align ?? "left"}`}
                style={
                  fit
                    ? c.width
                      ? { width: c.width }
                      : undefined
                    : c.width
                      ? { minWidth: c.width }
                      : undefined
                }
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + leadCols}
                className={`${tdClass} py-6 text-center text-slate-500`}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-[#f4f8fc]">
                <td className={`${tdClass} px-1 text-center`}>
                  {showSelect ? (
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[#1e2f4f]"
                      aria-label={`행 ${idx + 1} 선택`}
                    />
                  ) : (
                    <span className="tabular-nums text-slate-500">
                      {idx + 1}
                    </span>
                  )}
                </td>
                {columns.map((c) => {
                  const value = row[c.key] ?? "";
                  return (
                    <td
                      key={c.id}
                      className={`${tdClass} px-2${
                        c.align === "center"
                          ? " text-center"
                          : c.align === "right"
                            ? " text-right tabular-nums"
                            : ""
                      }${c.highlight ? " bg-[#fffce8]" : ""}`}
                    >
                      <ChildGridCell column={c} value={value} fit={fit} />
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function ItemMasterView({
  title,
  apiPath,
  columns,
  showDetailTabs = false,
}: Props) {
  const auth = useCasNcomAuth();
  const gateway = useCasGatewayMode();
  const [customerOpen, setCustomerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] =
    useState<SelectedCustomer | null>(null);
  const [mstCd, setMstCd] = useState("");

  const [items, setItems] = useState<CasItemMasterRow[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("law");
  const [total, setTotal] = useState(0);
  const [tCnt, setTCnt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const selected = useMemo(
    () => (selectedIndex == null ? null : items[selectedIndex] ?? null),
    [items, selectedIndex],
  );

  const applyResult = useCallback((result: {
    items: CasItemMasterRow[];
    total: number;
    tCnt: number;
  }) => {
    setItems(result.items);
    setTotal(result.total);
    setTCnt(result.tCnt);
    setSelectedIndex(result.items.length > 0 ? 0 : null);
    setDetailTab("law");
    setSearched(true);
  }, []);

  const loadList = useCallback(async () => {
    if (!selectedCustomer?.customerCode) {
      setErr("거래처를 선택하세요.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      params.set("cust_cd", selectedCustomer.customerCode);
      if (mstCd.trim()) params.set("mst_cd", mstCd.trim());

      const result = await fetchCasNcomSearch<CasItemMasterRow>(
        apiPath,
        params,
        auth.ensureSession,
        auth.handleAuthFailure,
      );

      applyResult(result);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setTCnt(0);
      setSelectedIndex(null);
      setErr(e instanceof Error ? e.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, [apiPath, applyResult, auth, mstCd, selectedCustomer]);

  const loadSample = useCallback(async () => {
    if (!showDetailTabs) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${apiPath}?sample=1`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        items?: CasItemMasterRow[];
        total?: number;
        tCnt?: number;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "샘플 로드 실패");
      }
      setSelectedCustomer({
        customerCode: "0966",
        customsId: "한국무라1011017",
        customerName: "샘플(한국무라)",
      });
      setMstCd("MM3629-2703A16RA4");
      applyResult({
        items: data.items ?? [],
        total: data.total ?? 0,
        tCnt: data.tCnt ?? 0,
      });
    } catch (e) {
      setItems([]);
      setTotal(0);
      setTCnt(0);
      setSelectedIndex(null);
      setErr(e instanceof Error ? e.message : "샘플 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [apiPath, applyResult, showDetailTabs]);

  const reset = () => {
    setSelectedCustomer(null);
    setMstCd("");
    setItems([]);
    setSelectedIndex(null);
    setTotal(0);
    setTCnt(0);
    setErr(null);
    setSearched(false);
  };

  const handleGatewayChange = (next: CasGatewayMode) => {
    if (next === gateway.mode) return;
    gateway.setMode(next);
    auth.logout();
    reset();
  };

  const colSpan = columns.length;
  const lawRows = selected?.lawList ?? [];
  const tpRows = selected?.tpList ?? [];
  const dutyRows = selected?.dutyList ?? [];

  return (
    <CasPageShell>
      <CasPageHeader
        title={title}
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
          <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
            <CasInlineField label="거래처" stacked className="shrink-0">
              <div className="relative w-[240px]">
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
            <CasInlineField label="품목코드" stacked className="shrink-0">
              <CasCompactInput
                className="w-[220px]"
                value={mstCd}
                onChange={(e) => setMstCd(e.target.value)}
                placeholder="선택 — 미입력 시 전체"
              />
            </CasInlineField>
            <CasSearchFormActions>
              <CasSearchButton
                type="button"
                disabled={loading}
                onClick={() => void loadList()}
              >
                {loading ? "조회 중…" : "조회"}
              </CasSearchButton>
              {showDetailTabs ? (
                <CasSecondaryButton
                  type="button"
                  disabled={loading}
                  onClick={() => void loadSample()}
                >
                  샘플 표시
                </CasSecondaryButton>
              ) : null}
              <CasResetButton type="button" onClick={reset} />
            </CasSearchFormActions>
          </div>
        </form>
      </CasCard>

      {err ? <CasAlert tone="error">{err}</CasAlert> : null}

      <CasResultStats total={total} tCnt={tCnt} />

      <CasCard title="조회 결과">
        <div className="min-h-0 max-h-[min(50vh,28rem)] overflow-auto">
          <table className="min-w-max w-full border-separate border-spacing-0">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className={`${stickyThClass} text-${col.align ?? "left"}`}
                    style={col.width ? { minWidth: col.width } : undefined}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <CasTableEmpty
                  colSpan={colSpan}
                  loading={loading}
                  searched={searched}
                  hasItems={false}
                />
              ) : (
                items.map((row, idx) => {
                  const sel = selectedIndex === idx;
                  return (
                    <tr
                      key={`${cellValue(row, "mstCd") || idx}-${idx}`}
                      className={`cursor-pointer hover:bg-[#f4f8fc] ${
                        sel ? "bg-[#1e2f4f]/8" : ""
                      }`}
                      onClick={() => setSelectedIndex(idx)}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.id}
                          className={`${tdClass}${col.align === "center" ? " text-center" : col.align === "right" ? " text-right tabular-nums" : ""}${col.mono ? " font-mono text-[11px]" : ""}`}
                        >
                          {cellValue(row, col.key)}
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

      {showDetailTabs ? (
        <CasCard
          title={
            selected
              ? `세부정보 · ${cellValue(selected, "mstCd") || "품목"}`
              : "세부정보"
          }
        >
          <div className="flex flex-col gap-2">
            <CasSubNavTabs
              tabs={DETAIL_TABS}
              activeKey={detailTab}
              onChange={setDetailTab}
            />
            {detailTab === "law" ? (
              <ChildGrid
                showSelect
                columns={ITEM_MASTER_LAW_COLUMNS}
                rows={lawRows}
                emptyMessage={
                  selected
                    ? "해당 품목의 수출입요령 데이터가 없습니다."
                    : "목록에서 품목을 선택하세요."
                }
              />
            ) : null}
            {detailTab === "tp" ? (
              <ChildGrid
                fit
                showSelect
                columns={ITEM_MASTER_TP_COLUMNS}
                rows={tpRows}
                emptyMessage={
                  selected
                    ? "해당 품목의 TP 데이터가 없습니다."
                    : "목록에서 품목을 선택하세요."
                }
              />
            ) : null}
            {detailTab === "duty" ? (
              <ChildGrid
                fit
                columns={ITEM_MASTER_DUTY_COLUMNS}
                rows={dutyRows}
                emptyMessage={
                  selected
                    ? "해당 품목의 유의사항 데이터가 없습니다."
                    : "목록에서 품목을 선택하세요."
                }
              />
            ) : null}
          </div>
        </CasCard>
      ) : null}

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
