const DEFAULT_DB_C = "C:" + "/SQLiteDB/smart_law_ai.db";

function hasSmartLawPostgresConfig(): boolean {
  const password = process.env.SMART_LAW_PG_PASSWORD;
  if (password != null && password !== "" && !password.includes("비밀번호")) {
    return true;
  }
  return Boolean(
    process.env.SMART_LAW_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim(),
  );
}

function defaultSqlitePath(): string {
  return DEFAULT_DB_C;
}

/**
 * 로컬 SQLite 경로.
 * Postgres 모드에서는 필수가 아니며, 첨부 루트·폴백용으로만 쓴다.
 */
export function smartLawSqliteDbPath(): string {
  return (
    process.env.SMART_LAW_SQLITE_DB_PATH?.trim() ||
    process.env.SMART_LAW_DB_PATH?.trim() ||
    process.env.TARIFF_DB_PATH?.trim() ||
    defaultSqlitePath()
  );
}

/** @deprecated 호환용 — SQLite 경로. Postgres면 getSmartLawDbLabel 사용. */
export function smartLawDbPath(): string {
  if (hasSmartLawPostgresConfig()) {
    return smartLawSqliteDbPath();
  }
  const p =
    process.env.SMART_LAW_DB_PATH?.trim() ||
    process.env.SMART_LAW_SQLITE_DB_PATH?.trim() ||
    process.env.TARIFF_DB_PATH?.trim();
  if (!p) {
    throw new Error(
      "SMART_LAW_PG_PASSWORD(또는 SMART_LAW_DATABASE_URL) 또는 SMART_LAW_DB_PATH 환경변수가 필요합니다. (.env)",
    );
  }
  return p;
}

export function tariffDbPath(): string {
  return smartLawDbPath();
}

export function defaultYear(): number {
  const n = Number(process.env.DEFAULT_TARIFF_YEAR ?? "2026");
  return Number.isFinite(n) ? n : 2026;
}

export function defaultCountry(): string {
  return (process.env.DEFAULT_COUNTRY_CODE ?? "KR").toUpperCase();
}
