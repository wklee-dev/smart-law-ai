import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  getSmartLawDbLabel,
  isSmartLawPostgres,
  openSmartLawDb,
  type SmartLawDb,
  withSmartLawDb,
} from "@/app/lib/smart-law-db";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

let cachedPath: string | null = null;
let cached: DatabaseSync | null = null;

/**
 * HS해설서·속견표 연동용 DB 경로.
 * `smart_law_ai` 공통 경로만 사용 (HS_MANUAL_DB_PATH 제거).
 * Postgres 모드에서는 라벨용.
 */
export function getTariffDbPath(): string {
  if (isSmartLawPostgres()) return getSmartLawDbLabel();
  return path.resolve(getSmartLawSqliteDbPath().trim());
}

/** SQLite 전용 캐시 핸들. Postgres 모드에서는 사용하지 말 것. */
export function getTariffDb(): DatabaseSync {
  if (isSmartLawPostgres()) {
    throw new Error(
      "Postgres 모드입니다. withTariffDb() / openTariffSmartDb()를 사용하세요.",
    );
  }
  const p = getTariffDbPath();
  if (cached && cachedPath === p) return cached;
  cached = new DatabaseSync(p, { readOnly: true });
  cachedPath = p;
  return cached;
}

async function openSqliteTariffDb(): Promise<SmartLawDb> {
  const p = path.resolve(getSmartLawSqliteDbPath().trim());
  if (!fs.existsSync(p)) {
    throw new Error(`HS/관세 SQLite DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p, { readOnly: true });
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
    async exec(sql) {
      db.exec(sql);
    },
    async close() {
      db.close();
    },
  };
}

/** HS해설서 조회: Postgres면 SMART_LAW_DATABASE_URL, 아니면 smart_law_ai.db */
export async function openTariffSmartDb(): Promise<SmartLawDb> {
  if (isSmartLawPostgres()) return openSmartLawDb(true);
  return openSqliteTariffDb();
}

export async function withTariffDb<T>(
  fn: (db: SmartLawDb) => Promise<T>,
): Promise<T> {
  if (isSmartLawPostgres()) return withSmartLawDb(fn, true);
  const db = await openSqliteTariffDb();
  try {
    return await fn(db);
  } finally {
    await db.close();
  }
}

export function resetTariffDbCacheForTests(): void {
  cached = null;
  cachedPath = null;
}
