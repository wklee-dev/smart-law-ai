/**
 * smart_law_ai 공통 DB 접속.
 * - SMART_LAW_DATABASE_URL(또는 DATABASE_URL)이 있으면 Postgres
 * - 없으면 로컬 SQLite (기존 동작)
 */
import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

const { Pool } = pg;

export type SmartLawDb = {
  dialect: "postgres" | "sqlite";
  all: (
    sql: string,
    params?: unknown[],
  ) => Promise<Record<string, unknown>[]>;
  get: (
    sql: string,
    params?: unknown[],
  ) => Promise<Record<string, unknown> | undefined>;
  exec: (sql: string) => Promise<void>;
  close: () => Promise<void>;
};

let pool: pg.Pool | null = null;

/** 분리 env(비밀번호 특수문자 안전) 우선 */
function getDiscretePgConfig(): pg.PoolConfig | null {
  const password = process.env.SMART_LAW_PG_PASSWORD;
  const host = process.env.SMART_LAW_PG_HOST?.trim();
  const database = process.env.SMART_LAW_PG_DATABASE?.trim();
  const user = process.env.SMART_LAW_PG_USER?.trim();
  // 비밀번호만 있어도 로컬 기본값으로 접속 (RPA-03)
  if (password == null && !host && !database && !user) return null;
  if (password == null || password === "" || password.includes("비밀번호")) {
    return null;
  }
  return {
    host: host || "127.0.0.1",
    port: Number(process.env.SMART_LAW_PG_PORT || 5432) || 5432,
    user: user || "postgres",
    password,
    database: database || "smart_law_ai",
  };
}

/** Postgres 사용 여부 */
export function isSmartLawPostgres(): boolean {
  return Boolean(getDiscretePgConfig() || getSmartLawDatabaseUrl());
}

export function getSmartLawDatabaseUrl(): string | null {
  const url =
    process.env.SMART_LAW_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    "";
  return url || null;
}

/**
 * postgresql://user:pass@host:port/db 를 PoolConfig 로 분해.
 * 비밀번호에 # @ / ? 등이 있어도 connectionString 파싱(Invalid URL)을 피함.
 */
function parsePgUrlToConfig(url: string): pg.PoolConfig | null {
  // userinfo 는 마지막 @ 직전까지 (비밀번호의 @ # / ? 허용)
  const m = url.match(
    /^postgres(?:ql)?:\/\/(.+)@([^@/:?]+)(?::(\d+))?\/([^?#@]+)/i,
  );
  if (!m) return null;
  const userInfo = m[1] ?? "";
  const colon = userInfo.indexOf(":");
  const userRaw = colon >= 0 ? userInfo.slice(0, colon) : userInfo;
  const passRaw = colon >= 0 ? userInfo.slice(colon + 1) : "";
  const safeDecode = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  try {
    return {
      user: safeDecode(userRaw),
      password: safeDecode(passRaw),
      host: m[2],
      port: Number(m[3] || 5432) || 5432,
      database: decodeURIComponent(m[4].replace(/^\//, "")),
    };
  } catch {
    return {
      user: userRaw,
      password: passRaw,
      host: m[2],
      port: Number(m[3] || 5432) || 5432,
      database: m[4].replace(/^\//, ""),
    };
  }
}

/**
 * 첨부파일 루트.
 * RPA-03: C:\SQLiteDB (SMART_LAW_ATTACH_ROOT 우선).
 */
export function getSmartLawAttachRoot(): string {
  const explicit = process.env.SMART_LAW_ATTACH_ROOT?.trim();
  if (explicit) return path.resolve(explicit);
  const cRoot = "C:" + "\\SQLiteDB";
  if (fs.existsSync(cRoot) || isSmartLawPostgres()) return cRoot;
  return path.resolve(path.dirname(getSmartLawSqliteDbPath()));
}

/** SQLite `?` → Postgres `$1`, `$2`, … */
export function sqlitePlaceholdersToPg(sql: string): string {
  let n = 0;
  return sql.replace(/\?/g, () => {
    n += 1;
    return `$${n}`;
  });
}

/**
 * 자주 쓰는 SQLite 방언을 Postgres용으로 보정.
 * (완전 변환기는 아님 — 대부분 조회 SQL에 충분)
 */
export function adaptSqlForDialect(
  sql: string,
  dialect: "postgres" | "sqlite",
): string {
  if (dialect === "sqlite") return sql;
  let s = sql;
  s = s.replace(/\bsqlite_master\b/gi, "information_schema.tables");
  s = s.replace(
    /type\s*=\s*'table'\s+AND\s+name\s*=\s*\?/gi,
    "table_schema = 'public' AND table_name = ?",
  );
  s = s.replace(
    /FROM\s+information_schema\.tables\s+WHERE\s+type\s*=\s*'table'\s+AND\s+name\s*=/gi,
    "FROM information_schema.tables WHERE table_schema = 'public' AND table_name =",
  );
  s = s.replace(/\bIFNULL\s*\(/gi, "COALESCE(");
  s = s.replace(/\bGLOB\b/gi, "LIKE");
  s = s.replace(/\s+COLLATE\s+NOCASE\b/gi, "");
  // SQLite ESCAPE '\\' → Postgres ESCAPE '\'
  s = s.replace(/ESCAPE\s+'\\\\'/gi, "ESCAPE '\\'");
  s = quotePgMixedCaseColumns(s);
  return s;
}

/** SQLite에서 옮겨온 Postgres 대소문자 혼용 컬럼 — 따옴표 없으면 소문자로 해석되어 "컬럼 없음" */
const PG_MIXED_CASE_COLUMNS = [
  "Gwanse_code",
  "Gwanse_semyung",
  "Gwanse_gubun",
  "Gwanse_agreecd",
  "enfrDt",
  "lworAdmnRulNo",
  "pmgtDtTpNo",
];
const PG_MIXED_CASE_RE = new RegExp(
  `(?<![\\w"])(${PG_MIXED_CASE_COLUMNS.join("|")})(?![\\w"])`,
  "gi",
);
const PG_MIXED_CASE_CANON = new Map(
  PG_MIXED_CASE_COLUMNS.map((c) => [c.toLowerCase(), c]),
);

export function quotePgMixedCaseColumns(sql: string): string {
  return sql.replace(
    PG_MIXED_CASE_RE,
    (m) => `"${PG_MIXED_CASE_CANON.get(m.toLowerCase()) ?? m}"`,
  );
}

/** 분리 env 우선, 없으면 URL 분해. 다른 모듈(행정규칙 등)도 이 설정 사용 */
export function getSmartLawPgConfig(): pg.PoolConfig | null {
  const discrete = getDiscretePgConfig();
  if (discrete) return discrete;
  const url = getSmartLawDatabaseUrl();
  if (!url) return null;
  const parsed = parsePgUrlToConfig(url);
  if (!parsed) return null;
  return {
    ...parsed,
    ssl: url.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
  };
}

function getPool(): pg.Pool {
  if (!pool) {
    const common = {
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    } as const;

    const discrete = getDiscretePgConfig();
    if (discrete) {
      pool = new Pool({ ...discrete, ...common });
      return pool;
    }

    const url = getSmartLawDatabaseUrl();
    if (!url) {
      throw new Error(
        "Postgres 설정 없음 — SMART_LAW_PG_PASSWORD 또는 SMART_LAW_DATABASE_URL 필요",
      );
    }
    if (url.includes("비밀번호")) {
      throw new Error(
        ".env.local 의 Postgres 비밀번호를 실제 값으로 바꾸세요 (SMART_LAW_PG_PASSWORD 권장)",
      );
    }

    const parsed = parsePgUrlToConfig(url);
    if (parsed) {
      pool = new Pool({
        ...parsed,
        ...common,
        ssl: url.includes("supabase.co")
          ? { rejectUnauthorized: false }
          : undefined,
      });
    } else {
      // 최후: connectionString (특수문자 비밀번호면 Invalid URL 가능)
      try {
        pool = new Pool({
          connectionString: url,
          ...common,
          ssl: url.includes("supabase.co")
            ? { rejectUnauthorized: false }
            : undefined,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(
          `Postgres URL 파싱 실패(${msg}). 비밀번호에 특수문자가 있으면 .env.local 에 SMART_LAW_PG_PASSWORD=... 로 분리하세요.`,
        );
      }
    }
  }
  return pool;
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
      out[k] = Buffer.from(v as ArrayBuffer);
    }
  }
  return out;
}

async function openPostgresDb(): Promise<SmartLawDb> {
  const p = getPool();
  const client = await p.connect();
  return {
    dialect: "postgres",
    async all(sql, params = []) {
      const q = sqlitePlaceholdersToPg(adaptSqlForDialect(sql, "postgres"));
      const res = await client.query(q, params);
      return (res.rows as Record<string, unknown>[]).map(normalizeRow);
    },
    async get(sql, params = []) {
      const q = sqlitePlaceholdersToPg(adaptSqlForDialect(sql, "postgres"));
      const res = await client.query(q, params);
      const row = res.rows[0] as Record<string, unknown> | undefined;
      return row ? normalizeRow(row) : undefined;
    },
    async exec(sql) {
      const q = adaptSqlForDialect(sql, "postgres");
      await client.query(q);
    },
    async close() {
      client.release();
    },
  };
}

async function openSqliteDb(readOnly = true): Promise<SmartLawDb> {
  const p = path.resolve(getSmartLawSqliteDbPath().trim());
  if (!fs.existsSync(p)) {
    throw new Error(`법령 SQLite DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p, { readOnly });
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

/** Postgres 우선, 없으면 SQLite */
export async function openSmartLawDb(readOnly = true): Promise<SmartLawDb> {
  if (isSmartLawPostgres()) return openPostgresDb();
  return openSqliteDb(readOnly);
}

export async function withSmartLawDb<T>(
  fn: (db: SmartLawDb) => Promise<T>,
  readOnly = true,
): Promise<T> {
  const db = await openSmartLawDb(readOnly);
  try {
    return await fn(db);
  } finally {
    await db.close();
  }
}

export async function smartLawTableExists(
  db: SmartLawDb,
  name: string,
): Promise<boolean> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return false;
  if (db.dialect === "sqlite") {
    const row = await db.get(
      "SELECT 1 AS o FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
      [name],
    );
    return Boolean(row);
  }
  const row = await db.get(
    `SELECT 1 AS o FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ? LIMIT 1`,
    [name],
  );
  return Boolean(row);
}

/** 테이블 컬럼명 집합 (SQLite PRAGMA / PG information_schema) */
export async function smartLawTableColumns(
  db: SmartLawDb,
  name: string,
): Promise<Set<string>> {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) return new Set();
  if (db.dialect === "sqlite") {
    const rows = await db.all(`PRAGMA table_info(${name})`);
    return new Set(rows.map((r) => String(r.name ?? "")));
  }
  const rows = await db.all(
    `SELECT column_name AS name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ?`,
    [name],
  );
  return new Set(rows.map((r) => String(r.name ?? "")));
}

/**
 * SQLite rowid 방언을 dialect에 맞게 보정.
 * - COALESCE(id, rowid) → id (PG)
 * - ORDER BY … rowid → id
 */
export function adaptRowidSql(
  sql: string,
  dialect: "postgres" | "sqlite",
): string {
  if (dialect === "sqlite") return sql;
  let s = sql;
  s = s.replace(/COALESCE\s*\(\s*id\s*,\s*rowid\s*\)/gi, "id");
  s = s.replace(/COALESCE\s*\(\s*(\w+)\.id\s*,\s*\1\.rowid\s*\)/gi, "$1.id");
  s = s.replace(/\b(\w+)\.rowid\b/gi, "$1.id");
  s = s.replace(/\browid\b/gi, "id");
  return s;
}

export function getSmartLawDbLabel(): string {
  if (isSmartLawPostgres()) {
    const d = getDiscretePgConfig();
    if (d) {
      return `Postgres ${d.host}:${d.port}/${d.database}`;
    }
    const url = getSmartLawDatabaseUrl();
    const parsed = url ? parsePgUrlToConfig(url) : null;
    if (parsed) {
      return `Postgres ${parsed.host}:${parsed.port}/${parsed.database}`;
    }
    return "Postgres";
  }
  return getSmartLawSqliteDbPath();
}
