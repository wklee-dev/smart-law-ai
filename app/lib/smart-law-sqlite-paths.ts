const DEFAULT_DB_C = "C:" + "/SQLiteDB/smart_law_ai.db";

/** 일반법령 조회(SQLite) — `laws`, `law_versions`, `law_articles` 등 */
export function getSmartLawSqliteDbPath(): string {
  const explicit =
    process.env.SMART_LAW_SQLITE_DB_PATH?.trim() ||
    process.env.SMART_LAW_DB_PATH?.trim();
  if (explicit) return explicit;
  return DEFAULT_DB_C;
}
