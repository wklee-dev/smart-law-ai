import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export const DEFAULT_BGWANSE_EXCEL = "C:/SQLiteDB/excel/bgwanse.xlsx";

export type BgwanseRow = {
  Gwanse_code: string;
  Gwanse_semyung: string;
  Gwanse_gubun: string;
  Gwanse_agreecd: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function stmtRun(db: DatabaseSync, sql: string, params: unknown[] = []) {
  return db.prepare(sql).run(...params);
}

function executeSql(db: DatabaseSync, sql: string): void {
  for (const statement of sql
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)) {
    stmtRun(db, statement);
  }
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS bgwanse (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  Gwanse_code TEXT NOT NULL,
  Gwanse_semyung TEXT NOT NULL DEFAULT '',
  Gwanse_gubun TEXT NOT NULL DEFAULT '',
  Gwanse_agreecd TEXT NOT NULL DEFAULT '',
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  source_file TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bgwanse_code ON bgwanse(Gwanse_code);
`;

export function ensureBgwanseTable(db: DatabaseSync): void {
  executeSql(db, CREATE_TABLE_SQL);
}

export function openBgwanseDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p);
  ensureBgwanseTable(db);
  return db;
}

export function countBgwanse(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM bgwanse").get() as {
    n: number;
  };
  return Number(row?.n ?? 0);
}

export function parseBgwanseExcel(buffer: Buffer): BgwanseRow[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("엑셀 시트가 없습니다.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    wb.Sheets[sheetName]!,
    { defval: "" },
  );
  const out: BgwanseRow[] = [];
  for (const row of rows) {
    const code = str(row.Gwanse_code);
    if (!code) continue;
    out.push({
      Gwanse_code: code,
      Gwanse_semyung: str(row.Gwanse_semyung),
      Gwanse_gubun: str(row.Gwanse_gubun),
      Gwanse_agreecd: str(row.Gwanse_agreecd),
    });
  }
  return out;
}

export function importBgwanseRows(
  db: DatabaseSync,
  rows: BgwanseRow[],
  sourceFile: string,
): { imported: number } {
  if (rows.length === 0) {
    throw new Error("가져올 데이터 행이 없습니다.");
  }
  ensureBgwanseTable(db);
  stmtRun(db, "BEGIN IMMEDIATE");
  try {
    stmtRun(db, "DELETE FROM bgwanse");
    const ins = db.prepare(`
      INSERT INTO bgwanse (Gwanse_code, Gwanse_semyung, Gwanse_gubun, Gwanse_agreecd, source_file)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const r of rows) {
      ins.run(
        r.Gwanse_code,
        r.Gwanse_semyung,
        r.Gwanse_gubun,
        r.Gwanse_agreecd,
        sourceFile,
      );
    }
    stmtRun(db, "COMMIT");
    return { imported: rows.length };
  } catch (e) {
    stmtRun(db, "ROLLBACK");
    throw e;
  }
}

export function importBgwanseFromFile(filePath: string): {
  imported: number;
  dbPath: string;
} {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`엑셀 파일이 없습니다: ${resolved}`);
  }
  const buffer = fs.readFileSync(resolved);
  const rows = parseBgwanseExcel(buffer);
  const db = openBgwanseDb();
  try {
    const { imported } = importBgwanseRows(db, rows, resolved);
    return { imported, dbPath: getSmartLawSqliteDbPath() };
  } finally {
    db.close();
  }
}

export function importBgwanseFromBuffer(
  buffer: Buffer,
  sourceLabel: string,
): { imported: number } {
  const rows = parseBgwanseExcel(buffer);
  const db = openBgwanseDb();
  try {
    return importBgwanseRows(db, rows, sourceLabel);
  } finally {
    db.close();
  }
}

export function resolveDefaultBgwanseExcelPath(): string {
  return (
    process.env.BGWANSE_EXCEL_PATH?.trim() || DEFAULT_BGWANSE_EXCEL
  );
}
