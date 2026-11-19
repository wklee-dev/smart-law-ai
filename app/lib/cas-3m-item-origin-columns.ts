/** 3M 품목·원산지판정기준 그리드 — legacy AX5Grid grid01.setConfig 기준 */

export type ItemOriginColumn = {
  id: string;
  key: string;
  label: string;
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  align?: "left" | "center" | "right";
  hidden?: boolean;
  wrap?: boolean;
};

export type ItemOriginRow = Record<string, string>;

export const ITEM_ORIGIN_SEARCH_MODES = [
  { value: "", label: "전체" },
  { value: "MST", label: "품목코드" },
  { value: "SAP", label: "SAP품목코드" },
  { value: "HS", label: "HSCODE" },
] as const;

export type ItemOriginSearchMode =
  (typeof ITEM_ORIGIN_SEARCH_MODES)[number]["value"];

export const ITEM_ORIGIN_COLUMNS: ItemOriginColumn[] = [
  {
    id: "custCd",
    key: "custCd",
    label: "거래처코드",
    width: "80px",
    hidden: true,
  },
  { id: "num", key: "num", label: "NO", width: "52px", align: "center" },
  {
    id: "reMakeDt",
    key: "reMakeDt",
    label: "(재)등록일",
    width: "92px",
    align: "center",
  },
  {
    id: "agreeNo",
    key: "agreeNo",
    label: "기존승인번호",
    width: "136px",
    align: "center",
  },
  { id: "maker", key: "maker", label: "업체", width: "80px" },
  {
    id: "mstCd",
    key: "mstCd",
    label: "LEGACY Stockno.",
    width: "124px",
    align: "center",
  },
  {
    id: "sapMstCd",
    key: "sapMstCd",
    label: "SAP Stockno.",
    width: "92px",
    align: "center",
  },
  {
    id: "mstNm",
    key: "mstNm",
    label: "Description",
    minWidth: "160px",
    maxWidth: "240px",
    wrap: true,
  },
  {
    id: "hs",
    key: "hs",
    label: "HS-CODE",
    width: "82px",
    align: "center",
  },
  {
    id: "krAsean",
    key: "krAsean",
    label: "KR-ASEAN",
    width: "84px",
    align: "center",
  },
  { id: "krEu", key: "krEu", label: "KR-EU", width: "74px", align: "center" },
  { id: "krUs", key: "krUs", label: "KR-US", width: "74px", align: "center" },
  { id: "apta", key: "apta", label: "APTA", width: "74px", align: "center" },
  { id: "cepa", key: "cepa", label: "CEPA", width: "74px", align: "center" },
  { id: "krSg", key: "krSg", label: "KR-SG", width: "74px", align: "center" },
  {
    id: "krEfta",
    key: "krEfta",
    label: "KR-EFTA",
    width: "84px",
    align: "center",
  },
  { id: "krCl", key: "krCl", label: "KR-CL", width: "74px", align: "center" },
  { id: "krPe", key: "krPe", label: "KR-PE", width: "74px", align: "center" },
  { id: "krTr", key: "krTr", label: "KR-TR", width: "74px", align: "center" },
  { id: "krAu", key: "krAu", label: "KR-AU", width: "74px", align: "center" },
  { id: "krCa", key: "krCa", label: "KR-CA", width: "74px", align: "center" },
  { id: "krVn", key: "krVn", label: "KR-VN", width: "74px", align: "center" },
  { id: "krNz", key: "krNz", label: "KR-NZ", width: "74px", align: "center" },
  { id: "krCn", key: "krCn", label: "KR-CN", width: "74px", align: "center" },
  { id: "krCo", key: "krCo", label: "KR-CO", width: "74px", align: "center" },
  {
    id: "krCentralAmerica",
    key: "krCentralAmerica",
    label: "KR Central America",
    width: "140px",
    align: "center",
  },
  { id: "krGb", key: "krGb", label: "KR-GB", width: "74px", align: "center" },
  { id: "rcep", key: "rcep", label: "RCEP", width: "74px", align: "center" },
  { id: "krIl", key: "krIl", label: "KR-IL", width: "74px", align: "center" },
  {
    id: "krIndonesia",
    key: "krIndonesia",
    label: "KR-INDONESIA",
    width: "108px",
    align: "center",
  },
  { id: "krKh", key: "krKh", label: "KR-KH", width: "78px", align: "center" },
  { id: "krPh", key: "krPh", label: "KR-PH", width: "78px", align: "center" },
  {
    id: "krUae",
    key: "krUae",
    label: "KR-UAE(CEPA)",
    width: "108px",
    align: "center",
  },
  {
    id: "bigo",
    key: "bigo",
    label: "MEMO",
    minWidth: "120px",
    maxWidth: "200px",
    wrap: true,
  },
  {
    id: "yr",
    key: "yr",
    label: "포괄년도",
    width: "72px",
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

export const ITEM_ORIGIN_DISPLAY_COLUMNS = ITEM_ORIGIN_COLUMNS.filter(
  (c) => !c.hidden,
);

export function cellValue(row: ItemOriginRow, key: string): string {
  const v = row[key];
  return v == null || v === "" ? "" : v;
}
