/**
 * 행정규칙 본문 — 로컬 SQLite (기본 smart_law_ai.db · ADMIN_RULES_DB_PATH)
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AdminRulesDb } from "@/app/lib/admin-rules-pg";
import { getAdminRulesDbPath } from "@/app/lib/admin-rules-paths";

export type { AdminRulesDb };

export async function openAdminRulesSqliteDb(): Promise<AdminRulesDb> {
  const raw = getAdminRulesDbPath().trim();
  const p = path.resolve(raw);
  if (!fs.existsSync(p)) {
    throw new Error(`행정규칙 SQLite DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p);

  return {
    dialect: "sqlite",
    async all(sql, params = []) {
      return (db.prepare(sql).all(...params) as Record<string, unknown>[]) ?? [];
    },
    async get(sql, params = []) {
      return db.prepare(sql).get(...params) as
        | Record<string, unknown>
        | undefined;
    },
    async close() {
      db.close();
    },
  };
}

export function getAdminRulesSqliteDbLabel(): string {
  return getAdminRulesDbPath();
}
