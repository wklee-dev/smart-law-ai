import path from "node:path";
import { getSmartLawAttachRoot } from "@/app/lib/smart-law-db";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

/** CLIP 행정규칙 통합 DB (`clip_ar_rule`, `clip_ar_history`) */
export function getClipAdminRuleDbPath(): string {
  const env = process.env.CLIP_ADMIN_RULE_DB_PATH?.trim();
  if (env) return path.resolve(env.replaceAll("\\", path.sep));
  return path.resolve(getSmartLawSqliteDbPath());
}

export function getClipAdminRuleAttachRoot(): string {
  const env = process.env.CLIP_ADMIN_RULE_ATTACH_ROOT?.trim();
  if (env) return path.resolve(env.replaceAll("\\", path.sep));
  return path.resolve(path.join(getSmartLawAttachRoot(), "ATTACH"));
}
