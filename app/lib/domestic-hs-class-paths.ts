import path from "node:path";

const DEFAULT_DB = "C:/SQLiteDB/smart_law_ai.db";
const DEFAULT_DB_SINCE_2006 = "C:/SQLiteDB/domestic_hs_class_2006_2026.db";

export function getDomesticHsClassDbPath(): string {
  const env = process.env.DOMESTIC_HS_CLASS_DB_PATH?.trim();
  const raw = env && env.length > 0 ? env : DEFAULT_DB;
  return path.resolve(raw);
}

/** 2006이후 체크 시 사용 (품목분류 국내사례) */
export function getDomesticHsClassDbPathSince2006(): string {
  const env = process.env.DOMESTIC_HS_CLASS_DB_PATH_SINCE_2006?.trim();
  const raw = env && env.length > 0 ? env : DEFAULT_DB_SINCE_2006;
  return path.resolve(raw);
}

export function resolveDomesticHsClassDbPath(opts?: {
  since2006?: boolean;
}): string {
  return opts?.since2006
    ? getDomesticHsClassDbPathSince2006()
    : getDomesticHsClassDbPath();
}
