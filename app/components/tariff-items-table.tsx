"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import {
  type TariffItemRow,
  buildTariffDetailHref,
  displayTariffRateValue,
  flexibleRateText,
  parseFlexibleRatePairs,
  isTariffDetailLinkable,
  isTariffEmbedContext,
  sortTariffItemsByHsCode,
  splitHsCodeColumns,
  normalizeHsDigits,
} from "@/app/tariff/lib/tariff-hs-display";

type TariffItemsTableProps = {
  items: TariffItemRow[];
  loading?: boolean;
  error?: string | null;
  countryCode: string;
  year: number;
  sectionCode?: string;
  chapterCode?: string;
  headingCode?: string;
  countryLabel?: string;
  /** HS 검색 등으로 진입 시 해당 품목번호 행 강조 */
  highlightHsCode?: string;
};

const CELL_BORDER = "border border-[#dddddd]";
const HEADER_BG = "bg-[#e8edf7]";
const ROW_EVEN_BG = "bg-[#f9f9f9]";
const HS_COL4_BG = "bg-[#ffff00]";
const COUNTRY_FLAG: Record<string, string> = {
  KR: "🇰🇷",
};

const DETAIL_LINK_CLASS =
  "text-blue-800 hover:text-blue-600 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500";

function DetailNavLink({
  href,
  linkable,
  children,
  className = "",
}: {
  href: string | null;
  linkable: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!linkable || !href) return <>{children}</>;
  return (
    <Link href={href} className={`${DETAIL_LINK_CLASS} ${className}`.trim()}>
      {children}
    </Link>
  );
}

function ElasticRateContent({ row }: { row: TariffItemRow }) {
  const pairs = parseFlexibleRatePairs(row);
  if (!pairs.length) return null;

  return (
    <div className="inline-flex flex-col items-start gap-0.5 text-left">
      {pairs.map((p, i) => (
        <div key={`${p.code}-${p.rate}-${i}`} className="whitespace-nowrap leading-snug">
          {p.code ? (
            <span className="font-medium text-red-600">{p.code}</span>
          ) : null}
          {p.code && p.rate ? " " : null}
          {p.rate ? <span className="text-slate-900">{p.rate}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function TariffItemsTable({
  items,
  loading,
  error,
  countryCode,
  year,
  sectionCode,
  chapterCode,
  headingCode,
  countryLabel,
  highlightHsCode,
}: TariffItemsTableProps) {
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  const sortedItems = sortTariffItemsByHsCode(items);
  const highlightDigits = normalizeHsDigits(highlightHsCode ?? "");

  useEffect(() => {
    if (!highlightDigits || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [highlightDigits, sortedItems.length]);

  if (error) {
    return <p className="px-3 py-4 text-sm text-red-700">{error}</p>;
  }
  if (loading) {
    return (
      <p className="px-3 py-8 text-center text-sm text-slate-500">
        세부 목록 불러오는 중…
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-sm text-slate-500">
        이 호에 해당하는 세부 품목·세율 행이 없습니다.
      </p>
    );
  }

  const headerCountry = countryLabel?.trim() || countryCode;
  const thBase = `${CELL_BORDER} px-2 py-1.5 text-center text-xs font-medium text-slate-800`;
  const tdBase = `${CELL_BORDER} px-2 py-1 text-sm text-slate-900`;
  const headerFlag = COUNTRY_FLAG[countryCode.toUpperCase()] ?? "🌐";

  return (
    <div className="overflow-x-auto p-1">
      <table className="w-full min-w-[860px] border-collapse border border-[#dddddd] text-sm">
        <thead>
          <tr className={HEADER_BG}>
            <th rowSpan={2} colSpan={3} className={thBase}>
              품목번호
            </th>
            <th colSpan={2} className={thBase}>
              품명 [ {headerFlag} {headerCountry} {year}년 ]
            </th>
            <th rowSpan={2} className={thBase}>기본세율</th>
            <th rowSpan={2} className={thBase}>
              탄력·양허
              <br />
              세율
            </th>
          </tr>
          <tr className={HEADER_BG}>
            <th className={`${thBase} text-center font-normal`}>한글</th>
            <th className={`${thBase} text-center font-normal`}>영문</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((row, idx) => {
            const { col4, col2, colRest } = splitHsCodeColumns(row.hs_code);
            const basicRate = displayTariffRateValue(row.basic_rate ?? "");
            const rateText = flexibleRateText(row);
            const linkable = isTariffDetailLinkable(row);
            const detailHref = linkable
              ? buildTariffDetailHref({
                  hsCode: row.hs_code,
                  countryCode,
                  year,
                  sectionCode,
                  chapterCode,
                  headingCode,
                  embed: isTariffEmbedContext(),
                })
              : null;
            const isHighlight =
              !!highlightDigits &&
              normalizeHsDigits(row.hs_code) === highlightDigits;
            const rowBg = isHighlight
              ? "bg-amber-100 ring-2 ring-inset ring-amber-400"
              : idx % 2 === 1
                ? ROW_EVEN_BG
                : "bg-white";

            return (
              <tr
                key={`${row.hs_code}-${idx}`}
                ref={isHighlight ? highlightRef : undefined}
                className={rowBg}
                data-hs={normalizeHsDigits(row.hs_code)}
              >
                <td
                  className={`${tdBase} ${HS_COL4_BG} text-center font-mono text-xs tabular-nums`}
                >
                  {col4}
                </td>
                <td
                  className={`${tdBase} text-center font-mono text-xs tabular-nums`}
                >
                  {col2}
                </td>
                <td
                  className={`${tdBase} text-center font-mono text-xs tabular-nums`}
                >
                  {colRest}
                </td>
                <td className={`${tdBase} max-w-[16rem] text-left`}>
                  <DetailNavLink href={detailHref} linkable={linkable}>
                    {row.item_name}
                  </DetailNavLink>
                </td>
                <td className={`${tdBase} max-w-[16rem] text-left text-xs text-slate-700`}>
                  {row.item_name_en?.trim() ? (
                    <DetailNavLink href={detailHref} linkable={linkable}>
                      {row.item_name_en.trim()}
                    </DetailNavLink>
                  ) : null}
                </td>
                <td className={`${tdBase} text-center`}>
                  {basicRate ? (
                    <DetailNavLink href={detailHref} linkable={linkable}>
                      {basicRate}
                    </DetailNavLink>
                  ) : null}
                </td>
                <td className={`${tdBase} align-top`}>
                  {rateText ? (
                    <DetailNavLink
                      href={detailHref}
                      linkable={linkable}
                      className="inline-block no-underline hover:opacity-90"
                    >
                      <ElasticRateContent row={row} />
                    </DetailNavLink>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
