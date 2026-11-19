/**
 * 협정별 원산지증명서 기재부호.
 * FTA특례법 시행규칙 별지 서식 PDF를 scripts/_learn_fta_co_codes.py 로 학습·원문 대조한 결과만 사용한다.
 * 기재부호는 물품의 실제 원산지판정에 따라 정해지므로 HS만으로 확정하지 않는다.
 */
import data from "@/hanjoo/lib/data/fta-co-codes.json";

export type CoBasis = "WO" | "PE" | "PSR" | "GENERAL" | "SPECIAL" | "OTHER";
export type CoStatus = "verified" | "needs_review";

export type CoCode = {
  code: string;
  basis: CoBasis;
  meaning: string;
  page: number | null;
  status: CoStatus;
};

export type CoExtra = { field: string; content: string; page: number | null; status: CoStatus };

export type CoForm = {
  ftaCd: string;
  formNo: string;
  revision: string;
  title: string;
  method: "code" | "declaration" | "none";
  field: string;
  sourceFile: string;
  sourceUrl: string;
  legalBasis: string;
  status: CoStatus;
  codes: CoCode[];
  extras: CoExtra[];
  notes: string[];
};

const FORMS = new Map((data.forms as CoForm[]).map((form) => [form.ftaCd, form]));

export function coFormOf(ftaCd: string): CoForm | undefined {
  return FORMS.get(ftaCd.trim().toUpperCase());
}

/** 표 셀용 요약: 품목별기준(PSR) 충족 시 기재하는 부호. 확정 부호가 아니다. */
export function coSummary(form: CoForm | undefined): string {
  if (!form || form.method === "none") return "확인 필요";
  if (form.method === "declaration") return "부호 없음 (원산지신고 문안)";
  const psr = form.codes.filter((c) => c.basis === "PSR");
  if (!psr.length || psr.some((c) => c.status !== "verified" || !c.code)) return "확인 필요";
  return `${psr.map((c) => c.code).join(" · ")} (PSR 충족 시)`;
}
