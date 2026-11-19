/** 3M 수출증명서 그리드 — legacy AX5Grid setConfig 기준 */

export type ExpoCertiColumn = {
  id: string;
  key: string;
  label: string;
  width?: string;
  minWidth?: string;
  maxWidth?: string;
  align?: "left" | "center" | "right";
  numeric?: boolean;
  wrap?: boolean;
};

export type ExpoCertiRow = Record<string, string>;

export const EXPO_CERTI_SEARCH_MODES = [
  { value: "", label: "전체" },
  { value: "10", label: "수출신고번호" },
  { value: "20", label: "품목코드" },
  { value: "30", label: "Ship No" },
  { value: "40", label: "HSCODE" },
  { value: "50", label: "제조자상호" },
] as const;

export type ExpoCertiSearchMode =
  (typeof EXPO_CERTI_SEARCH_MODES)[number]["value"];

export const EXPO_CERTI_COLUMNS: ExpoCertiColumn[] = [
  { id: "issNo", key: "issNo", label: "발급번호", width: "88px" },
  {
    id: "mngDate",
    key: "mngDate",
    label: "관리대장 작성일자",
    width: "108px",
  },
  { id: "issDate", key: "issDate", label: "발급일자", width: "92px" },
  { id: "issMonth", key: "issMonth", label: "발급월", width: "72px" },
  {
    id: "expoSingoNo",
    key: "expoSingoNo",
    label: "수출신고번호",
    width: "148px",
  },
  { id: "expoOkDate", key: "expoOkDate", label: "수리일자", width: "96px" },
  {
    id: "expumJepumCode",
    key: "expumJepumCode",
    label: "품목번호",
    width: "108px",
  },
  {
    id: "expumPum",
    key: "expumPum",
    label: "품명,규격",
    minWidth: "160px",
    maxWidth: "240px",
    wrap: true,
  },
  {
    id: "expumSu",
    key: "expumSu",
    label: "수량",
    width: "72px",
    align: "right",
    numeric: true,
  },
  { id: "expumSuDanwi", key: "expumSuDanwi", label: "Unit", width: "56px" },
  {
    id: "expoGumaejaSangho",
    key: "expoGumaejaSangho",
    label: "수입자(구매자)",
    minWidth: "140px",
    maxWidth: "220px",
    wrap: true,
  },
  { id: "expoMokjukCode", key: "expoMokjukCode", label: "수입국", width: "72px" },
  { id: "expoGeyakNo1", key: "expoGeyakNo1", label: "ShipNo.", width: "88px" },
  { id: "exlanHs", key: "exlanHs", label: "HSCODE", width: "80px" },
  { id: "expumSungbunA", key: "expumSungbunA", label: "PO No.", width: "96px" },
  {
    id: "exlanJepumCode",
    key: "exlanJepumCode",
    label: "Invoice No.",
    width: "108px",
  },
  {
    id: "expoSingojaGije",
    key: "expoSingojaGije",
    label: "운송사",
    width: "88px",
  },
  { id: "expoUnsongType", key: "expoUnsongType", label: "BY", width: "56px" },
  {
    id: "expoWhajuSangho",
    key: "expoWhajuSangho",
    label: "생산자(공급자)",
    minWidth: "120px",
    maxWidth: "200px",
    wrap: true,
  },
  { id: "epoGumaejaCode", key: "epoGumaejaCode", label: "3국여부", width: "72px" },
  {
    id: "expoTotalWon",
    key: "expoTotalWon",
    label: "수출신고 건별 INVOICE 합계금액(원)",
    width: "220px",
    align: "right",
    numeric: true,
  },
  {
    id: "coResult",
    key: "coResult",
    label: "원산지판정결과 COO Ready Product list(Master file)",
    minWidth: "180px",
    maxWidth: "280px",
    wrap: true,
  },
  { id: "fta", key: "fta", label: "협정 명칭", width: "88px" },
  {
    id: "choiceCoCertiBase",
    key: "choiceCoCertiBase",
    label: "선택가능한원산지결정기준",
    minWidth: "140px",
    maxWidth: "200px",
    wrap: true,
  },
  {
    id: "applyCoCertiBase",
    key: "applyCoCertiBase",
    label: "적용된 원산지 결정기준",
    minWidth: "120px",
    maxWidth: "180px",
    wrap: true,
  },
  {
    id: "co",
    key: "co",
    label: "원산지 (수출 건별 실제판정결과)",
    minWidth: "120px",
    maxWidth: "180px",
    wrap: true,
  },
  { id: "loadDate", key: "loadDate", label: "선적일", width: "88px" },
  { id: "blReceptDate", key: "blReceptDate", label: "BL수령일", width: "96px" },
  { id: "progress", key: "progress", label: "진행상황", width: "80px" },
  {
    id: "rmk",
    key: "rmk",
    label: "정정/미발급/취하/추가사유",
    minWidth: "120px",
    maxWidth: "180px",
    wrap: true,
  },
  {
    id: "coDeliveryDate",
    key: "coDeliveryDate",
    label: "C/O 전달일",
    width: "96px",
  },
  {
    id: "proofNo",
    key: "proofNo",
    label: "증빙번호 (DB#/OEM #)",
    width: "120px",
  },
  {
    id: "unipassRegistNo",
    key: "unipassRegistNo",
    label: "Uni-pass 접수번호",
    width: "120px",
  },
  {
    id: "biiDate",
    key: "biiDate",
    label: "세금계산서마감일(수수료정산일)",
    minWidth: "140px",
    maxWidth: "200px",
    wrap: true,
  },
  {
    id: "exlanAgreeName",
    key: "exlanAgreeName",
    label: "수출신고실적상 발급협정명",
    minWidth: "140px",
    maxWidth: "200px",
    wrap: true,
  },
];

function formatNumber(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const n = Number(raw.replace(/,/g, ""));
  if (Number.isFinite(n)) return n.toLocaleString("ko-KR");
  return raw;
}

export function cellValue(row: ExpoCertiRow, key: string): string {
  const v = row[key];
  if (v == null || v === "") return "";
  if (key === "expumSu" || key === "expoTotalWon") return formatNumber(v);
  return v;
}
