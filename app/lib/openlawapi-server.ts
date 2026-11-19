import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import { getSmartLawAttachRoot } from "@/app/lib/smart-law-db";
import { normalizeLawIdForStorage } from "@/app/shared/law-id";

const execFileAsync = promisify(execFile);

export type OpenlawApiStatusRow = {
  gwanselawId: string;
  lawId: string;
  inLawList: boolean;
  bodySaved: boolean;
  lawListName: string;
  enfDate: string;
};

export type OpenlawProgressEvent = {
  type:
    | "run_start"
    | "law_start"
    | "step_start"
    | "step_done"
    | "law_done"
    | "run_done"
    | "log"
    | "error"
    | "result";
  lawId?: string;
  lawIndex?: number;
  lawTotal?: number;
  step?: number;
  stepTotal?: number;
  label?: string;
  target?: string;
  endpoint?: string;
  table?: string;
  count?: number;
  ok?: boolean;
  error?: string;
  message?: string;
  successLawIds?: string[];
  failedLawIds?: string[];
  exitCode?: number;
};

export function getOpenlawApiDir(): string {
  const fromEnv = process.env.SMART_LAW_API_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(process.cwd(), "scripts", "openlawapi");
}

export function getPythonExecutable(): string {
  return process.env.PYTHON_PATH?.trim() || "python";
}

function getLawDbPath(): string {
  return (
    process.env.LAW_DB_PATH?.trim() ||
    process.env.SMART_LAW_SQLITE_DB_PATH?.trim() ||
    getSmartLawSqliteDbPath()
  );
}

function buildOpenlawEnv(): NodeJS.ProcessEnv {
  const dbPath = getLawDbPath();
  const attachDir =
    process.env.LAW_ATTACH_DIR?.trim() ||
    path.join(getSmartLawAttachRoot(), "attach", "smartlawai");

  return {
    ...process.env,
    LAW_API_OC: process.env.LAW_API_OC ?? "",
    LAW_XMLSERVICE_URL:
      process.env.LAW_XMLSERVICE_URL ?? "http://law.go.kr/DRF/lawSearch.do",
    LAW_JSONSERVICE_URL:
      process.env.LAW_JSONSERVICE_URL ?? "http://law.go.kr/DRF/lawService.do",
    LAW_DB_PATH: dbPath,
    LAW_ATTACH_DIR: attachDir,
    PYTHONUNBUFFERED: "1",
  };
}

function openStatusDb(): DatabaseSync {
  const dbPath = path.resolve(getLawDbPath());
  if (!fs.existsSync(dbPath)) {
    throw new Error(`법령 SQLite DB 파일이 없습니다: ${dbPath}`);
  }
  return new DatabaseSync(dbPath, { readOnly: true });
}

export function listOpenlawApiStatus(): OpenlawApiStatusRow[] {
  const db = openStatusDb();
  try {
    const hasGwanselaw = db
      .prepare(
        `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'gwanselaw_list' LIMIT 1`,
      )
      .get() as { ok?: number } | undefined;
    if (!hasGwanselaw?.ok) {
      return [];
    }

    const rows = db
      .prepare(
        `
        SELECT
          g.id AS gwanselaw_id,
          g.law_id AS law_id,
          CASE WHEN ll.law_id IS NOT NULL THEN 1 ELSE 0 END AS in_law_list,
          CASE
            WHEN oe.law_id IS NOT NULL OR l.law_id IS NOT NULL THEN 1
            ELSE 0
          END AS body_saved,
          COALESCE(ll.law_name_kr, '') AS law_list_name,
          COALESCE(ll.enf_date, '') AS enf_date
        FROM gwanselaw_list g
        LEFT JOIN (
          SELECT law_id, law_name_kr, MAX(enf_date) AS enf_date
          FROM law_list
          GROUP BY law_id
        ) ll ON TRIM(ll.law_id) = TRIM(g.law_id)
        LEFT JOIN openlaw_efyd_info oe
          ON CAST(oe.law_id AS INTEGER) = CAST(TRIM(g.law_id) AS INTEGER)
        LEFT JOIN laws l ON TRIM(l.law_id) = TRIM(g.law_id)
        ORDER BY g.upload_order ASC, g.api_name ASC
        `,
      )
      .all() as {
      gwanselaw_id: string;
      law_id: string;
      in_law_list: number;
      body_saved: number;
      law_list_name: string;
      enf_date: string;
    }[];

    return rows.map((row) => ({
      gwanselawId: row.gwanselaw_id,
      lawId: normalizeLawIdForStorage(row.law_id ?? ""),
      inLawList: Boolean(row.in_law_list),
      bodySaved: Boolean(row.body_saved),
      lawListName: row.law_list_name ?? "",
      enfDate: row.enf_date ?? "",
    }));
  } finally {
    db.close();
  }
}

export function lawIdsWithSavedBody(lawIds: string[]): Set<string> {
  const normalized = lawIds
    .map((id) => normalizeLawIdForStorage(id))
    .filter(Boolean);
  if (normalized.length === 0) return new Set();

  const db = openStatusDb();
  try {
    const hasOpenlawEfydInfo = db
      .prepare(
        `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'openlaw_efyd_info' LIMIT 1`,
      )
      .get() as { ok?: number } | undefined;

    const found = new Set<string>();
    if (hasOpenlawEfydInfo?.ok) {
      const stmt = db.prepare(
        `SELECT law_id FROM openlaw_efyd_info
         WHERE CAST(law_id AS INTEGER) = CAST(TRIM(?) AS INTEGER)
         LIMIT 1`,
      );
      for (const lawId of normalized) {
        const row = stmt.get(lawId) as { law_id?: number | string } | undefined;
        if (row?.law_id != null) {
          found.add(normalizeLawIdForStorage(String(row.law_id)));
        }
      }
      return found;
    }

    const legacyStmt = db.prepare(
      `SELECT law_id FROM laws WHERE TRIM(law_id) = TRIM(?) LIMIT 1`,
    );
    for (const lawId of normalized) {
      const row = legacyStmt.get(lawId) as { law_id?: string } | undefined;
      if (row?.law_id) {
        found.add(normalizeLawIdForStorage(row.law_id));
      }
    }
    return found;
  } finally {
    db.close();
  }
}

export type RunOpenlawFetchResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  successLawIds: string[];
  failedLawIds: string[];
};

function normalizeFetchLawIds(lawIds: string[]): string[] {
  return [
    ...new Set(lawIds.map((id) => normalizeLawIdForStorage(id)).filter(Boolean)),
  ];
}

function assertCrawlerReady(normalized: string[]): {
  apiDir: string;
  crawlerPy: string;
} {
  if (normalized.length === 0) {
    throw new Error("수집할 법령ID가 없습니다.");
  }
  if (!process.env.LAW_API_OC?.trim()) {
    throw new Error(".env.local에 LAW_API_OC 값이 없습니다.");
  }
  const apiDir = getOpenlawApiDir();
  const crawlerPy = path.join(apiDir, "law_crawler.py");
  if (!fs.existsSync(crawlerPy)) {
    throw new Error(`openlawapi law_crawler.py를 찾을 수 없습니다: ${crawlerPy}`);
  }
  return { apiDir, crawlerPy };
}

function parseProgressLine(line: string): OpenlawProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("OPENLAW_PROGRESS ")) return null;
  try {
    const payload = JSON.parse(
      trimmed.slice("OPENLAW_PROGRESS ".length),
    ) as OpenlawProgressEvent;
    if (!payload || typeof payload.type !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

/** Python 크롤러 stdout을 읽어 진행 이벤트를 스트리밍 */
export async function* streamOpenlawMainFetch(
  lawIds: string[],
  options?: { noAttach?: boolean; includeAdmrul?: boolean },
): AsyncGenerator<OpenlawProgressEvent> {
  const normalized = normalizeFetchLawIds(lawIds);
  const { apiDir } = assertCrawlerReady(normalized);
  void options;

  const args = ["law_crawler.py", "--law-ids", normalized.join(",")];
  const child = spawn(getPythonExecutable(), args, {
    cwd: apiDir,
    env: {
      ...buildOpenlawEnv(),
      OPENLAWAPI_NONINTERACTIVE: "1",
      PYTHONUNBUFFERED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  const exitPromise = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });

  const rl = readline.createInterface({
    input: child.stdout,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const event = parseProgressLine(line);
    if (event) {
      yield event;
    } else if (line.trim()) {
      yield { type: "log", message: line };
    }
  }

  const exitCode = await exitPromise;

  const afterSaved = lawIdsWithSavedBody(normalized);
  const successLawIds = normalized.filter((id) => afterSaved.has(id));
  const failedLawIds = normalized.filter((id) => !afterSaved.has(id));

  if (exitCode !== 0 && successLawIds.length === 0) {
    yield {
      type: "error",
      error: stderr.trim() || `Python 종료 코드 ${exitCode}`,
      exitCode,
      successLawIds,
      failedLawIds,
    };
    return;
  }

  yield {
    type: "result",
    ok: true,
    exitCode,
    successLawIds,
    failedLawIds,
    message: stderr.trim() || undefined,
  };
}

export async function runOpenlawMainFetch(
  lawIds: string[],
  options?: { noAttach?: boolean; includeAdmrul?: boolean },
): Promise<RunOpenlawFetchResult> {
  const normalized = normalizeFetchLawIds(lawIds);
  const { apiDir } = assertCrawlerReady(normalized);
  void options;

  const args = ["law_crawler.py", "--law-ids", normalized.join(",")];

  let stdout = "";
  let stderr = "";
  let exitCode = 0;

  try {
    const result = await execFileAsync(getPythonExecutable(), args, {
      cwd: apiDir,
      env: {
        ...buildOpenlawEnv(),
        OPENLAWAPI_NONINTERACTIVE: "1",
        PYTHONUNBUFFERED: "1",
      },
      timeout: 600_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    stdout = result.stdout?.toString() ?? "";
    stderr = result.stderr?.toString() ?? "";
  } catch (error) {
    const execError = error as {
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      code?: number | string;
      message?: string;
    };
    stdout =
      typeof execError.stdout === "string"
        ? execError.stdout
        : (execError.stdout?.toString() ?? "");
    stderr =
      typeof execError.stderr === "string"
        ? execError.stderr
        : (execError.stderr?.toString() ?? execError.message ?? "");
    exitCode =
      typeof execError.code === "number"
        ? execError.code
        : Number.parseInt(String(execError.code ?? "1"), 10) || 1;
  }

  const afterSaved = lawIdsWithSavedBody(normalized);
  const successLawIds = normalized.filter((id) => afterSaved.has(id));
  const failedLawIds = normalized.filter((id) => !afterSaved.has(id));

  if (exitCode !== 0 && successLawIds.length === 0) {
    throw new Error(
      stderr.trim() || stdout.trim() || `Python 종료 코드 ${exitCode}`,
    );
  }

  return {
    stdout,
    stderr,
    exitCode,
    successLawIds,
    failedLawIds,
  };
}
