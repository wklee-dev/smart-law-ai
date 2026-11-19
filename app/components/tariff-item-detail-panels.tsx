"use client";

import type { ReactNode } from "react";
import {
  hasDomesticTaxContent,
  parseDomesticTaxFields,
  type DomesticTaxFieldKey,
  type TariffRateRow as DomesticSourceRow,
} from "@/app/tariff/lib/tariff-domestic-tax";
import {
  formatHsCodeDotted,
  formatTariffUnitWeightQty,
} from "@/app/tariff/lib/tariff-hs-display";

export const TARIFF_GRID_BORDER = "border border-[#dddddd]";
export const TARIFF_HEADER_BG = "bg-[#e8edf7]";
export const TARIFF_ROW_EVEN_BG = "bg-[#f9f9f9]";
/** 국내관세율상세 — 세율·요건사항 등 본문 블록 공통 너비 */
export const TARIFF_DETAIL_SECTION_CLASS =
  "w-full max-w-3xl overflow-hidden rounded border border-slate-300 bg-white shadow-sm";
const LABEL_BG = "bg-[#eef4f9]";
const HS_HIGHLIGHT = "bg-[#ffff00]";

export type TariffItemSummary = {
  hs_code: string;
  item_name: string;
  item_name_en: string;
  country_name: string;
  unit?: string;
  unit_weight?: string;
  unit_qty?: string;
  simplified_drawback?: string;
  exemption?: string;
  origin?: string;
};

export type TariffRateRow = {
  rate_code: string;
  rate_value: string;
  rate_name: string;
};

/** 원본 UNIPASS: A·C·R·U 우선, 이후 FTA 등 나머지 세율 */
const PRIORITY_RATE_CODES = ["A", "C", "R", "U"] as const;

export function sortTariffRates(rates: TariffRateRow[]): TariffRateRow[] {
  const rank = (code: string): number => {
    const u = code.trim().toUpperCase();
    const i = PRIORITY_RATE_CODES.indexOf(u as (typeof PRIORITY_RATE_CODES)[number]);
    return i >= 0 ? i : PRIORITY_RATE_CODES.length;
  };
  return [...rates].sort((a, b) => {
    const diff = rank(a.rate_code) - rank(b.rate_code);
    if (diff !== 0) return diff;
    return a.rate_code.localeCompare(b.rate_code, undefined, { numeric: true });
  });
}

function cell(text: string | undefined | null): string {
  return (text ?? "").trim();
}

/** 원본 UNIPASS 요약표 열 너비 (국가·품목번호·간이정액환급 / 해당년도·단위) */
const COL_PRIMARY_LABEL =
  "w-[8.5rem] min-w-[8.5rem] max-w-[8.5rem] whitespace-nowrap";
const COL_SUB_LABEL =
  "w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] whitespace-nowrap";
const COL_VALUE = "min-w-[7rem]";

function SummaryCell({
  children,
  className = "",
  colSpan,
}: {
  children: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`${TARIFF_GRID_BORDER} ${COL_VALUE} bg-white px-3 py-2 text-sm text-slate-900 ${className}`}
    >
      {children}
    </td>
  );
}

function SummaryLabel({
  children,
  rowSpan,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  rowSpan?: number;
  variant?: "primary" | "sub";
  className?: string;
}) {
  const width =
    variant === "sub" ? COL_SUB_LABEL : COL_PRIMARY_LABEL;
  return (
    <th
      rowSpan={rowSpan}
      scope="row"
      className={`${TARIFF_GRID_BORDER} ${LABEL_BG} ${width} px-3 py-2 text-center text-sm font-medium text-slate-700 ${className}`}
    >
      {children}
    </th>
  );
}

/** 원본 UNIPASS: 품목 요약 표 */
export function TariffItemSummaryPanel({
  item,
  countryCode,
  year,
  flagEmoji = "🇰🇷",
}: {
  item: TariffItemSummary;
  countryCode: string;
  year: number;
  flagEmoji?: string;
}) {
  const countryLabel = cell(item.country_name) || countryCode;

  return (
    <section className={TARIFF_DETAIL_SECTION_CLASS}>
      <div className="overflow-x-auto p-2">
      <table className="w-full table-fixed border-collapse border border-[#dddddd] text-sm">
        <colgroup>
          <col className={COL_PRIMARY_LABEL} />
          <col />
          <col className={COL_SUB_LABEL} />
          <col />
        </colgroup>
        <tbody>
          <tr>
            <SummaryLabel>국가</SummaryLabel>
            <SummaryCell>
              {flagEmoji} {countryLabel}
            </SummaryCell>
            <SummaryLabel variant="sub">해당년도</SummaryLabel>
            <SummaryCell>{year}년</SummaryCell>
          </tr>
          <tr>
            <SummaryLabel>품목번호</SummaryLabel>
            <SummaryCell className={`font-mono ${HS_HIGHLIGHT}`}>
              {formatHsCodeDotted(item.hs_code)}
            </SummaryCell>
            <SummaryLabel variant="sub">단위(중량/수량)</SummaryLabel>
            <SummaryCell>
              {cell(
                item.unit ??
                  formatTariffUnitWeightQty(item.unit_weight, item.unit_qty),
              )}
            </SummaryCell>
          </tr>
          <tr>
            <SummaryLabel rowSpan={2}>품명</SummaryLabel>
            <SummaryLabel variant="sub">국문</SummaryLabel>
            <SummaryCell colSpan={2}>{item.item_name}</SummaryCell>
          </tr>
          <tr>
            <SummaryLabel variant="sub">영문</SummaryLabel>
            <SummaryCell colSpan={2} className="text-slate-700">
              {cell(item.item_name_en)}
            </SummaryCell>
          </tr>
          <tr>
            <SummaryLabel>간이정액환급</SummaryLabel>
            <SummaryCell colSpan={3}>{cell(item.simplified_drawback)}</SummaryCell>
          </tr>
          <tr>
            <SummaryLabel>감면</SummaryLabel>
            <SummaryCell colSpan={3}>{cell(item.exemption)}</SummaryCell>
          </tr>
          <tr>
            <SummaryLabel>원산지</SummaryLabel>
            <SummaryCell colSpan={3}>
              {cell(item.origin) ? (
                cell(item.origin)
              ) : (
                <span
                  className="inline-block text-blue-600"
                  title="원산지"
                  aria-hidden
                >
                  
                </span>
              )}
            </SummaryCell>
          </tr>
        </tbody>
      </table>
      </div>
    </section>
  );
}

/** 원본 UNIPASS: 세율 표 (격자선·짝수행 배경) */
export function TariffRatesTable({
  rates,
  year,
}: {
  rates: TariffRateRow[];
  year: number;
}) {
  const sortedRates = sortTariffRates(rates);
  const th = `${TARIFF_GRID_BORDER} px-2 py-1.5 text-center text-xs font-medium text-slate-800`;
  const td = `${TARIFF_GRID_BORDER} px-2 py-1 text-sm text-slate-900`;

  return (
    <section className={TARIFF_DETAIL_SECTION_CLASS}>
      <div className={`${TARIFF_GRID_BORDER} border-x-0 border-t-0 ${TARIFF_HEADER_BG} px-3 py-2`}>
        <h2 className="text-sm font-semibold text-slate-800">세율</h2>
      </div>
      {sortedRates.length === 0 ? (
        <p className="px-3 py-4 text-sm text-slate-500">
          세율 상세 데이터가 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto p-2 pt-1">
          <table className="w-full table-fixed border-collapse border border-[#dddddd] text-sm">
            <colgroup>
              <col className="w-[4.5rem]" />
              <col className="w-[5rem]" />
              <col />
            </colgroup>
            <thead>
              <tr className={TARIFF_HEADER_BG}>
                <th className={th}>구분기호</th>
                <th className={th}>{year}년</th>
                <th className={`${th} text-left`}>관세구분</th>
              </tr>
            </thead>
            <tbody>
              {sortedRates.map((r, idx) => (
                <tr
                  key={`${r.rate_code}-${idx}`}
                  className={idx % 2 === 1 ? TARIFF_ROW_EVEN_BG : "bg-white"}
                >
                  <td className={`${td} text-center font-mono text-xs`}>
                    {r.rate_code}
                  </td>
                  <td className={`${td} text-center`}>{r.rate_value}</td>
                  <td className={`${td} text-left text-slate-700`}>
                    {r.rate_name}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const DOMESTIC_LABEL_BG = "bg-[#eef4f9]";

/** 원본 UNIPASS: 내국세 (구분·내국세율·세종부호·개소세기준·농특세·기준일자) */
export function TariffDomesticTaxSection({
  rows,
}: {
  rows: DomesticSourceRow[];
}) {
  const fields = parseDomesticTaxFields(rows);
  const hasContent = hasDomesticTaxContent(fields);
  const th = `${TARIFF_GRID_BORDER} ${DOMESTIC_LABEL_BG} px-3 py-2 text-center text-xs font-medium text-slate-700 whitespace-nowrap`;
  const td = `${TARIFF_GRID_BORDER} bg-white px-3 py-2 text-sm text-slate-900`;

  /** 2열 그리드: (라벨|값) × 3행 */
  const pairs: [DomesticTaxFieldKey, DomesticTaxFieldKey][] = [
    ["구분", "내국세율"],
    ["세종부호", "개소세과세기준가격"],
    ["농특세과세여부", "기준일자"],
  ];

  return (
    <section className={TARIFF_DETAIL_SECTION_CLASS}>
      <div className={`${TARIFF_GRID_BORDER} border-x-0 border-t-0 ${TARIFF_HEADER_BG} px-3 py-2`}>
        <h2 className="inline-flex items-center text-sm font-semibold text-slate-800">
          내국세
          <svg
            className="ml-1 h-3.5 w-3.5 shrink-0 text-blue-600"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
          >
            <path
              d="M10 2h4v4M14 2 8 8M6 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </h2>
      </div>
      {!hasContent ? (
        <div className="px-3 py-3 text-sm text-slate-900">
          부가세: 10%
        </div>
      ) : (
        <div className="overflow-x-auto p-2">
          <table className="w-full border-collapse border border-[#dddddd] text-sm">
            <tbody>
              {pairs.map(([left, right]) => (
                <tr key={left}>
                  <th scope="row" className={th}>
                    {left}
                  </th>
                  <td className={td}>{fields[left] || "—"}</td>
                  <th scope="row" className={th}>
                    {right}
                  </th>
                  <td className={td}>{fields[right] || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
