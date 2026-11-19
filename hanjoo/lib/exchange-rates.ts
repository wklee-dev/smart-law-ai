import { getCasDbPool, sql } from "@/hanjoo/lib/cas-db";

const CODES = ["USD", "EUR", "CNY", "JPY"] as const;

export type WeeklyRate = {
  code: (typeof CODES)[number];
  rate: string;
};

export type WeeklyExchange = {
  appliedOn: string;
  rates: WeeklyRate[];
};

function seoulToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts.replace(/-/g, "");
}

function formatRate(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 4 });
}

function formatDate(raw: string): string {
  if (raw.length !== 8) return raw;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

/** 오늘(서울) 이전에 적용된 주간환율 1건에서 4개 통화만 반환 */
export async function getWeeklyExchangeRates(): Promise<WeeklyExchange | null> {
  const pool = await getCasDbPool();
  const result = await pool
    .request()
    .input("today", sql.VarChar(8), seoulToday())
    .query(
      `SELECT TOP 1 I_exch_jukyong_date, USD, EUR, CNY, JPY
         FROM di_exch
        WHERE I_exch_jukyong_date <= @today
        ORDER BY I_exch_jukyong_date DESC`,
    );
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    appliedOn: formatDate(String(row.I_exch_jukyong_date ?? "")),
    rates: CODES.map((code) => ({ code, rate: formatRate(row[code]) })),
  };
}
