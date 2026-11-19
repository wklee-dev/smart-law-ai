import type { SmartLawDb } from "@/app/lib/smart-law-db";
import { scheduleCalendarYear } from "@/app/tariff/lib/tariff-schedule-period";

/** KR / WCO — HS 해설 목록·비관세율표 분기용 */
export function hsManualOrgClause(division: string): {
  sql: string;
  params: unknown[];
} {
  const d = (division ?? "WCO").trim().toUpperCase();
  if (d === "KR" || d === "한국") {
    return {
      sql: `(m.manl_orgn_tpcd_nm LIKE ? OR m.manl_orgn_tpcd = ?)`,
      params: ["%한국%", "KR"],
    };
  }
  return { sql: `m.manl_orgn_tpcd_nm = ?`, params: ["WCO"] };
}

/**
 * 관세율표 선택 연도 `tariffScheduleYear` 이하에서의 최대 `aply_year`.
 * 국가·기관 조건 없음.
 */
export async function maxAplyYearNotAfterTariffSchedule(
  db: SmartLawDb,
  tariffScheduleYear: number,
): Promise<number | null> {
  if (!Number.isFinite(tariffScheduleYear) || tariffScheduleYear <= 0)
    return null;
  const capYear = scheduleCalendarYear(tariffScheduleYear);
  const row = await db.get(
    `SELECT MAX(CAST(TRIM(hmm.aply_year) AS INTEGER)) AS mx
     FROM hs_manual_meta hmm
     WHERE TRIM(COALESCE(hmm.aply_year, '')) != ''
       AND CAST(TRIM(hmm.aply_year) AS INTEGER) <= ?`,
    [capYear],
  );
  const v = row?.mx != null ? Number(row.mx) : null;
  return v != null && Number.isFinite(v) && v > 0 ? v : null;
}

/** 부·류·호별 DB 저장 부호 차이 흡수 후보 */
export function signLookupCandidates(manlUtTpcd: string, raw: string): string[] {
  const t = raw.trim();
  const digits = t.replace(/\D/g, "");
  const out = new Set<string>();

  const pad2 = () => {
    if (!digits) return;
    out.add(digits.padStart(2, "0"));
    const stripped = digits.replace(/^0+/, "");
    out.add(stripped ? stripped.padStart(2, "0") : "00");
    out.add(digits);
  };

  const pad4 = () => {
    if (!digits) return;
    out.add(digits.padStart(4, "0"));
    const stripped = digits.replace(/^0+/, "");
    if (stripped) out.add(stripped.padStart(4, "0"));
    if (digits.length >= 4) out.add(digits.slice(-4).padStart(4, "0"));
    out.add(digits);
  };

  out.add(t);
  if (manlUtTpcd === "01" || manlUtTpcd === "02") {
    pad2();
  }
  if (manlUtTpcd === "03") {
    pad4();
  }

  return [...out].filter(Boolean);
}
