import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  getSmartLawDbLabel,
  isSmartLawPostgres,
  openSmartLawDb,
  smartLawTableColumns,
  smartLawTableExists,
  type SmartLawDb,
  withSmartLawDb,
} from "@/app/lib/smart-law-db";

const DEFAULT_SCHEDULE_PATH = "C:" + "\\SQLiteDB\\smart_law_ai.db";

/** `getTariffScheduleDbPath` 1회성 해석 결과(프로브 포함) */
let resolvedScheduleDbPath: string | null = null;

let schedCachedPath: string | null = null;
let schedCached: DatabaseSync | null = null;

/**
 * 관세율표(부·류·호·세번) SQLite 경로.
 * Postgres 모드에서는 라벨용(실제 접속은 SMART_LAW_DATABASE_URL).
 */
export function getTariffScheduleDbPath(): string {
  if (isSmartLawPostgres()) {
    return getSmartLawDbLabel();
  }
  if (resolvedScheduleDbPath) return resolvedScheduleDbPath;

  const explicit = process.env.TARIFF_SCHEDULE_DB_PATH?.trim();
  if (explicit && explicit.length > 0) {
    resolvedScheduleDbPath = explicit;
    return resolvedScheduleDbPath;
  }

  const legacyTariffDb = process.env.TARIFF_DB_PATH?.trim();
  if (legacyTariffDb && legacyTariffDb.length > 0) {
    try {
      const probe = new DatabaseSync(legacyTariffDb, { readOnly: true });
      const hasSchedule = probe
        .prepare(
          `SELECT 1 FROM sqlite_master WHERE type='table' AND name='tariff_section' LIMIT 1`,
        )
        .get();
      probe.close();
      if (hasSchedule) {
        resolvedScheduleDbPath = legacyTariffDb;
        return resolvedScheduleDbPath;
      }
    } catch {
      /* 기본 경로로 이어짐 */
    }
  }

  resolvedScheduleDbPath = DEFAULT_SCHEDULE_PATH;
  return resolvedScheduleDbPath;
}

/** SQLite 전용 캐시 핸들 (크롤/인제스트). Postgres 모드에서는 사용하지 말 것. */
export function getTariffScheduleDb(): DatabaseSync {
  if (isSmartLawPostgres()) {
    throw new Error(
      "Postgres 모드입니다. openTariffScheduleSmartDb() / withTariffScheduleDb()를 사용하세요.",
    );
  }
  const p = getTariffScheduleDbPath();
  if (schedCached && schedCachedPath === p) return schedCached;
  schedCached = new DatabaseSync(p, { readOnly: true });
  schedCachedPath = p;
  return schedCached;
}

async function openSqliteScheduleDb(): Promise<SmartLawDb> {
  const p = path.resolve(/* turbopackIgnore: true */ getTariffScheduleDbPath());
  if (!fs.existsSync(p)) {
    throw new Error(`관세율표 SQLite DB 파일이 없습니다: ${p}`);
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

/** 조회용: Postgres면 SMART_LAW_DATABASE_URL, 아니면 관세율표 SQLite */
export async function openTariffScheduleSmartDb(): Promise<SmartLawDb> {
  if (isSmartLawPostgres()) return openSmartLawDb(true);
  return openSqliteScheduleDb();
}

export async function withTariffScheduleDb<T>(
  fn: (db: SmartLawDb) => Promise<T>,
): Promise<T> {
  if (isSmartLawPostgres()) return withSmartLawDb(fn, true);
  const db = await openSqliteScheduleDb();
  try {
    return await fn(db);
  } finally {
    await db.close();
  }
}

/** `tariff_section` 에 `section_name_en` 이 없는 DB 대응 */
let sectionNameEnExprCache: {
  key: string;
  hasCol: boolean;
} | null = null;

function tariffSectionHasNameEnColumnSync(): boolean {
  const key = getTariffScheduleDbPath();
  if (sectionNameEnExprCache?.key === key) {
    return sectionNameEnExprCache.hasCol;
  }
  const db = getTariffScheduleDb();
  const cols = (
    db.prepare(`PRAGMA table_info(tariff_section)`).all() as { name: string }[]
  ).map((r) => r.name);
  const hasCol = cols.includes("section_name_en");
  sectionNameEnExprCache = { key, hasCol };
  return hasCol;
}

export async function tariffSectionHasNameEnColumn(
  db: SmartLawDb,
): Promise<boolean> {
  const key = `${db.dialect}:${getTariffScheduleDbPath()}`;
  if (sectionNameEnExprCache?.key === key) {
    return sectionNameEnExprCache.hasCol;
  }
  const cols = await smartLawTableColumns(db, "tariff_section");
  const hasCol = cols.has("section_name_en");
  sectionNameEnExprCache = { key, hasCol };
  return hasCol;
}

/** SELECT 절용(동기·SQLite). Postgres 라우트는 sectionNameEnSelectAsync 사용 */
export function sectionNameEnSelect(tableAlias: string): string {
  const a = tableAlias.trim() || "ts";
  return tariffSectionHasNameEnColumnSync()
    ? `IFNULL(${a}.section_name_en,'')`
    : `''`;
}

export async function sectionNameEnSelectAsync(
  db: SmartLawDb,
  tableAlias: string,
): Promise<string> {
  const a = tableAlias.trim() || "ts";
  return (await tariffSectionHasNameEnColumn(db))
    ? `IFNULL(${a}.section_name_en,'')`
    : `''`;
}

export async function tariffScheduleTableExists(
  db: SmartLawDb,
  name: string,
): Promise<boolean> {
  return smartLawTableExists(db, name);
}

export function resetTariffScheduleDbCacheForTests(): void {
  resolvedScheduleDbPath = null;
  schedCached = null;
  schedCachedPath = null;
  sectionNameEnExprCache = null;
}
