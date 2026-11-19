/**
 * 표준품명·규격코드 엑셀 → smart_law_ai.db
 * Usage: node scripts/import-clip-standard-product-code.mjs [excelPath]
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);

const DEFAULT_DB = process.env.SMART_LAW_SQLITE_DB_PATH?.trim() ||
  process.env.SMART_LAW_DB_PATH?.trim() ||
  "D:/SQLiteDB/smart_law_ai.db";
const DEFAULT_XLS =
  process.env.CLIP_STANDARD_PRODUCT_EXCEL_PATH?.trim() ||
  "D:/SQLiteDB/excel/표준품명‧규격 코드_2026092520009348.xls";

function str(v) {
  return v == null ? "" : String(v).trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function extractHs(stdCode) {
  const m = stdCode.trim().match(/^(\d+)/);
  return m ? m[1] : stdCode.trim();
}

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clip_standard_product_code (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seq_no INTEGER NOT NULL,
      std_code TEXT NOT NULL,
      hs_code TEXT NOT NULL DEFAULT '',
      item_name TEXT NOT NULL DEFAULT '',
      std_item_name TEXT NOT NULL DEFAULT '',
      std_spec TEXT NOT NULL DEFAULT '',
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      source_file TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_clip_spc_hs ON clip_standard_product_code(hs_code);
    CREATE INDEX IF NOT EXISTS idx_clip_spc_std ON clip_standard_product_code(std_code);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_clip_spc_seq ON clip_standard_product_code(seq_no);
  `);
}

function parseExcel(filePath) {
  const XLSX = require("xlsx");
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  let start = 2;
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i] ?? [];
    if (str(row[0]) === "번호" && str(row[1]).includes("규격")) {
      start = i + 1;
      break;
    }
  }
  const rows = [];
  for (let i = start; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const stdCode = str(row[1]);
    if (!stdCode) continue;
    rows.push({
      seq_no: num(row[0]) || rows.length + 1,
      std_code: stdCode,
      hs_code: extractHs(stdCode),
      item_name: str(row[2]),
      std_item_name: str(row[3]),
      std_spec: str(row[4]),
    });
  }
  return rows;
}

const excelPath = path.resolve(process.argv[2] || DEFAULT_XLS);
if (!fs.existsSync(excelPath)) {
  console.error("Excel not found:", excelPath);
  process.exit(1);
}
if (!fs.existsSync(DEFAULT_DB)) {
  console.error("DB not found:", DEFAULT_DB);
  process.exit(1);
}

const rows = parseExcel(excelPath);
const db = new DatabaseSync(DEFAULT_DB);
ensureTable(db);
db.exec("BEGIN IMMEDIATE");
try {
  db.exec("DELETE FROM clip_standard_product_code");
  const ins = db.prepare(`
    INSERT INTO clip_standard_product_code
      (seq_no, std_code, hs_code, item_name, std_item_name, std_spec, imported_at, source_file)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `);
  for (const r of rows) {
    ins.run(
      r.seq_no,
      r.std_code,
      r.hs_code,
      r.item_name,
      r.std_item_name,
      r.std_spec,
      excelPath,
    );
  }
  db.exec("COMMIT");
  console.log(`Imported ${rows.length} rows into ${DEFAULT_DB}`);
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
} finally {
  db.close();
}
