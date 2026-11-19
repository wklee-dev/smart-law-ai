import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { formatHsCodeDotted } from "@/app/tariff/lib/tariff-hs-display";
import { ensureBgwanseTable } from "@/app/lib/bgwanse-server";
import {
  openSmartLawDb,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import {
  CLIP_TARIFF_RATE_SORT_KEYS,
  type ClipTariffRateListRow,
  type ClipTariffRateQueryParams,
  type ClipTariffRateSortKey,
} from "@/app/lib/clip-tariff-rate-shared";

export {
  type ClipTariffRateListRow,
  type ClipTariffRateQueryParams,
  type ClipTariffRateSortKey,
} from "@/app/lib/clip-tariff-rate-shared";

export const DEFAULT_CLIP_TARIFF_RATE_EXCEL =
  "C:/SQLiteDB/excel/관세율(2026).xlsx";
export const CLIP_TARIFF_RATE_SHEET = "7.1";
const DEFAULT_TARIFF_DB = "C:/SQLiteDB/smart_law_ai.db";

export type TariffRateImportRow = {
  hs_code: string;
  hs_code_display: string;
  tariff_category: string;
  item_name: string;
  category_symbol: string;
  tariff_rate: string;
  amount_per_unit: string;
  effective_start_date: string;
  effective_end_date: string;
  base_price: string;
  country_apply_type: string;
  usage_rate_type: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
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

function normalizeHsDigits(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    return String(Math.trunc(v)).padStart(10, "0");
  }
  return str(v).replace(/\D/g, "");
}

function formatYmd(v: unknown): string {
  const raw = str(v).replace(/\D/g, "");
  if (raw.length === 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return str(v);
}

function formatRate(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const s = str(v);
  if (s.endsWith("%")) return s;
  const n = Number(v);
  if (Number.isFinite(n)) return `${n}%`;
  return s;
}

const CREATE_TABLE_SQL = `
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
`;

export function ensureClipTariffRateTable(db: DatabaseSync): void {
  executeSql(db, CREATE_TABLE_SQL);
}

/** import/write 전용 — 로컬 SQLite */
export function openClipTariffRateDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p);
  ensureClipTariffRateTable(db);
  ensureBgwanseTable(db);
  return db;
}

/** UI 조회용 */
export async function openClipTariffRateQueryDb(): Promise<SmartLawDb> {
  return openSmartLawDb(true);
}

export async function countClipTariffRates(db: SmartLawDb): Promise<number> {
  const row = await db.get("SELECT COUNT(*) AS n FROM clip_tariff_rate");
  return num(row?.n);
}

function getTariffDbPath(): string {
  return process.env.TARIFF_SQLITE_DB_PATH?.trim() || DEFAULT_TARIFF_DB;
}

function loadHsNameMap(): Map<string, string> {
  const p = path.resolve(getTariffDbPath());
  if (!fs.existsSync(p)) return new Map();
  const db = new DatabaseSync(p, { readOnly: true });
  try {
    const yearRow = db
      .prepare(
        `SELECT MAX(year) AS y FROM tariff_item WHERE UPPER(country_code) = 'KR'`,
      )
      .get() as { y: number | null };
    const year = yearRow?.y ?? 2026;
    const rows = db
      .prepare(
        `SELECT REPLACE(REPLACE(hs_code, '.', ''), '-', '') AS hs_digits, item_name
         FROM tariff_item
         WHERE year = ? AND UPPER(country_code) = 'KR' AND TRIM(IFNULL(item_name,'')) <> ''`,
      )
      .all(year) as { hs_digits: string; item_name: string }[];
    const map = new Map<string, string>();
    for (const r of rows) {
      const key = normalizeHsDigits(r.hs_digits);
      if (key && !map.has(key)) map.set(key, str(r.item_name));
    }
    return map;
  } finally {
    db.close();
  }
}

export function parseTariffRateExcelSheet(
  buffer: Buffer,
  sheetName: string = CLIP_TARIFF_RATE_SHEET,
): TariffRateImportRow[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  if (!wb.SheetNames.includes(sheetName)) {
    throw new Error(
      `시트 「${sheetName}」을 찾을 수 없습니다. (${wb.SheetNames.join(", ")})`,
    );
  }
  const ws = wb.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (rows.length < 2) {
    throw new Error("엑셀 데이터 행이 없습니다.");
  }

  const header = rows[0]!.map((c) => str(c));
  const idx = (name: string) => header.indexOf(name);
  const hsIdx = idx("품목번호");
  const symbolIdx = idx("관세율구분");
  const rateIdx = idx("관세율");
  const unitIdx = idx("단위당세액");
  const baseIdx = idx("기준가격");
  const countryIdx = idx("적용국가구분");
  const usageIdx = idx("용도세율구분");
  const startIdx = idx("적용개시일");
  const endIdx = idx("적용만료일");

  if (hsIdx < 0 || symbolIdx < 0 || rateIdx < 0) {
    throw new Error(
      `필수 열(품목번호·관세율구분·관세율)을 찾을 수 없습니다: ${header.join(", ")}`,
    );
  }

  const hsNames = loadHsNameMap();
  const out: TariffRateImportRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const hs_code = normalizeHsDigits(row[hsIdx]);
    if (!hs_code) continue;
    const category_symbol = str(row[symbolIdx]);
    out.push({
      hs_code,
      hs_code_display: formatHsCodeDotted(hs_code),
      tariff_category: "",
      item_name: hsNames.get(hs_code) ?? "",
      category_symbol,
      tariff_rate: formatRate(row[rateIdx]),
      amount_per_unit: str(row[unitIdx]),
      effective_start_date: formatYmd(row[startIdx]),
      effective_end_date: formatYmd(row[endIdx]),
      base_price: str(row[baseIdx]),
      country_apply_type: str(row[countryIdx]),
      usage_rate_type: str(row[usageIdx]),
    });
  }
  return out;
}

export function importTariffRateRows(
  db: DatabaseSync,
  rows: TariffRateImportRow[],
  sourceFile: string,
): { imported: number } {
  if (rows.length === 0) {
    throw new Error("가져올 데이터 행이 없습니다.");
  }
  ensureClipTariffRateTable(db);
  stmtRun(db, "BEGIN IMMEDIATE");
  try {
    stmtRun(db, "DELETE FROM clip_tariff_rate");
    const ins = db.prepare(`
      INSERT INTO clip_tariff_rate (
        hs_code, hs_code_display, tariff_category, item_name, category_symbol,
        tariff_rate, amount_per_unit, effective_start_date, effective_end_date,
        base_price, country_apply_type, usage_rate_type, source_file
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const batch = 1000;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
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
      if (i > 0 && i % batch === 0) {
        stmtRun(db, "COMMIT");
        stmtRun(db, "BEGIN IMMEDIATE");
      }
    }
    stmtRun(db, "COMMIT");
    return { imported: rows.length };
  } catch (e) {
    stmtRun(db, "ROLLBACK");
    throw e;
  }
}

export function importTariffRateFromFile(
  filePath: string,
  sheetName: string = CLIP_TARIFF_RATE_SHEET,
): { imported: number; dbPath: string } {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`엑셀 파일이 없습니다: ${resolved}`);
  }
  const buffer = fs.readFileSync(resolved);
  const rows = parseTariffRateExcelSheet(buffer, sheetName);
  const db = openClipTariffRateDb();
  try {
    const { imported } = importTariffRateRows(db, rows, resolved);
    return { imported, dbPath: getSmartLawSqliteDbPath() };
  } finally {
    db.close();
  }
}

export function importTariffRateFromBuffer(
  buffer: Buffer,
  sourceLabel: string,
  sheetName: string = CLIP_TARIFF_RATE_SHEET,
): { imported: number } {
  const rows = parseTariffRateExcelSheet(buffer, sheetName);
  const db = openClipTariffRateDb();
  try {
    return importTariffRateRows(db, rows, sourceLabel);
  } finally {
    db.close();
  }
}

function normalizeSort(sort: string | null | undefined): ClipTariffRateSortKey {
  const s = (sort ?? "hs_code").trim();
  return (CLIP_TARIFF_RATE_SORT_KEYS as readonly string[]).includes(s)
    ? (s as ClipTariffRateSortKey)
    : "hs_code";
}

function normalizeDir(d: string | null | undefined): "ASC" | "DESC" {
  return d?.trim().toLowerCase() === "desc" ? "DESC" : "ASC";
}

const SORT_SQL: Record<ClipTariffRateSortKey, string> = {
  tariff_category: "COALESCE(b.Gwanse_semyung, '')",
  hs_code: "hs_code",
  item_name: "item_name",
  category_symbol: "category_symbol",
  tariff_rate: "tariff_rate",
  amount_per_unit: "amount_per_unit",
  effective_start_date: "effective_start_date",
  effective_end_date: "effective_end_date",
};

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function queryClipTariffRates(
  db: SmartLawDb,
  params: ClipTariffRateQueryParams,
): Promise<{ rows: ClipTariffRateListRow[]; total: number }> {
  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const sort = normalizeSort(params.sort);
  const dir = normalizeDir(params.sort_dir);

  const where: string[] = ["1=1"];
  const bind: unknown[] = [];

  const hsQ = str(params.hsCode).replace(/\D/g, "");
  if (hsQ) {
    where.push("r.hs_code LIKE ?");
    bind.push(`${hsQ}%`);
  }

  const itemQ = str(params.itemName);
  if (itemQ) {
    where.push("r.item_name LIKE ?");
    bind.push(`%${itemQ}%`);
  }

  const section = str(params.hsSection).replace(/\D/g, "");
  if (section) {
    where.push("r.hs_code LIKE ?");
    bind.push(`${section}%`);
  }

  if (!params.includeHistory) {
    const today = todayYmd();
    where.push(
      "(r.effective_start_date = '' OR r.effective_start_date <= ?)",
    );
    bind.push(today);
    where.push("(r.effective_end_date = '' OR r.effective_end_date >= ?)");
    bind.push(today);
  }

  const whereSql = where.join(" AND ");
  const totalRow = await db.get(
    `SELECT COUNT(*) AS n FROM clip_tariff_rate r WHERE ${whereSql}`,
    bind,
  );
  const total = num(totalRow?.n);

  const offset = (page - 1) * pageSize;
  const orderCol = SORT_SQL[sort];
  const dataRows = await db.all(
    `SELECT r.id, COALESCE(b.Gwanse_semyung, '') AS tariff_category,
            r.hs_code, r.hs_code_display, r.item_name, r.category_symbol,
            r.tariff_rate, r.amount_per_unit, r.effective_start_date, r.effective_end_date
     FROM clip_tariff_rate r
     LEFT JOIN bgwanse b ON b.Gwanse_code = r.category_symbol
     WHERE ${whereSql}
     ORDER BY ${orderCol} ${dir}, r.id ASC
     LIMIT ? OFFSET ?`,
    [...bind, pageSize, offset],
  );

  const rows: ClipTariffRateListRow[] = dataRows.map((r) => ({
    id: num(r.id),
    tariff_category: str(r.tariff_category),
    hs_code: str(r.hs_code),
    hs_code_display: str(r.hs_code_display) || formatHsCodeDotted(str(r.hs_code)),
    item_name: str(r.item_name),
    category_symbol: str(r.category_symbol),
    tariff_rate: str(r.tariff_rate),
    amount_per_unit: str(r.amount_per_unit),
    effective_start_date: str(r.effective_start_date),
    effective_end_date: str(r.effective_end_date),
  }));

  return { rows, total };
}

export function resolveDefaultTariffRateExcelPath(): string {
  return (
    process.env.CLIP_TARIFF_RATE_EXCEL_PATH?.trim() ||
    DEFAULT_CLIP_TARIFF_RATE_EXCEL
  );
}
