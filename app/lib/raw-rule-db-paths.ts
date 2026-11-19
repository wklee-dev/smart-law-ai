const DEFAULT_DB = "C:/SQLiteDB/raw_rule.db";

/** 관세법령정보포털 크롤러 수집 DB (`raw`, `raw_addendum`, `raw_annex`) */
export function getRawRuleDbPath(): string {
  return (
    process.env.RAW_RULE_DB_PATH?.trim() ||
    process.env.RAW_RULE_SQLITE_DB_PATH?.trim() ||
    DEFAULT_DB
  );
}
