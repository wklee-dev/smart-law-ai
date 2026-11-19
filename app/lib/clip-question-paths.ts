import path from "node:path";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

/**
 * 질의회신 DB — 개별 clip_question.db 폐지, smart_law_ai.db 통합.
 * CLIP_QUESTION_DB_PATH 가 있어도 smart_law_ai.db 가 아니면 무시.
 */
export function getClipQuestionDbPath(): string {
  const smart = path.resolve(getSmartLawSqliteDbPath().trim());
  const env = process.env.CLIP_QUESTION_DB_PATH?.trim();
  if (env) {
    const resolved = path.resolve(env.replaceAll("\\", path.sep));
    if (path.basename(resolved).toLowerCase() === "smart_law_ai.db") {
      return resolved;
    }
  }
  return smart;
}
