import type { CasGridColumn } from "@/app/lib/cas-ncom-item-master-columns";
import type { NcomFlatRow } from "@/app/lib/cas-ncom-ncom-xml";

function col(
  key: string,
  label: string,
  width?: string,
  align?: CasGridColumn["align"],
): CasGridColumn {
  return { id: key, key, label, width, align };
}

/** 가이드 5.1 — 원장1(마스터) */
export const REFUND_LEDGER_MASTER_COLUMNS: CasGridColumn[] = [
  col("yy", "년", "40px", "center"),
  col("srlNo", "원장번호", "80px", "center"),
  col("impSingoNo", "신고번호", "140px", "center"),
  col("impLan", "란", "48px", "center"),
  col("impOkDate", "수리일", "88px", "center"),
  col("lcNo", "근거서류번호", "120px"),
  col("hsCd", "HS", "96px", "center"),
  col("pum", "품명", "140px"),
  col("impQty", "물량", "88px", "right"),
  col("qtyUnit", "단위", "56px", "center"),
  col("stlAmt", "결제금액", "96px", "right"),
  col("gwanTax", "관세", "88px", "right"),
  col("rmnQty", "잔량물량", "88px", "right"),
  col("rmnGwanTax", "잔량관세", "88px", "right"),
  col("useDitc", "사용", "56px", "center"),
];

/** 가이드 5.2 — 원장2(자재 상세) */
export const REFUND_LEDGER_DETAIL_COLUMNS: CasGridColumn[] = [
  col("rowNo", "순번", "56px", "center"),
  col("jajeCd", "자재코드", "120px", "center"),
  col("gukyk", "규격", "100px"),
  col("qty", "물량", "88px", "right"),
  col("qtyUnit", "단위", "56px", "center"),
  col("stlAmt", "결제금액", "96px", "right"),
  col("gwanTax", "관세", "88px", "right"),
  col("rmnQty", "잔량물량", "88px", "right"),
  col("rmnGwanTax", "잔량관세", "88px", "right"),
  col("useDitc", "사용", "56px", "center"),
  col("pum", "품명", "120px"),
];

export type RefundLedgerMasterRow = NcomFlatRow & {
  details: NcomFlatRow[];
};

export function ledgerCellValue(row: NcomFlatRow, key: string): string {
  const v = row[key];
  return v == null || v === "" ? "" : v;
}
