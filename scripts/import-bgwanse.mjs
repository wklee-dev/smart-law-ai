/**
 * bgwanse.xlsx → smart_law_ai.db · bgwanse
 * Usage: node scripts/import-bgwanse.mjs [excelPath]
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DEFAULT_DB =
  process.env.SMART_LAW_SQLITE_DB_PATH?.trim() ||
  process.env.SMART_LAW_DB_PATH?.trim() ||
  "D:/SQLiteDB/smart_law_ai.db";
const DEFAULT_XLS =
  process.env.BGWANSE_EXCEL_PATH?.trim() || "D:/SQLiteDB/excel/bgwanse.xlsx";

function str(v) {
  return v == null ? "" : String(v).trim();
}

function ensureTable(db) {
  db.exec(`
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
  `);
}

function parseExcel(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows
    .map((row) => ({
      Gwanse_code: str(row.Gwanse_code),
      Gwanse_semyung: str(row.Gwanse_semyung),
      Gwanse_gubun: str(row.Gwanse_gubun),
      Gwanse_agreecd: str(row.Gwanse_agreecd),
    }))
    .filter((r) => r.Gwanse_code);
}

const filePath = path.resolve(process.argv[2]?.trim() || DEFAULT_XLS);
if (!fs.existsSync(filePath)) {
  console.error("파일 없음:", filePath);
  process.exit(1);
}

const rows = parseExcel(filePath);
console.log("rows", rows.length);

const db = new DatabaseSync(path.resolve(DEFAULT_DB));
try {
  ensureTable(db);
  db.exec("BEGIN IMMEDIATE");
  db.exec("DELETE FROM bgwanse");
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
      filePath,
    );
  }
  db.exec("COMMIT");
  const count = db.prepare("SELECT COUNT(*) AS n FROM bgwanse").get().n;
  console.log("imported", count, "into", DEFAULT_DB);
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
} finally {
  db.close();
}
