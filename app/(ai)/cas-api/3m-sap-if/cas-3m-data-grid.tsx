"use client";

import type { CSSProperties } from "react";
import {
  CasTableEmpty,
  stickyThClass,
  tdClass,
} from "@/app/(ai)/cas-ncom/cas-ncom-ui";

export type Cas3mGridColumn = {
  id: string;
  key: string;
  label: string;
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  align?: "left" | "center" | "right";
  wrap?: boolean;
};

const cas3mThClass = `${stickyThClass} px-2 py-2 whitespace-normal leading-tight break-keep text-center text-[11px]`;
const cas3mTdClass = `${tdClass} px-2 py-1.5 align-middle text-[12px]`;

function columnStyle(col: Cas3mGridColumn): CSSProperties | undefined {
  if (col.wrap) {
    return {
      minWidth: col.minWidth ?? col.width ?? "120px",
      maxWidth: col.maxWidth ?? "260px",
    };
  }

  const fixed = col.width ?? col.minWidth;
  if (!fixed) return undefined;
  return {
    width: fixed,
    minWidth: fixed,
    maxWidth: col.maxWidth ?? fixed,
  };
}

function alignClass(align?: Cas3mGridColumn["align"]): string {
  if (align === "center") return " text-center";
  if (align === "right") return " text-right tabular-nums";
  return "";
}

export function Cas3mDataGrid<T extends Record<string, string>>({
  columns,
  rows,
  loading,
  searched,
  getCellValue,
  rowKey,
}: {
  columns: Cas3mGridColumn[];
  rows: T[];
  loading: boolean;
  searched: boolean;
  getCellValue: (row: T, key: string) => string;
  rowKey: (row: T, index: number) => string;
}) {
  const colSpan = columns.length + 1;
  const indexColStyle: CSSProperties = {
    width: "40px",
    minWidth: "40px",
    maxWidth: "40px",
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-100">
      <table className="min-w-max border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={cas3mThClass} style={indexColStyle}>
              #
            </th>
            {columns.map((col) => (
              <th key={col.id} className={cas3mThClass} style={columnStyle(col)}>
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
            hasItems={rows.length > 0}
          />
          {!loading && rows.length > 0
            ? rows.map((row, idx) => (
                <tr
                  key={rowKey(row, idx)}
                  className="transition-colors hover:bg-slate-50/80"
                >
                  <td
                    className={`${cas3mTdClass} text-center text-slate-500 tabular-nums`}
                    style={indexColStyle}
                  >
                    {idx + 1}
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={`${cas3mTdClass}${alignClass(col.align)}${
                        col.wrap
                          ? " whitespace-normal break-words"
                          : " whitespace-nowrap"
                      }`}
                      style={columnStyle(col)}
                    >
                      {getCellValue(row, col.key)}
                    </td>
                  ))}
                </tr>
              ))
            : null}
        </tbody>
      </table>
    </div>
  );
}
