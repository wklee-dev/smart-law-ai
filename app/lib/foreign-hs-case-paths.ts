import path from "node:path";

const DEFAULT_DB = "C:/SQLiteDB/smart_law_ai.db";

export function getForeignHsCaseDbPath(): string {
  const env = process.env.FOREIGN_HS_CASE_DB_PATH?.trim();
  const raw = env && env.length > 0 ? env : DEFAULT_DB;
  return path.resolve(raw);
}

/**
 * `case_images.local_path` 해석 기준 디렉터리.
 * 비우면 DB 파일 폴더(`…/SQLiteDB`)를 사용합니다.
 */
export function getForeignHsCaseAttachRoot(): string {
  const env = process.env.FOREIGN_HS_CASE_ATTACH_ROOT?.trim();
  if (env && env.length > 0) return path.resolve(env);
  return path.dirname(getForeignHsCaseDbPath());
}
