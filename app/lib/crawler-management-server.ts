import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as XLSX from "xlsx";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import { getSmartLawAttachRoot } from "@/app/lib/smart-law-db";
import { findWeeklyCrawlerKey } from "@/app/lib/weekly-crawlers-registry";
import type {
  CrawlerListItem,
  CrawlerRunRow,
  CrawlerScheduleKind,
} from "@/app/shared/crawler-management-types";

export type {
  CrawlerListItem,
  CrawlerRunRow,
  CrawlerScheduleKind,
} from "@/app/shared/crawler-management-types";

export const CRAWLER_LIST_XLSX_NAME = "법령정보및관세율,품목분류사례 처리현황.xlsx";

/** RPA-03: C:\SQLiteDB\excel (run.ps1 이 배포본에서 최초 복사). 개발 PC: D:\Manus 폴백 */
export const CRAWLER_LIST_XLSX_PATH =
  process.env.CRAWLER_LIST_XLSX_PATH?.trim() ||
  [
    path.join(getSmartLawAttachRoot(), "excel", CRAWLER_LIST_XLSX_NAME),
    `D:/Manus/${CRAWLER_LIST_XLSX_NAME}`,
  ].find((p) => fs.existsSync(p)) ||
  path.join(getSmartLawAttachRoot(), "excel", CRAWLER_LIST_XLSX_NAME);

/** 크롤러는 아직 SQLite에 기록 (RPA-03: C:/SQLiteDB/smart_law_ai.db) */
export const CRAWLER_TARGET_DB = getSmartLawSqliteDbPath();

type RunningJob = {
  child: ChildProcessWithoutNullStreams;
  runId: number;
  crawlerId: string;
};

const runningJobs = new Map<string, RunningJob>();

function slugify(name: string, row: number): string {
  const base = name
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w가-힣\-]+/g, "")
    .slice(0, 40);
  return `${row}-${base || "crawler"}`;
}

function isSmartLawDb(raw: string): boolean {
  const name = raw.replace(/\\/g, "/").split("/").pop()?.trim().toLowerCase() ?? "";
  return name === "smart_law_ai.db";
}

/** M열(프로그램 위치)에서 실행 cwd 추출 */
export function resolveProgramDir(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    const cd = line.match(/^cd\s+(?:\/d\s+)?["']?([^"']+?)["']?\s*$/i);
    if (cd?.[1]) return cd[1].trim();
    if (/^[A-Za-z]:[\\/]/.test(line) && !/\.py\b/i.test(line) && !/\.bat\b/i.test(line)) {
      return line.replace(/^CD\s+/i, "").replace(/^["']|["']$/g, "").trim();
    }
  }
  return null;
}

/** O열(호출)에서 실행 가능한 첫 python 명령 */
export function extractPrimaryCommand(callRaw: string | null | undefined): string | null {
  if (!callRaw?.trim()) return null;
  for (const line of callRaw.split(/\r?\n/)) {
    const cleaned = line
      .replace(/#.*$/, "")
      .replace(/=>.*$/, "")
      .replace(/==>.*$/, "")
      .trim();
    if (!cleaned) continue;
    if (/\bpip\s+install\b/i.test(cleaned)) continue;
    if (/^(?:python(?:3)?|py(?:\s+-3)?)\s+/i.test(cleaned)) return cleaned;
  }
  return null;
}

function parseWeek(text: string): { year: number; week: number } | null {
  const m = text.match(/(20\d{2})\s*[-_.]?\s*(\d{1,2})\s*주?/);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) {
    return null;
  }
  return { year, week };
}

function formatWeek(year: number, week: number): string {
  return `${year}-${String(week).padStart(2, "0")}`;
}

function nextWeek(year: number, week: number): { year: number; week: number } {
  if (week >= 52) return { year: year + 1, week: 1 };
  return { year, week: week + 1 };
}

function detectSchedule(cmd: string | null, progress: string): {
  kind: CrawlerScheduleKind;
  latest: string | null;
  next: string | null;
  nextCommand: string | null;
} {
  if (!cmd) {
    return { kind: "manual", latest: null, next: null, nextCommand: null };
  }

  const weekInCmd = cmd.match(/--week\s+(\d{4}-\d{1,2})/i);
  const yearInCmd = cmd.match(/--year\s+(\d{4})/i);
  const rangeInCmd = cmd.match(/--start\s+(\d+)\s+--end\s+(\d+)/i);
  const pageInCmd = cmd.match(/--page\s+(\d+)/i);
  const pageRange = cmd.match(/--page-range\s+(\d+)-(\d+)/i);

  if (weekInCmd || /주차/.test(progress)) {
    const fromProgress = parseWeek(progress);
    const fromCmd = weekInCmd ? parseWeek(weekInCmd[1]!) : null;
    const latestObj = fromProgress ?? fromCmd;
    if (!latestObj) {
      return { kind: "week", latest: null, next: null, nextCommand: null };
    }
    const nxt = nextWeek(latestObj.year, latestObj.week);
    const latest = formatWeek(latestObj.year, latestObj.week);
    const next = formatWeek(nxt.year, nxt.week);
    const nextCommand = weekInCmd
      ? cmd.replace(/--week\s+\d{4}-\d{1,2}/i, `--week ${next}`)
      : `${cmd} --week ${next}`;
    return { kind: "week", latest, next, nextCommand };
  }

  if (yearInCmd) {
    const years = [...progress.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
    const latestYear = years.length ? Math.max(...years) : Number(yearInCmd[1]);
    const next = String(latestYear + 1);
    const nextCommand = cmd.replace(/--year\s+\d{4}/i, `--year ${next}`);
    return {
      kind: "year",
      latest: String(latestYear),
      next,
      nextCommand,
    };
  }

  if (rangeInCmd) {
    const start = Number(rangeInCmd[1]);
    const end = Number(rangeInCmd[2]);
    const span = Math.max(1, end - start + 1);
    const nextStart = end + 1;
    const nextEnd = end + span;
    const next = `${nextStart}-${nextEnd}`;
    const nextCommand = cmd
      .replace(/--start\s+\d+/i, `--start ${nextStart}`)
      .replace(/--end\s+\d+/i, `--end ${nextEnd}`);
    return {
      kind: "range",
      latest: `${start}-${end}`,
      next,
      nextCommand,
    };
  }

  if (pageInCmd) {
    const page = Number(pageInCmd[1]);
    const next = String(page + 1);
    const nextCommand = cmd.replace(/--page\s+\d+/i, `--page ${next}`);
    return { kind: "page", latest: String(page), next, nextCommand };
  }

  if (pageRange) {
    const start = Number(pageRange[1]);
    const end = Number(pageRange[2]);
    const span = Math.max(1, end - start + 1);
    const nextStart = end + 1;
    const nextEnd = end + span;
    const next = `${nextStart}-${nextEnd}`;
    const nextCommand = cmd.replace(
      /--page-range\s+\d+-\d+/i,
      `--page-range ${nextStart}-${nextEnd}`,
    );
    return { kind: "range", latest: `${start}-${end}`, next, nextCommand };
  }

  return { kind: "manual", latest: null, next: null, nextCommand: cmd };
}

function ensureRunTable(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crawler_job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      crawler_id TEXT NOT NULL,
      crawler_name TEXT NOT NULL,
      command TEXT NOT NULL,
      cwd TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      exit_code INTEGER,
      log_path TEXT,
      period TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_crawler_job_runs_id
      ON crawler_job_runs(crawler_id, id DESC);
  `);
}

export function openJobDb(): DatabaseSync {
  const dbPath = path.resolve(getSmartLawSqliteDbPath().trim());
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  ensureRunTable(db);
  return db;
}

function latestRunMap(): Map<string, CrawlerRunRow> {
  const db = openJobDb();
  try {
    const rows =
      (db
        .prepare(
          `SELECT id, crawler_id, crawler_name, command, cwd, status,
                  started_at, finished_at, exit_code, log_path, period
           FROM crawler_job_runs
           WHERE id IN (
             SELECT MAX(id) FROM crawler_job_runs GROUP BY crawler_id
           )`,
        )
        .all() as CrawlerRunRow[]) ?? [];
    return new Map(rows.map((r) => [r.crawler_id, r]));
  } finally {
    db.close();
  }
}

export function listCrawlersFromExcel(): CrawlerListItem[] {
  if (!fs.existsSync(CRAWLER_LIST_XLSX_PATH)) {
    throw new Error(`엑셀 파일을 찾을 수 없습니다: ${CRAWLER_LIST_XLSX_PATH}`);
  }
  const wb = XLSX.readFile(CRAWLER_LIST_XLSX_PATH, { cellDates: false });
  const sheetName =
    wb.SheetNames.find((n) => n === "리스트") ?? wb.SheetNames[0];
  if (!sheetName) throw new Error("엑셀 시트가 없습니다.");
  const sheet = wb.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];

  const runs = latestRunMap();
  const out: CrawlerListItem[] = [];

  // 열: A구분 B진행사항 C대상 D진행사항 E매주최신화 F비고 G~I Source J대상 K DB L embedding M프로그램위치 N첨부파일 O호출 P검증
  const cell = (r: string[], c: number) => String(r[c] ?? "").trim();
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] ?? [];
    const name = cell(r, 2);
    if (!name) continue;
    const callRaw = cell(r, 14);
    const programLocationRaw = cell(r, 12);
    const db = cell(r, 10);

    const progress = cell(r, 3);
    const primaryCommand = extractPrimaryCommand(callRaw);
    const schedule = detectSchedule(primaryCommand, progress);
    const id = slugify(name, i + 1);
    const source = [cell(r, 6), cell(r, 7), cell(r, 8)].filter(Boolean).join(" > ");
    const lastRun = runs.get(id) ?? null;
    const running = runningJobs.has(id) || lastRun?.status === "running";

    out.push({
      id,
      excelRow: i + 1,
      category: cell(r, 0),
      status: running ? "실행중" : cell(r, 1),
      name,
      progress,
      weekly: cell(r, 4),
      note: cell(r, 5),
      source,
      weeklyKey: findWeeklyCrawlerKey(name, source),
      target: cell(r, 9),
      db,
      dbIsSmartLaw: !db || isSmartLawDb(db),
      embedding: cell(r, 11),
      programLocationRaw,
      programDir: resolveProgramDir(programLocationRaw),
      attachment: cell(r, 13),
      callRaw,
      verifyRaw: cell(r, 15),
      primaryCommand,
      scheduleKind: schedule.kind,
      latestPeriod: schedule.latest,
      nextPeriod: schedule.next,
      nextCommand: schedule.nextCommand,
      lastRun,
    });
  }

  return out;
}

function splitCommand(cmd: string): { exe: string; args: string[] } {
  const parts: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cmd))) {
    parts.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  if (!parts.length) throw new Error("실행 명령이 비어 있습니다.");
  const exe = parts[0]!;
  return { exe, args: parts.slice(1) };
}

function updateExcelProgress(excelRow: number, periodLabel: string) {
  if (!fs.existsSync(CRAWLER_LIST_XLSX_PATH)) return;
  const wb = XLSX.readFile(CRAWLER_LIST_XLSX_PATH);
  const sheetName =
    wb.SheetNames.find((n) => n === "리스트") ?? wb.SheetNames[0];
  if (!sheetName) return;
  const sheet = wb.Sheets[sheetName]!;
  const cellRef = XLSX.utils.encode_cell({ r: excelRow - 1, c: 3 }); // D
  const prev = String(sheet[cellRef]?.v ?? "");
  const stamp = new Date().toISOString().slice(0, 10);
  sheet[cellRef] = {
    t: "s",
    v: `${periodLabel} 차수 실행 요청 (${stamp})${prev ? `\n${prev}` : ""}`,
  };
  // B status
  const statusRef = XLSX.utils.encode_cell({ r: excelRow - 1, c: 1 });
  sheet[statusRef] = { t: "s", v: "크롤링" };
  XLSX.writeFile(wb, CRAWLER_LIST_XLSX_PATH);
}

export function runCrawlerNext(crawlerId: string): {
  ok: true;
  runId: number;
  command: string;
  period: string | null;
} {
  const items = listCrawlersFromExcel();
  const item = items.find((x) => x.id === crawlerId);
  if (!item) throw new Error("크롤러를 찾을 수 없습니다.");
  if (runningJobs.has(crawlerId)) {
    throw new Error("이미 실행 중인 작업이 있습니다.");
  }
  const command = item.nextCommand || item.primaryCommand;
  if (!command) throw new Error("실행 가능한 호출 명령이 없습니다.");
  if (!item.programDir || !fs.existsSync(item.programDir)) {
    throw new Error(`프로그램 위치가 없거나 유효하지 않습니다: ${item.programDir ?? "(없음)"}`);
  }

  const logDir = path.join(getSmartLawAttachRoot(), "crawler_logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(
    logDir,
    `${item.id}-${Date.now()}.log`,
  );

  const db = openJobDb();
  const startedAt = new Date().toISOString();
  let runId = 0;
  try {
    const info = db
      .prepare(
        `INSERT INTO crawler_job_runs
          (crawler_id, crawler_name, command, cwd, status, started_at, log_path, period)
         VALUES (?, ?, ?, ?, 'running', ?, ?, ?)`,
      )
      .run(
        item.id,
        item.name,
        command,
        item.programDir,
        startedAt,
        logPath,
        item.nextPeriod,
      );
    runId = Number(info.lastInsertRowid ?? 0);
  } finally {
    db.close();
  }

  const { exe, args } = splitCommand(command);
  const out = fs.createWriteStream(logPath, { flags: "a" });
  out.write(`[${startedAt}] cwd=${item.programDir}\n$ ${command}\n\n`);

  const child = spawn(exe, args, {
    cwd: item.programDir,
    env: {
      ...process.env,
      SMART_LAW_DB_PATH: CRAWLER_TARGET_DB,
      SMART_LAW_SQLITE_DB_PATH: CRAWLER_TARGET_DB,
    },
    windowsHide: true,
  });
  runningJobs.set(crawlerId, { child, runId, crawlerId });

  child.stdout.on("data", (buf: Buffer) => out.write(buf));
  child.stderr.on("data", (buf: Buffer) => out.write(buf));
  child.on("error", (err) => {
    out.write(`\n[error] ${err.message}\n`);
  });
  child.on("close", (code) => {
    out.write(`\n[exit] code=${code}\n`);
    out.end();
    runningJobs.delete(crawlerId);
    const finishedAt = new Date().toISOString();
    const jobDb = openJobDb();
    try {
      jobDb
        .prepare(
          `UPDATE crawler_job_runs
           SET status = ?, finished_at = ?, exit_code = ?
           WHERE id = ?`,
        )
        .run(code === 0 ? "success" : "failed", finishedAt, code, runId);
    } finally {
      jobDb.close();
    }
  });

  try {
    if (item.nextPeriod) updateExcelProgress(item.excelRow, item.nextPeriod);
  } catch {
    /* excel locked 등 무시 */
  }

  return {
    ok: true,
    runId,
    command,
    period: item.nextPeriod,
  };
}

export function getCrawlerTargetDb(): string {
  return CRAWLER_TARGET_DB;
}
