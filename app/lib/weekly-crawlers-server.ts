import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  CRAWLER_TARGET_DB,
  openJobDb,
} from "@/app/lib/crawler-management-server";
import { getSmartLawAttachRoot, isSmartLawPostgres } from "@/app/lib/smart-law-db";
import { syncSqliteToPostgres } from "@/app/lib/sqlite-pg-sync-server";
import {
  getWeeklyCrawlersRoot,
  loadWeeklyCrawlers,
  type WeeklyCrawlerDef,
} from "@/app/lib/weekly-crawlers-registry";
import type {
  CrawlerRunRow,
  WeeklyBatchState as BatchState,
  WeeklyCrawlerItem,
} from "@/app/shared/crawler-management-types";

const PYTHON = process.env.WEEKLY_CRAWLER_PYTHON?.trim() || "python";
const PG_SYNC_KEY = "pg-sync";

const g = globalThis as typeof globalThis & {
  __weeklyCrawlerBatch?: BatchState | null;
};

function jobId(key: string) {
  return `weekly:${key}`;
}

/** 직전 ISO 주차 (오늘 기준 7일 전이 속한 주) */
export function previousIsoWeek(now = new Date()): { year: number; week: number } {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function substitute(text: string): string {
  const { year, week } = previousIsoWeek();
  return text
    .replaceAll("{DB}", CRAWLER_TARGET_DB)
    .replaceAll("{PREV_YEARWEEK}", `${year}-${String(week).padStart(2, "0")}`)
    .replaceAll("{PREV_YEAR}", String(year))
    .replaceAll("{PREV_WEEK}", String(week));
}

function quoteArg(a: string) {
  return /\s/.test(a) ? `"${a}"` : a;
}

function resolveSteps(def: WeeklyCrawlerDef): string[][] {
  return def.steps.map((s) => s.map(substitute));
}

function commandLabel(steps: string[][]): string {
  return steps.map((s) => [PYTHON, ...s].map(quoteArg).join(" ")).join(" && ");
}

function latestWeeklyRuns(): Map<string, CrawlerRunRow> {
  const db = openJobDb();
  try {
    const rows = db
      .prepare(
        `SELECT id, crawler_id, crawler_name, command, cwd, status,
                started_at, finished_at, exit_code, log_path, period
         FROM crawler_job_runs
         WHERE id IN (
           SELECT MAX(id) FROM crawler_job_runs
           WHERE crawler_id LIKE 'weekly:%' GROUP BY crawler_id
         )`,
      )
      .all() as CrawlerRunRow[];
    return new Map(rows.map((r) => [r.crawler_id, r]));
  } finally {
    db.close();
  }
}

export function getWeeklyBatchState(): BatchState | null {
  return g.__weeklyCrawlerBatch ?? null;
}

export function listWeeklyCrawlers(): WeeklyCrawlerItem[] {
  const root = getWeeklyCrawlersRoot();
  const runs = latestWeeklyRuns();
  const batch = getWeeklyBatchState();
  return loadWeeklyCrawlers().map((def) => {
    const dir = path.join(root, def.dir);
    const steps = resolveSteps(def);
    const lastRun = runs.get(jobId(def.key)) ?? null;
    return {
      key: def.key,
      names: def.excel.map((e) => `${e.name} (${e.site})`),
      dir,
      dirExists: fs.existsSync(dir),
      originalDir: `C:\\Crawling\\${def.dir}`,
      command: commandLabel(steps),
      interactive: def.interactive ?? null,
      queued: batch?.queue.includes(def.key) ?? false,
      lastRun,
    };
  });
}

function runStep(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  out: fs.WriteStream,
): Promise<number> {
  return new Promise((resolve) => {
    out.write(`\n$ ${[PYTHON, ...args].map(quoteArg).join(" ")}\n`);
    const child = spawn(PYTHON, args, {
      cwd,
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (b: Buffer) => out.write(b));
    child.stderr.on("data", (b: Buffer) => out.write(b));
    child.on("error", (err) => {
      out.write(`\n[error] ${err.message}\n`);
      resolve(-1);
    });
    child.on("close", (code) => resolve(code ?? -1));
  });
}

/** 크롤러 1개 실행 (단계 순차). 실행 기록은 crawler_job_runs(crawler_id = weekly:<key>) */
async function runWeeklyCrawler(def: WeeklyCrawlerDef): Promise<void> {
  const cwd = path.join(getWeeklyCrawlersRoot(), def.dir);
  if (!fs.existsSync(cwd)) throw new Error(`프로그램 폴더가 없습니다: ${cwd}`);
  const steps = resolveSteps(def);
  const { year, week } = previousIsoWeek();
  const period = `${year}-${String(week).padStart(2, "0")}`;

  const logDir = path.join(getSmartLawAttachRoot(), "crawler_logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `weekly-${def.key}-${Date.now()}.log`);
  const startedAt = new Date().toISOString();

  const db = openJobDb();
  let runId = 0;
  try {
    const info = db
      .prepare(
        `INSERT INTO crawler_job_runs
          (crawler_id, crawler_name, command, cwd, status, started_at, log_path, period)
         VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`,
      )
      .run(
        jobId(def.key),
        def.excel.map((e) => e.name).join(", "),
        commandLabel(steps),
        cwd,
        startedAt,
        logPath,
        period,
      );
    runId = Number(info.lastInsertRowid ?? 0);
  } finally {
    db.close();
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
    PYTHONUNBUFFERED: "1",
    SMART_LAW_DB_PATH: CRAWLER_TARGET_DB,
    SMART_LAW_SQLITE_DB_PATH: CRAWLER_TARGET_DB,
  };
  for (const [k, v] of Object.entries(def.env ?? {})) env[k] = substitute(v);

  const out = fs.createWriteStream(logPath, { flags: "a" });
  out.write(`[${startedAt}] cwd=${cwd}\n`);
  let code = 0;
  for (const args of steps) {
    code = await runStep(args, cwd, env, out);
    if (code !== 0) break;
  }
  out.write(`\n[exit] code=${code}\n`);
  await new Promise<void>((r) => out.end(r));

  const jobDb = openJobDb();
  try {
    jobDb
      .prepare(
        `UPDATE crawler_job_runs SET status = ?, finished_at = ?, exit_code = ? WHERE id = ?`,
      )
      .run(code === 0 ? "success" : "failed", new Date().toISOString(), code, runId);
  } finally {
    jobDb.close();
  }
}

/** 크롤 결과 SQLite → Postgres 반영. 실행 기록은 crawler_job_runs(crawler_id = weekly:pg-sync) */
export async function runPgSyncStep(): Promise<void> {
  if (!isSmartLawPostgres()) return;
  const logDir = path.join(getSmartLawAttachRoot(), "crawler_logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `weekly-pg-sync-${Date.now()}.log`);
  const startedAt = new Date().toISOString();
  const { year, week } = previousIsoWeek();

  const db = openJobDb();
  let runId = 0;
  try {
    const info = db
      .prepare(
        `INSERT INTO crawler_job_runs
          (crawler_id, crawler_name, command, cwd, status, started_at, log_path, period)
         VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`,
      )
      .run(
        jobId(PG_SYNC_KEY),
        "Postgres 반영",
        "syncSqliteToPostgres",
        CRAWLER_TARGET_DB,
        startedAt,
        logPath,
        `${year}-${String(week).padStart(2, "0")}`,
      );
    runId = Number(info.lastInsertRowid ?? 0);
  } finally {
    db.close();
  }

  const out = fs.createWriteStream(logPath, { flags: "a" });
  out.write(`[${startedAt}] SQLite → Postgres\n`);
  let ok = false;
  try {
    const res = await syncSqliteToPostgres((s) => out.write(`${s}\n`));
    ok = res.failed === 0;
  } catch (e) {
    out.write(`\n[error] ${e instanceof Error ? e.message : String(e)}\n`);
  }
  await new Promise<void>((r) => out.end(r));

  const jobDb = openJobDb();
  try {
    jobDb
      .prepare(
        `UPDATE crawler_job_runs SET status = ?, finished_at = ?, exit_code = ? WHERE id = ?`,
      )
      .run(ok ? "success" : "failed", new Date().toISOString(), ok ? 0 : 1, runId);
  } finally {
    jobDb.close();
  }
}

async function drainBatch(): Promise<void> {
  const batch = g.__weeklyCrawlerBatch;
  if (!batch) return;
  const defs = new Map(loadWeeklyCrawlers().map((d) => [d.key, d]));
  while (batch.queue.length) {
    const key = batch.queue.shift()!;
    batch.current = key;
    const def = defs.get(key);
    if (def) {
      try {
        await runWeeklyCrawler(def);
      } catch {
        /* 실패는 crawler_job_runs·로그에 남기고 다음 크롤러 진행 */
      }
    }
    batch.done += 1;
  }
  batch.current = PG_SYNC_KEY;
  try {
    await runPgSyncStep();
  } catch {
    /* 실패는 crawler_job_runs·로그에 남김 */
  }
  g.__weeklyCrawlerBatch = null;
}

/**
 * 주간 크롤러 실행 (한 번에 1개씩 순차 — 같은 SQLite에 동시 쓰기 방지).
 * keys 미지정 시 로그인 필요 항목(interactive)을 제외한 전체.
 */
export function startWeeklyCrawlers(keys?: string[]): BatchState {
  const defs = loadWeeklyCrawlers();
  const wanted = keys?.length
    ? defs.filter((d) => keys.includes(d.key))
    : defs.filter((d) => !d.interactive);
  if (!wanted.length) throw new Error("실행할 주간 크롤러가 없습니다.");

  const batch = g.__weeklyCrawlerBatch;
  if (batch) {
    const add = wanted
      .map((d) => d.key)
      .filter((k) => k !== batch.current && !batch.queue.includes(k));
    batch.queue.push(...add);
    batch.total += add.length;
    return batch;
  }

  const next: BatchState = {
    queue: wanted.map((d) => d.key),
    current: null,
    startedAt: new Date().toISOString(),
    done: 0,
    total: wanted.length,
  };
  g.__weeklyCrawlerBatch = next;
  void drainBatch();
  return next;
}

export function readWeeklyRunLog(runId: number, maxBytes = 64 * 1024): string {
  const db = openJobDb();
  let logPath: string | null = null;
  try {
    const row = db
      .prepare(`SELECT log_path FROM crawler_job_runs WHERE id = ?`)
      .get(runId) as { log_path: string | null } | undefined;
    logPath = row?.log_path ?? null;
  } finally {
    db.close();
  }
  if (!logPath || !fs.existsSync(logPath)) return "(로그 파일 없음)";
  const size = fs.statSync(logPath).size;
  const fd = fs.openSync(logPath, "r");
  try {
    const len = Math.min(size, maxBytes);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    return (size > len ? "…(앞부분 생략)\n" : "") + buf.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}
