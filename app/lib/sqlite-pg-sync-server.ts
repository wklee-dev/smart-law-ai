import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { getSmartLawPgConfig, isSmartLawPostgres } from "@/app/lib/smart-law-db";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

/**
 * 주간 크롤 결과(SQLite) → Postgres 증분 반영.
 * - 신규 행: SQLite rowid > 마지막 동기화 rowid
 * - 수정 행: 갱신시각 컬럼(updated_at 등) >= 마지막 동기화일 - 1일
 * - INSERT ... ON CONFLICT (PK) DO UPDATE. SQLite에서 삭제된 행은 반영하지 않는다.
 * - 상태: Postgres `_sqlite_pg_sync_state`
 */

const STATE_TABLE = "_sqlite_pg_sync_state";
const TS_COLUMNS = [
  "updated_at",
  "modified_at",
  "last_seen_at",
  "last_crawled_at",
  "crawled_at",
  "collected_at",
  "downloaded_at",
  "fetched_at",
];
const MAX_PARAMS = 60_000;
const MAX_BATCH_ROWS = 500;

export type SqlitePgSyncTableResult = {
  table: string;
  mode: "baseline" | "full" | "incremental" | "skip";
  upserted: number;
  failed: number;
  note?: string;
};

export type SqlitePgSyncResult = {
  sqlitePath: string;
  startedAt: string;
  finishedAt: string;
  tables: SqlitePgSyncTableResult[];
  upserted: number;
  failed: number;
};

type SqliteCol = { name: string };
type StateRow = { last_rowid: string | number; last_synced_at: Date | null };

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** RPA-03은 C: 만 있음 — 과거 크롤 데이터의 D:\SQLiteDB 경로를 C:\SQLiteDB 로 */
const LEGACY_DRIVE = /\b[Dd]:(\\\\|\\|\/)SQLiteDB/g;

function toPgValue(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "string") {
    let s = v.includes("\u0000") ? v.replace(/\u0000/g, "") : v;
    if (s.includes("SQLiteDB")) s = s.replace(LEGACY_DRIVE, "C:$1SQLiteDB");
    return s;
  }
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Uint8Array) return Buffer.from(v);
  return v;
}

function sqliteTables(db: DatabaseSync): string[] {
  const rows = db
    .prepare(
      `SELECT name, sql FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all() as { name: string; sql: string | null }[];
  return rows
    .filter((r) => {
      const s = (r.sql ?? "").toUpperCase();
      return !s.includes("VIRTUAL TABLE") && !s.includes("WITHOUT ROWID");
    })
    .map((r) => r.name);
}

async function pgTableMeta(client: pg.Client, table: string) {
  const cols = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  if (!cols.rowCount) return null;
  const pk = await client.query<{ attname: string }>(
    `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary`,
    [`public.${q(table)}`],
  );
  return {
    columns: new Set(cols.rows.map((r) => r.column_name)),
    pk: pk.rows.map((r) => r.attname),
  };
}

async function upsertRows(
  client: pg.Client,
  table: string,
  cols: string[],
  pk: string[],
  rows: unknown[][],
  log: (s: string) => void,
): Promise<{ ok: number; failed: number }> {
  const updates = cols.filter((c) => !pk.includes(c));
  const conflict = updates.length
    ? `DO UPDATE SET ${updates.map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(", ")}`
    : "DO NOTHING";
  const build = (batch: unknown[][]) => {
    const params: unknown[] = [];
    const values = batch.map((r) => {
      const ph = r.map((v) => {
        params.push(toPgValue(v));
        return `$${params.length}`;
      });
      return `(${ph.join(", ")})`;
    });
    return {
      text: `INSERT INTO ${q(table)} (${cols.map(q).join(", ")}) VALUES ${values.join(", ")}
             ON CONFLICT (${pk.map(q).join(", ")}) ${conflict}`,
      params,
    };
  };

  try {
    const { text, params } = build(rows);
    await client.query(text, params);
    return { ok: rows.length, failed: 0 };
  } catch {
    let ok = 0;
    let failed = 0;
    for (const r of rows) {
      try {
        const { text, params } = build([r]);
        await client.query(text, params);
        ok++;
      } catch (e) {
        if (failed === 0) log(`  [${table}] 행 오류: ${e instanceof Error ? e.message : e}`);
        failed++;
      }
    }
    return { ok, failed };
  }
}

async function syncTable(
  db: DatabaseSync,
  client: pg.Client,
  table: string,
  runStartedAt: Date,
  log: (s: string) => void,
): Promise<SqlitePgSyncTableResult> {
  const meta = await pgTableMeta(client, table);
  if (!meta) return { table, mode: "skip", upserted: 0, failed: 0, note: "Postgres에 테이블 없음" };
  if (!meta.pk.length) return { table, mode: "skip", upserted: 0, failed: 0, note: "Postgres PK 없음" };

  const sqliteCols = (db.prepare(`PRAGMA table_info(${q(table)})`).all() as SqliteCol[]).map(
    (c) => c.name,
  );
  const useRowidCol = meta.columns.has("sqlite_rowid");
  const cols = sqliteCols.filter((c) => meta.columns.has(c));
  const selectCols = useRowidCol ? ["sqlite_rowid", ...cols] : cols;
  if (!meta.pk.every((k) => selectCols.includes(k))) {
    return { table, mode: "skip", upserted: 0, failed: 0, note: "PK 컬럼 불일치" };
  }

  const maxRowid = Number(
    (db.prepare(`SELECT COALESCE(MAX(rowid), 0) AS m FROM ${q(table)}`).get() as { m: number }).m,
  );
  const state = (
    await client.query<StateRow>(
      `SELECT last_rowid, last_synced_at FROM ${STATE_TABLE} WHERE tbl = $1`,
      [table],
    )
  ).rows[0];

  const saveState = () =>
    client.query(
      `INSERT INTO ${STATE_TABLE} (tbl, last_rowid, last_synced_at) VALUES ($1, $2, $3)
       ON CONFLICT (tbl) DO UPDATE SET last_rowid = EXCLUDED.last_rowid,
                                       last_synced_at = EXCLUDED.last_synced_at`,
      [table, maxRowid, runStartedAt],
    );

  let mode: SqlitePgSyncTableResult["mode"] = "incremental";
  let fromRowid = 0;
  let since: string | null = null;
  if (!state) {
    // 최초: 건수가 같으면 이미 이관된 것으로 보고 기준점만 기록
    const sCount = Number(
      (db.prepare(`SELECT COUNT(*) AS n FROM ${q(table)}`).get() as { n: number }).n,
    );
    const pCount = Number(
      (await client.query<{ n: string }>(`SELECT COUNT(*) AS n FROM ${q(table)}`)).rows[0].n,
    );
    if (sCount === pCount) {
      await saveState();
      return { table, mode: "baseline", upserted: 0, failed: 0 };
    }
    mode = "full";
  } else {
    fromRowid = Number(state.last_rowid);
    const ts = TS_COLUMNS.find((c) => cols.includes(c));
    if (ts && state.last_synced_at) {
      const d = new Date(state.last_synced_at.getTime() - 86_400_000);
      since = d.toISOString().slice(0, 10);
    }
    if (fromRowid >= maxRowid && !since) {
      await saveState();
      return { table, mode, upserted: 0, failed: 0 };
    }
  }

  const ts = TS_COLUMNS.find((c) => cols.includes(c));
  const where =
    mode === "full"
      ? "1=1"
      : since && ts
        ? `(rowid > ? OR ${q(ts)} >= ?)`
        : "rowid > ?";
  const baseParams: (string | number)[] =
    mode === "full" ? [] : since && ts ? [fromRowid, since] : [fromRowid];
  const selectList = [
    "rowid AS __rid",
    ...(useRowidCol ? ["rowid AS sqlite_rowid"] : []),
    ...cols.map(q),
  ].join(", ");
  const batchSize = Math.max(1, Math.min(MAX_BATCH_ROWS, Math.floor(MAX_PARAMS / selectCols.length)));
  const stmt = db.prepare(
    `SELECT ${selectList} FROM ${q(table)}
      WHERE ${where} AND rowid > ? ORDER BY rowid LIMIT ${batchSize}`,
  );

  let cursor = 0;
  let upserted = 0;
  let failed = 0;
  for (;;) {
    const rows = stmt.all(...baseParams, cursor) as Record<string, unknown>[];
    if (!rows.length) break;
    cursor = Number(rows[rows.length - 1].__rid);
    const values = rows.map((r) => selectCols.map((c) => r[c]));
    const res = await upsertRows(client, table, selectCols, meta.pk, values, log);
    upserted += res.ok;
    failed += res.failed;
    if (rows.length < batchSize) break;
  }
  await saveState();
  return { table, mode, upserted, failed };
}

export async function syncSqliteToPostgres(
  log: (s: string) => void = () => {},
): Promise<SqlitePgSyncResult> {
  const startedAt = new Date();
  const sqlitePath = getSmartLawSqliteDbPath();
  const cfg = getSmartLawPgConfig();
  if (!isSmartLawPostgres() || !cfg) throw new Error("Postgres 설정이 없어 동기화를 건너뜁니다.");

  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  const client = new pg.Client({ ...cfg, statement_timeout: 0 });
  await client.connect();
  const tables: SqlitePgSyncTableResult[] = [];
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${STATE_TABLE} (
         tbl text PRIMARY KEY, last_rowid bigint NOT NULL DEFAULT 0, last_synced_at timestamptz)`,
    );
    log(`SQLite: ${sqlitePath}`);
    for (const table of sqliteTables(db)) {
      try {
        const r = await syncTable(db, client, table, startedAt, log);
        tables.push(r);
        if (r.upserted || r.failed || r.mode === "full" || r.mode === "skip") {
          log(`[${table}] ${r.mode} upsert=${r.upserted} fail=${r.failed}${r.note ? ` (${r.note})` : ""}`);
        }
      } catch (e) {
        const note = e instanceof Error ? e.message : String(e);
        tables.push({ table, mode: "skip", upserted: 0, failed: 0, note });
        log(`[${table}] 오류: ${note}`);
      }
    }
  } finally {
    await client.end().catch(() => {});
    db.close();
  }
  const upserted = tables.reduce((s, t) => s + t.upserted, 0);
  const failed = tables.reduce((s, t) => s + t.failed, 0);
  log(`완료: upsert=${upserted} fail=${failed}`);
  return {
    sqlitePath,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    tables,
    upserted,
    failed,
  };
}
