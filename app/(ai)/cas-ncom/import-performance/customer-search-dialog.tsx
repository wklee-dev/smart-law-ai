"use client";

import {
  CasSearchButton,
  casInputClass,
  casLabelClass,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";
import { useCallback, useEffect, useState } from "react";
import {
  casGatewayRequestHeaders,
  loadCasGatewayMode,
} from "@/app/(ai)/cas-ncom/cas-gateway-mode";

export type SelectedCustomer = {
  customerCode: string;
  customsId: string;
  customerName: string;
  drawCustCd?: string;
};

type CustomerRow = SelectedCustomer & {
  representative: string;
  address: string;
  phone: string;
  drawCustCd: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (row: SelectedCustomer) => void;
};

const dialogThClass =
  "border border-[#1e2f4f] bg-[#1e2f4f] px-2 py-2 text-center text-[12px] font-semibold leading-snug text-white whitespace-nowrap align-middle sticky top-0 z-10";

const dialogTdClass =
  "border border-[#e5e9ef] bg-white px-2 py-1.5 text-[12px] leading-normal text-[#333] align-top";

export function CustomerSearchDialog({ open, onClose, onSelect }: Props) {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<CustomerRow | null>(null);

  const loadList = useCallback(
    async (nextPage: number) => {
      const q = keyword.trim();
      if (q.length < 2) {
        setErr("거래처명은 최소 2자 이상 입력해 주세요.");
        setItems([]);
        setTotal(0);
        setSelected(null);
        return;
      }

      setLoading(true);
      setErr(null);
      try {
        const params = new URLSearchParams();
        params.set("field", "customer_name");
        params.set("q", q);
        params.set("page", String(nextPage));
        params.set("page_size", String(pageSize));
        const res = await fetch(`/api/cas-ncom/customers/search?${params}`, {
          cache: "no-store",
          headers: casGatewayRequestHeaders(loadCasGatewayMode()),
        });
        const data = (await res.json()) as {
          ok: boolean;
          items?: CustomerRow[];
          total?: number;
          page?: number;
          configured?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || "조회 실패");
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setPage(data.page ?? nextPage);
        setConfigured(data.configured !== false);
        setSearched(true);
        setSelected(null);
      } catch (e) {
        setItems([]);
        setTotal(0);
        setSelected(null);
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [keyword, pageSize],
  );

  useEffect(() => {
    if (!open) return;
    setKeyword("");
    setItems([]);
    setTotal(0);
    setPage(1);
    setErr(null);
    setSearched(false);
    setSelected(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSelect = useCallback(() => {
    if (!selected) return;
    onSelect({
      customerCode: selected.customerCode,
      customsId: selected.customsId,
      customerName: selected.customerName,
      drawCustCd: selected.drawCustCd || undefined,
    });
  }, [onSelect, selected]);

  if (!open) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const emptyMessage = !searched
    ? "검색어를 입력한 뒤 조회해 주세요."
    : "조회 결과가 없습니다.";

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[400] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16 pb-10"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-search-dialog-title"
        className="relative w-full max-w-5xl overflow-hidden rounded-xl border border-[#e5e9ef] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#e5e9ef] px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="customer-search-dialog-title"
                className="text-[16px] font-bold tracking-tight text-[#1e2f4f]"
              >
                CAS 거래처마스터 검색
              </h2>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                거래처명(cmpNm) 부분일치 · 최소 2자. Gateway SQL에
                통관고유부호(customs_tong)가 있으면 목록에 표시되고, 선택 시
                실적 조회에 사용합니다.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              onClick={onClose}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          {!configured ? (
            <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              Hanjoo Gateway API Key가 설정되지 않았습니다.{" "}
              <code className="rounded bg-white px-1">
                HANJOO_API_KEY_SHIPMENT_TRACKING
              </code>
              (또는{" "}
              <code className="rounded bg-white px-1">
                HANJOO_GATEWAY_API_KEY
              </code>
              )를 <code className="rounded bg-white px-1">.env.local</code>에
              설정하세요.
            </p>
          ) : null}
          {err ? (
            <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {err}
            </p>
          ) : null}

          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void loadList(1);
            }}
          >
            <label className="min-w-[240px] flex-1">
              <span className={casLabelClass}>거래처명</span>
              <input
                type="search"
                className={casInputClass}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: 한주"
                autoFocus
              />
            </label>
            <CasSearchButton type="submit" disabled={loading}>
              {loading ? "조회 중…" : "조회"}
            </CasSearchButton>
          </form>

          <div className="mt-4 max-h-[min(52vh,420px)] overflow-auto rounded-md border border-[#e5e9ef]">
            <table className="min-w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  <th className={`${dialogThClass} w-24`}>거래처코드</th>
                  <th className={`${dialogThClass} min-w-[140px]`}>상호</th>
                  <th className={`${dialogThClass} w-28`}>통관고유부호</th>
                  <th className={`${dialogThClass} w-24`}>대표자</th>
                  <th className={dialogThClass}>주소</th>
                  <th className={`${dialogThClass} w-28`}>전화</th>
                  <th className={`${dialogThClass} w-28`}>환급거래처코드</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className={`${dialogTdClass} py-12 text-center text-slate-500`}
                    >
                      조회 중…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className={`${dialogTdClass} py-12 text-center text-slate-500`}
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  items.map((row, idx) => {
                    const isSelected =
                      selected?.customerCode === row.customerCode &&
                      selected?.customsId === row.customsId &&
                      selected?.customerName === row.customerName;
                    return (
                      <tr
                        key={`${row.customerCode}-${row.customsId}-${idx}`}
                        className={
                          isSelected
                            ? "cursor-pointer bg-[#eef4ff]"
                            : "cursor-pointer hover:bg-[#f8fafc]"
                        }
                        onClick={() => setSelected(row)}
                        onDoubleClick={() => {
                          onSelect({
                            customerCode: row.customerCode,
                            customsId: row.customsId,
                            customerName: row.customerName,
                            drawCustCd: row.drawCustCd || undefined,
                          });
                        }}
                      >
                        <td className={dialogTdClass}>
                          {row.customerCode || "—"}
                        </td>
                        <td className={dialogTdClass}>
                          {row.customerName || "—"}
                        </td>
                        <td className={dialogTdClass}>
                          {row.customsId || "—"}
                        </td>
                        <td className={dialogTdClass}>
                          {row.representative || "—"}
                        </td>
                        <td className={dialogTdClass}>{row.address || "—"}</td>
                        <td className={dialogTdClass}>{row.phone || "—"}</td>
                        <td className={dialogTdClass}>
                          {row.drawCustCd || "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {total > pageSize ? (
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-[12px] disabled:opacity-40"
                disabled={page <= 1 || loading}
                onClick={() => void loadList(page - 1)}
              >
                이전
              </button>
              <span className="text-[12px] text-slate-600">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-3 py-1 text-[12px] disabled:opacity-40"
                disabled={page >= totalPages || loading || total === 0}
                onClick={() => void loadList(page + 1)}
              >
                다음
              </button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e9ef] px-5 py-3">
          <p className="text-[12px] text-slate-500">Enter 또는 조회로 검색</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-md border border-[#d8dee6] bg-white px-4 text-[12px] font-medium text-[#333] hover:bg-[#f8fafc]"
              onClick={onClose}
            >
              취소
            </button>
            <button
              type="button"
              className="inline-flex h-8 items-center justify-center rounded-md bg-[#1e2f4f] px-4 text-[12px] font-semibold text-white hover:bg-[#162438] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selected}
              onClick={handleSelect}
            >
              선택
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
