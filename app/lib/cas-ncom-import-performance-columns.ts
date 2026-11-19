/** 수입실적 그리드 — 수입실적조회템플릿.xlsx 1행(한글 헤더) 기준 */

import gridConfig from "@/app/lib/cas-ncom-import-performance-grid.json";

export type ImportPerformanceColumn = {
  /** React key — 템플릿 컬럼마다 고유 (API key 중복 허용) */
  id: string;
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
  mono?: boolean;
};

type GridColumn = {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  mono?: boolean;
};

function defaultWidth(key: string, label: string): string | undefined {
  if (key.endsWith("Date") || key.endsWith("Dt")) return "92px";
  if (key === "impoSingoNo") return "148px";
  if (key === "imlanHs") return "96px";
  if (key.endsWith("Amt") || key.endsWith("Tax") || key.endsWith("Won")) return "96px";
  if (label.length >= 8) return "120px";
  if (label.length >= 5) return "88px";
  return "72px";
}

/** 템플릿 엑셀 컬럼 순서·한글명 그대로 사용 */
export const IMPORT_PERFORMANCE_COLUMNS: ImportPerformanceColumn[] = (
  gridConfig.columns as GridColumn[]
).map((col, index) => ({
  id: `col-${index}`,
  key: col.key,
  label: col.label,
  width: defaultWidth(col.key, col.label),
  align: col.align,
  mono: col.mono,
}));

export type ImportPerformanceRow = Record<string, string>;

export function cellValue(row: ImportPerformanceRow, key: string): string {
  const v =
    key === "impoKey"
      ? (row.impoKey ?? row.impo_key)
      : row[key];
  return v == null || v === "" ? "" : v;
}
