/** 수출실적 그리드 — 수출실적조회템플릿.xlsx 1행(한글 헤더) 기준 */

import gridConfig from "@/app/lib/cas-ncom-export-performance-grid.json";

export type ExportPerformanceColumn = {
  /** React key — 템플릿 컬럼마다 고유 (API key 중복 허용) */
  id: string;
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
  mono?: boolean;
};

type GridColumn = {
  id?: string;
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  mono?: boolean;
};

function defaultWidth(key: string, label: string): string | undefined {
  if (key.endsWith("Date") || key.endsWith("Dt") || key.endsWith("Day")) return "92px";
  if (key === "expoSingoNo") return "148px";
  if (key === "exlanHs") return "96px";
  if (key.endsWith("Amt") || key.endsWith("Tax") || key.endsWith("Won")) return "96px";
  if (label.length >= 8) return "120px";
  if (label.length >= 5) return "88px";
  return "72px";
}

/** 템플릿 엑셀 컬럼 순서·한글명 그대로 사용 */
export const EXPORT_PERFORMANCE_COLUMNS: ExportPerformanceColumn[] = (
  gridConfig.columns as GridColumn[]
).map((col, index) => ({
  id: col.id ?? `col-${index}`,
  key: col.key,
  label: col.label,
  width: defaultWidth(col.key, col.label),
  align: col.align,
  mono: col.mono,
}));

export type ExportPerformanceRow = Record<string, string>;

/** 그룹식별부호 = 수출신고번호(expoSingoNo) 앞 5자 */
function groupIdFromSingoNo(row: ExportPerformanceRow): string {
  const singo = (row.expoSingoNo ?? "").trim();
  return singo ? singo.slice(0, 5) : "";
}

export function cellValue(row: ExportPerformanceRow, key: string): string {
  if (key === "expoKey") {
    return groupIdFromSingoNo(row);
  }
  const v = row[key];
  return v == null || v === "" ? "" : v;
}
