/**
 * 유니패스 통계부호 엑셀 → smart_law_ai.db
 * Usage: node scripts/import-clip-statistical-code.mjs [excelPath]
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
  process.env.CLIP_STATISTICAL_CODE_EXCEL_PATH?.trim() ||
  "D:/SQLiteDB/excel/유니패스_통계부호_20260912T024700Z-89f0d014.xlsx";

const SHEET_LIST = "통계코드목록";
const SHEET_DETAIL = "상세통계부호";

function str(v) {
  return v == null ? "" : String(v).trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function ensureTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clip_statistical_code (
      stat_code TEXT PRIMARY KEY,
      stat_sign TEXT NOT NULL DEFAULT '',
      stat_name TEXT NOT NULL DEFAULT '',
      source_seq INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      source_file TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_clip_stat_code_name ON clip_statistical_code(stat_name);

    CREATE TABLE IF NOT EXISTS clip_statistical_code_detail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stat_code TEXT NOT NULL,
      stat_name TEXT NOT NULL DEFAULT '',
      source_seq INTEGER NOT NULL DEFAULT 0,
      detail_code TEXT NOT NULL,
      name_kr TEXT NOT NULL DEFAULT '',
      abbr_kr TEXT NOT NULL DEFAULT '',
      name_en TEXT NOT NULL DEFAULT '',
      abbr_en TEXT NOT NULL DEFAULT '',
      note_en TEXT NOT NULL DEFAULT '',
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      source_file TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_clip_stat_detail_stat ON clip_statistical_code_detail(stat_code);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_clip_stat_detail_uniq
      ON clip_statistical_code_detail(stat_code, detail_code);
  `);
}

function parseCategories(wb) {
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[SHEET_LIST], {
    header: 1,
    defval: "",
    raw: false,
  });
  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const statCode = str(row[0]);
    if (!statCode) continue;
    rows.push({
      stat_code: statCode,
      stat_sign: str(row[1]),
      stat_name: str(row[2]),
      source_seq: num(row[3]),
    });
  }
  return rows;
}

function parseDetails(wb) {
  const matrix = XLSX.utils.sheet_to_json(wb.Sheets[SHEET_DETAIL], {
    header: 1,
    defval: "",
    raw: false,
  });
  const rows = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const statCode = str(row[0]);
    const detailCode = str(row[3]);
    if (!statCode || !detailCode) continue;
    rows.push({
      stat_code: statCode,
      stat_name: str(row[1]),
      source_seq: num(row[2]),
      detail_code: detailCode,
      name_kr: str(row[4]),
      abbr_kr: str(row[5]),
      name_en: str(row[6]),
      abbr_en: str(row[7]),
      note_en: str(row[8]),
    });
  }
  return rows;
}

function importAll(db, categories, details, sourceFile) {
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM clip_statistical_code_detail");
    db.exec("DELETE FROM clip_statistical_code");

    const insCat = db.prepare(`
      INSERT INTO clip_statistical_code (stat_code, stat_sign, stat_name, source_seq, source_file)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const c of categories) {
      insCat.run(
        c.stat_code,
        c.stat_sign,
        c.stat_name,
        c.source_seq,
        sourceFile,
      );
    }

    const insDet = db.prepare(`
      INSERT OR REPLACE INTO clip_statistical_code_detail (
        stat_code, stat_name, source_seq, detail_code,
        name_kr, abbr_kr, name_en, abbr_en, note_en, source_file
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let n = 0;
    for (const d of details) {
      insDet.run(
        d.stat_code,
        d.stat_name,
        d.source_seq,
        d.detail_code,
        d.name_kr,
        d.abbr_kr,
        d.name_en,
        d.abbr_en,
        d.note_en,
        sourceFile,
      );
      n++;
      if (n % 10000 === 0) console.log("detail rows", n);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

const filePath = process.argv[2]?.trim() || DEFAULT_XLS;
if (!fs.existsSync(filePath)) {
  console.error("엑셀 없음:", filePath);
  process.exit(1);
}
if (!fs.existsSync(DEFAULT_DB)) {
  console.error("DB 없음:", DEFAULT_DB);
  process.exit(1);
}

console.log("read", filePath);
const wb = XLSX.readFile(filePath);
if (!wb.SheetNames.includes(SHEET_LIST) || !wb.SheetNames.includes(SHEET_DETAIL)) {
  console.error("시트 없음:", wb.SheetNames.join(", "));
  process.exit(1);
}

const categories = parseCategories(wb);
const details = parseDetails(wb);
console.log("categories", categories.length, "details", details.length);

const db = new DatabaseSync(DEFAULT_DB);
ensureTables(db);
importAll(db, categories, details, path.basename(filePath));
db.close();

console.log("done →", DEFAULT_DB);
