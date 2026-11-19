/**
 * 행정규칙 본문 — Supabase Postgres 직접 접속 (SQLite 미사용)
 */
import pg from "pg";
import { getSmartLawPgConfig } from "@/app/lib/smart-law-db";

const { Client } = pg;

export type AdminRulesDb = {
  /** 쿼리 방언 — information_schema vs sqlite_master */
  dialect?: "postgres" | "sqlite";
  all: (
    sql: string,
    params?: unknown[],
  ) => Promise<Record<string, unknown>[]>;
  get: (
    sql: string,
    params?: unknown[],
  ) => Promise<Record<string, unknown> | undefined>;
  close: () => Promise<void>;
};

function getAdminRulesDatabaseUrl(): string {
  const url =
    process.env.ADMIN_RULES_DATABASE_URL?.trim() ||
    process.env.SMART_LAW_DATABASE_URL?.trim() ||
    process.env.SUPABASE_DB_DIRECT_URL?.trim() ||
    process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "ADMIN_RULES_DATABASE_URL · SMART_LAW_DATABASE_URL · SUPABASE_DB_DIRECT_URL · DATABASE_URL 중 하나가 필요합니다.",
    );
  }
  return url;
}

/** SQLite `?` → Postgres `$1`, `$2`, … */
export function sqlitePlaceholdersToPg(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => {
    n += 1;
    return `$${n}`;
  });
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const [k, v] of Object.entries(out)) {
    if (
      v != null &&
      typeof v === "object" &&
      !Buffer.isBuffer(v) &&
      !(v instanceof Date) &&
      ArrayBuffer.isView(v)
    ) {
      out[k] = Buffer.from(v as Uint8Array);
    }
  }
  return out;
}

export async function openAdminRulesDb(): Promise<AdminRulesDb> {
  const explicit = process.env.ADMIN_RULES_DATABASE_URL?.trim();
  const shared = explicit ? null : getSmartLawPgConfig();
  const client = shared
    ? new Client(shared)
    : new Client({ connectionString: getAdminRulesDatabaseUrl() });
  await client.connect();

  return {
    dialect: "postgres",
    async all(sql, params = []) {
      const res = await client.query(sqlitePlaceholdersToPg(sql), params);
      return (res.rows as Record<string, unknown>[]).map(normalizeRow);
    },
    async get(sql, params = []) {
      const res = await client.query(sqlitePlaceholdersToPg(sql), params);
      const row = res.rows[0] as Record<string, unknown> | undefined;
      return row ? normalizeRow(row) : undefined;
    },
    async close() {
      await client.end();
    },
  };
}

export function getAdminRulesDbLabel(): string {
  return "Supabase (Postgres)";
}
