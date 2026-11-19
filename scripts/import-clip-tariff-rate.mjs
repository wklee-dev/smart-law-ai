/**
 * 관세율(2026).xlsx · 7.1 시트 → clip_tariff_rate
 * Usage: node scripts/import-clip-tariff-rate.mjs [excelPath] [sheetName]
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
  process.env.CLIP_TARIFF_RATE_EXCEL_PATH?.trim() ||
  "D:/SQLiteDB/excel/관세율(2026).xlsx";
const DEFAULT_SHEET = "7.1";
const TARIFF_DB =
  process.env.TARIFF_SQLITE_DB_PATH?.trim() || "D:/SQLiteDB/tariff.db";

function str(v) {
  return v == null ? "" : String(v).trim();
}

function normalizeHsDigits(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(Math.trunc(v)).padStart(10, "0");
  }
  return str(v).replace(/\D/g, "");
}

function formatHsCodeDotted(hs) {
  const d = normalizeHsDigits(hs);
  if (d.length <= 4) return d || "—";
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}-${d.slice(6)}`;
}

function formatYmd(v) {
  const raw = str(v).replace(/\D/g, "");
  if (raw.length === 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return str(v);
}

function formatRate(v) {
  if (v === null || v === undefined || v === "") return "";
  const s = str(v);
  if (s.endsWith("%")) return s;
  const n = Number(v);
  if (Number.isFinite(n)) return `${n}%`;
  return s;
}

function loadHsNameMap() {
  if (!fs.existsSync(TARIFF_DB)) return new Map();
  const db = new DatabaseSync(TARIFF_DB, { readOnly: true });
  try {
    const yearRow = db
      .prepare(
        "SELECT MAX(year) AS y FROM tariff_item WHERE UPPER(country_code) = 'KR'",
      )
      .get();
    const year = yearRow?.y ?? 2026;
    const rows = db
      .prepare(
        `SELECT REPLACE(REPLACE(hs_code, '.', ''), '-', '') AS hs_digits, item_name
         FROM tariff_item
         WHERE year = ? AND UPPER(country_code) = 'KR' AND TRIM(IFNULL(item_name,'')) <> ''`,
      )
      .all(year);
    const map = new Map();
    for (const r of rows) {
      const key = normalizeHsDigits(r.hs_digits);
      if (key && !map.has(key)) map.set(key, str(r.item_name));
    }
    return map;
  } finally {
    db.close();
  }
}

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clip_tariff_rate (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hs_code TEXT NOT NULL,
      hs_code_display TEXT NOT NULL DEFAULT '',
      tariff_category TEXT NOT NULL DEFAULT '',
      item_name TEXT NOT NULL DEFAULT '',
      category_symbol TEXT NOT NULL DEFAULT '',
      tariff_rate TEXT NOT NULL DEFAULT '',
      amount_per_unit TEXT NOT NULL DEFAULT '',
      effective_start_date TEXT NOT NULL DEFAULT '',
      effective_end_date TEXT NOT NULL DEFAULT '',
      base_price TEXT NOT NULL DEFAULT '',
      country_apply_type TEXT NOT NULL DEFAULT '',
      usage_rate_type TEXT NOT NULL DEFAULT '',
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      source_file TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_clip_tariff_rate_hs ON clip_tariff_rate(hs_code);
    CREATE INDEX IF NOT EXISTS idx_clip_tariff_rate_item ON clip_tariff_rate(item_name);
    CREATE INDEX IF NOT EXISTS idx_clip_tariff_rate_dates ON clip_tariff_rate(effective_start_date, effective_end_date);
    CREATE INDEX IF NOT EXISTS idx_clip_tariff_rate_symbol ON clip_tariff_rate(category_symbol);
  `);
}

function parseSheet(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  if (!wb.SheetNames.includes(sheetName)) {
    throw new Error(
      `시트 「${sheetName}」 없음 (${wb.SheetNames.join(", ")})`,
    );
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
  });
  const header = rows[0].map((c) => str(c));
  const idx = (name) => header.indexOf(name);
  const hsIdx = idx("품목번호");
  const symbolIdx = idx("관세율구분");
  const rateIdx = idx("관세율");
  if (hsIdx < 0 || symbolIdx < 0 || rateIdx < 0) {
    throw new Error(`필수 열 없음: ${header.join(", ")}`);
  }
  const hsNames = loadHsNameMap();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const hs_code = normalizeHsDigits(row[hsIdx]);
    if (!hs_code) continue;
    out.push({
      hs_code,
      hs_code_display: formatHsCodeDotted(hs_code),
      tariff_category: "",
      item_name: hsNames.get(hs_code) ?? "",
      category_symbol: str(row[symbolIdx]),
      tariff_rate: formatRate(row[rateIdx]),
      amount_per_unit: str(row[idx("단위당세액")]),
      effective_start_date: formatYmd(row[idx("적용개시일")]),
      effective_end_date: formatYmd(row[idx("적용만료일")]),
      base_price: str(row[idx("기준가격")]),
      country_apply_type: str(row[idx("적용국가구분")]),
      usage_rate_type: str(row[idx("용도세율구분")]),
    });
  }
  return out;
}

function importRows(db, rows, sourceFile) {
  ensureTable(db);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM clip_tariff_rate");
    const ins = db.prepare(`
      INSERT INTO clip_tariff_rate (
        hs_code, hs_code_display, tariff_category, item_name, category_symbol,
        tariff_rate, amount_per_unit, effective_start_date, effective_end_date,
        base_price, country_apply_type, usage_rate_type, source_file
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const r of rows) {
      ins.run(
        r.hs_code,
        r.hs_code_display,
        r.tariff_category,
        r.item_name,
        r.category_symbol,
        r.tariff_rate,
        r.amount_per_unit,
        r.effective_start_date,
        r.effective_end_date,
        r.base_price,
        r.country_apply_type,
        r.usage_rate_type,
        sourceFile,
      );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

const filePath = path.resolve(process.argv[2]?.trim() || DEFAULT_XLS);
const sheetName = process.argv[3]?.trim() || DEFAULT_SHEET;
if (!fs.existsSync(filePath)) {
  console.error("파일 없음:", filePath);
  process.exit(1);
}

console.log("parse", filePath, "sheet", sheetName);
const rows = parseSheet(filePath, sheetName);
console.log("rows", rows.length);

const db = new DatabaseSync(path.resolve(DEFAULT_DB));
try {
  importRows(db, rows, filePath);
  const count = db.prepare("SELECT COUNT(*) AS n FROM clip_tariff_rate").get().n;
  console.log("imported", count, "into", DEFAULT_DB);
} finally {
  db.close();
}
