/** 3M HS·원산지판정기준 그리드 — legacy AX5Grid grid02.setConfig 기준 */

export type HsOriginColumn = {
  id: string;
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
  hidden?: boolean;
};

export type HsOriginRow = Record<string, string>;

export const HS_ORIGIN_SEARCH_MODES = [
  { value: "", label: "전체" },
  { value: "HS", label: "HSCODE" },
] as const;

export type HsOriginSearchMode =
  (typeof HS_ORIGIN_SEARCH_MODES)[number]["value"];

export const HS_ORIGIN_COLUMNS: HsOriginColumn[] = [
  {
    id: "custCd",
    key: "custCd",
    label: "거래처코드",
    width: "80px",
    hidden: true,
  },
  { id: "ftaAgr", key: "ftaAgr", label: "협정", width: "120px" },
  {
    id: "hs",
    key: "hs",
    label: "HS 6단위",
    width: "96px",
    align: "center",
  },
  { id: "stdVal", key: "stdVal", label: "기준값", width: "140px" },
  {
    id: "coDeciStd",
    key: "coDeciStd",
    label: "원산지 결정기준",
    width: "140px",
  },
  {
    id: "yr",
    key: "yr",
    label: "포괄년도",
    width: "80px",
    align: "center",
  },
  {
    id: "rowGubun",
    key: "rowGubun",
    label: "ROWGUBUN",
    width: "80px",
    align: "center",
    hidden: true,
  },
];

export const HS_ORIGIN_DISPLAY_COLUMNS = HS_ORIGIN_COLUMNS.filter(
  (c) => !c.hidden,
);

export function cellValue(row: HsOriginRow, key: string): string {
  const v = row[key];
  return v == null || v === "" ? "" : v;
}
