import fs from "node:fs";
import path from "node:path";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

const DEFAULT_RAW = "C:/SQLiteDB/smart_raw_ai.db";

/** 행정규칙 크롤링 카탈로그 DB (`law_source_catalog`) */
export function getSmartRawAiDbPath(): string {
  const fromEnv = process.env.SMART_RAW_AI_DB_PATH?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  const raw = path.resolve(DEFAULT_RAW);
  if (fs.existsSync(raw)) return raw;

  return path.resolve(getSmartLawSqliteDbPath());
}
