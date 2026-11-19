import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  formatClipCustomsChiefHsSgn,
  normalizeClipCustomsChiefHsQuery,
} from "@/app/lib/clip-customs-chief-shared";
import { extractHsCodeFromStdCode } from "@/app/lib/clip-standard-product-code-server";
import {
  CLIP_PRIOR_TAX_SECURITY_PRICE_SORT_KEYS,
  DEFAULT_CLIP_PRIOR_TAX_SECURITY_PRICE_BASE_DATE,
  resolveClipPriorTaxSecurityPriceBaseDate,
  type ClipPriorTaxSecurityPriceListRow,
  type ClipPriorTaxSecurityPriceQueryParams,
  type ClipPriorTaxSecurityPriceSortKey,
} from "@/app/lib/clip-prior-tax-security-price-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export {
  CLIP_PRIOR_TAX_SECURITY_PRICE_SORT_KEYS,
  type ClipPriorTaxSecurityPriceListRow,
  type ClipPriorTaxSecurityPriceQueryParams,
  type ClipPriorTaxSecurityPriceSortKey,
} from "@/app/lib/clip-prior-tax-security-price-shared";

export const DEFAULT_CLIP_PRIOR_TAX_SECURITY_PRICE_EXCEL =
  "C:/SQLiteDB/excel/사전세액심사 담보기준가격_2026092520009294.xls";

export type PriorTaxSecurityPriceImportRow = {
  seq_no: number;
  std_code: string;
  hs_code: string;
  std_item_name: string;
  std_spec: string;
  security_price_usd: number;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

export function formatPriorTaxSecurityPriceDisplay(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Math.round(value).toLocaleString("en-US");
}

export function parsePriorTaxSecurityPriceValue(raw: unknown): number {
  const cleaned = str(raw).replace(/,/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS clip_preassess_security_price (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  base_date TEXT NOT NULL DEFAULT '',
  seq_no INTEGER NOT NULL,
  std_code TEXT NOT NULL,
  hs_code TEXT NOT NULL DEFAULT '',
  std_item_name TEXT NOT NULL DEFAULT '',
  std_spec TEXT NOT NULL DEFAULT '',
  security_price_usd REAL NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  source_file TEXT
);
CREATE INDEX IF NOT EXISTS idx_clip_pasp_base ON clip_preassess_security_price(base_date);
CREATE INDEX IF NOT EXISTS idx_clip_pasp_hs ON clip_preassess_security_price(hs_code);
CREATE INDEX IF NOT EXISTS idx_clip_pasp_std ON clip_preassess_security_price(std_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clip_pasp_base_seq ON clip_preassess_security_price(base_date, seq_no);
`;

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return rows.some((row) => row.name === column);
}

function migrateClipPriorTaxSecurityPriceBaseDate(db: DatabaseSync): void {
  if (!hasColumn(db, "clip_preassess_security_price", "base_date")) {
    stmtRun(
      db,
      "ALTER TABLE clip_preassess_security_price ADD COLUMN base_date TEXT NOT NULL DEFAULT ''",
    );
  }
  stmtRun(
    db,
    `UPDATE clip_preassess_security_price
     SET base_date = ?
     WHERE base_date = '' OR base_date IS NULL`,
    [DEFAULT_CLIP_PRIOR_TAX_SECURITY_PRICE_BASE_DATE],
  );
  stmtRun(
    db,
    `UPDATE clip_preassess_security_price
     SET base_date = ?
     WHERE base_date = '2026-09-11'`,
    [DEFAULT_CLIP_PRIOR_TAX_SECURITY_PRICE_BASE_DATE],
  );
  stmtRun(db, "DROP INDEX IF EXISTS idx_clip_pasp_seq");
  stmtRun(
    db,
    "CREATE INDEX IF NOT EXISTS idx_clip_pasp_base ON clip_preassess_security_price(base_date)",
  );
  stmtRun(
    db,
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_clip_pasp_base_seq ON clip_preassess_security_price(base_date, seq_no)",
  );
}

export function ensureClipPriorTaxSecurityPriceTable(db: DatabaseSync): void {
  executeSql(db, CREATE_TABLE_SQL);
  migrateClipPriorTaxSecurityPriceBaseDate(db);
}

export function listClipPriorTaxSecurityPriceBaseDates(
  db: DatabaseSync,
): string[] {
  return db
    .prepare(
      `SELECT DISTINCT base_date FROM clip_preassess_security_price
       WHERE base_date <> ''
       ORDER BY base_date DESC`,
    )
    .all()
    .map((row) => str((row as Record<string, unknown>).base_date))
    .filter(Boolean);
}

export function resolveDefaultClipPriorTaxSecurityPriceBaseDate(
  db: DatabaseSync,
): string {
  const publicationDate = resolveClipPriorTaxSecurityPriceBaseDate(new Date());
  const dates = listClipPriorTaxSecurityPriceBaseDates(db);
  if (dates.includes(publicationDate)) return publicationDate;
  return dates[0] ?? publicationDate;
}

export function openClipPriorTaxSecurityPriceDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p);
  ensureClipPriorTaxSecurityPriceTable(db);
  return db;
}

export function countClipPriorTaxSecurityPrices(
  db: DatabaseSync,
  baseDate?: string,
): number {
  const date = str(baseDate);
  const row = date
    ? (db
        .prepare(
          "SELECT COUNT(*) AS n FROM clip_preassess_security_price WHERE base_date = ?",
        )
        .get(date) as { n: number })
    : (db
        .prepare("SELECT COUNT(*) AS n FROM clip_preassess_security_price")
        .get() as { n: number });
  return num(row?.n);
}

function normalizeSort(
  sort: string | null | undefined,
): ClipPriorTaxSecurityPriceSortKey {
  const s = (sort ?? "seq_no").trim();
  return (CLIP_PRIOR_TAX_SECURITY_PRICE_SORT_KEYS as readonly string[]).includes(
    s,
  )
    ? (s as ClipPriorTaxSecurityPriceSortKey)
    : "seq_no";
}

function normalizeDir(d: string | null | undefined): "ASC" | "DESC" {
  return d?.trim().toLowerCase() === "desc" ? "DESC" : "ASC";
}

const SORT_SQL: Record<ClipPriorTaxSecurityPriceSortKey, string> = {
  seq_no: "seq_no",
  std_code: "std_code",
  std_item_name: "std_item_name",
  std_spec: "std_spec",
  security_price_usd: "security_price_usd",
};

function mapListRow(row: Record<string, unknown>): ClipPriorTaxSecurityPriceListRow {
  const hsCode = str(row.hs_code);
  const price = num(row.security_price_usd);
  return {
    id: num(row.id),
    seq_no: num(row.seq_no),
    std_code: str(row.std_code),
    hs_code: hsCode,
    hs_code_display: formatClipCustomsChiefHsSgn(hsCode, ""),
    std_item_name: str(row.std_item_name),
    std_spec: str(row.std_spec),
    security_price_usd: price,
    security_price_display: formatPriorTaxSecurityPriceDisplay(price),
  };
}

export function queryClipPriorTaxSecurityPrices(
  db: DatabaseSync,
  params: ClipPriorTaxSecurityPriceQueryParams,
): { rows: ClipPriorTaxSecurityPriceListRow[]; total: number } {
  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const baseDate = resolveClipPriorTaxSecurityPriceBaseDate(
    str(params.baseDate) || new Date(),
  );
  const hs = normalizeClipCustomsChiefHsQuery(params.hsCode);
  const item = str(params.itemName);
  const sort = normalizeSort(params.sort);
  const dir = normalizeDir(params.sort_dir);

  const where: string[] = ["base_date = ?"];
  const bind: unknown[] = [baseDate];

  if (hs) {
    where.push("(hs_code LIKE ? OR std_code LIKE ?)");
    bind.push(`${hs}%`, `${hs}%`);
  }
  if (item) {
    where.push(
      "(std_item_name LIKE ? OR std_spec LIKE ? OR std_code LIKE ?)",
    );
    const like = `%${item}%`;
    bind.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM clip_preassess_security_price ${whereSql}`)
    .get(...bind) as { n: number };
  const total = num(totalRow?.n);

  const orderCol = SORT_SQL[sort];
  const rows = db
    .prepare(
      `SELECT id, seq_no, std_code, hs_code, std_item_name, std_spec, security_price_usd
       FROM clip_preassess_security_price
       ${whereSql}
       ORDER BY ${orderCol} ${dir}, id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, (page - 1) * pageSize)
    .map((row) => mapListRow(row as Record<string, unknown>));

  return { rows, total };
}

export function parsePriorTaxSecurityPriceExcel(
  buffer: Buffer,
): PriorTaxSecurityPriceImportRow[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];

  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i] ?? [];
    if (str(row[0]) === "번호" && str(row[1]).includes("규격")) {
      headerIdx = i;
      break;
    }
  }
  const start = headerIdx >= 0 ? headerIdx + 1 : 2;

  const out: PriorTaxSecurityPriceImportRow[] = [];
  for (let i = start; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const stdCode = str(row[1]);
    if (!stdCode) continue;
    const seqNo = num(row[0]) || out.length + 1;
    out.push({
      seq_no: seqNo,
      std_code: stdCode,
      hs_code: extractHsCodeFromStdCode(stdCode),
      std_item_name: str(row[2]),
      std_spec: str(row[3]),
      security_price_usd: parsePriorTaxSecurityPriceValue(row[4]),
    });
  }
  return out;
}

export function importPriorTaxSecurityPriceRows(
  db: DatabaseSync,
  rows: PriorTaxSecurityPriceImportRow[],
  sourceFile: string,
  baseDate: string,
): { imported: number; base_date: string } {
  if (rows.length === 0) {
    throw new Error("가져올 데이터 행이 없습니다.");
  }

  const date = resolveClipPriorTaxSecurityPriceBaseDate(
    str(baseDate) || new Date(),
  );
  if (!date) {
    throw new Error("기준일자가 필요합니다.");
  }

  ensureClipPriorTaxSecurityPriceTable(db);
  stmtRun(db, "BEGIN IMMEDIATE");
  try {
    stmtRun(db, "DELETE FROM clip_preassess_security_price WHERE base_date = ?", [
      date,
    ]);
    const ins = db.prepare(`
      INSERT INTO clip_preassess_security_price
        (base_date, seq_no, std_code, hs_code, std_item_name, std_spec, security_price_usd, imported_at, source_file)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    `);
    for (const r of rows) {
      ins.run(
        date,
        r.seq_no,
        r.std_code,
        r.hs_code,
        r.std_item_name,
        r.std_spec,
        r.security_price_usd,
        sourceFile,
      );
    }
    stmtRun(db, "COMMIT");
    return { imported: rows.length, base_date: date };
  } catch (e) {
    stmtRun(db, "ROLLBACK");
    throw e;
  }
}

export function importPriorTaxSecurityPriceFromBuffer(
  buffer: Buffer,
  sourceLabel: string,
  baseDate: string,
): { imported: number; base_date: string } {
  const rows = parsePriorTaxSecurityPriceExcel(buffer);
  const db = openClipPriorTaxSecurityPriceDb();
  try {
    return importPriorTaxSecurityPriceRows(db, rows, sourceLabel, baseDate);
  } finally {
    db.close();
  }
}

export function importPriorTaxSecurityPriceFromFile(
  filePath: string,
  baseDate?: string,
): { imported: number; dbPath: string; base_date: string } {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`엑셀 파일이 없습니다: ${resolved}`);
  }
  const buffer = fs.readFileSync(resolved);
  const rows = parsePriorTaxSecurityPriceExcel(buffer);
  const date = resolveClipPriorTaxSecurityPriceBaseDate(
    str(baseDate) || new Date(),
  );
  const db = openClipPriorTaxSecurityPriceDb();
  try {
    const { imported, base_date } = importPriorTaxSecurityPriceRows(
      db,
      rows,
      resolved,
      date,
    );
    return { imported, dbPath: getSmartLawSqliteDbPath(), base_date };
  } finally {
    db.close();
  }
}

export function ensureDefaultPriorTaxSecurityPriceImported(
  db: DatabaseSync,
): boolean {
  const defaultDate = resolveClipPriorTaxSecurityPriceBaseDate(new Date());
  if (countClipPriorTaxSecurityPrices(db, defaultDate) > 0) return false;
  const p = resolveDefaultPriorTaxSecurityPriceExcelPath();
  if (!fs.existsSync(p)) return false;
  const buffer = fs.readFileSync(p);
  const rows = parsePriorTaxSecurityPriceExcel(buffer);
  importPriorTaxSecurityPriceRows(db, rows, p, defaultDate);
  return true;
}

export function exportPriorTaxSecurityPriceExcel(
  db: DatabaseSync,
  params: Pick<
    ClipPriorTaxSecurityPriceQueryParams,
    "baseDate" | "hsCode" | "itemName"
  >,
): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const { rows } = queryClipPriorTaxSecurityPrices(db, {
    page: 1,
    pageSize: 100000,
    baseDate: params.baseDate,
    hsCode: params.hsCode,
    itemName: params.itemName,
    sort: "seq_no",
    sort_dir: "asc",
  });

  const data: (string | number)[][] = [
    ["담보기준가격", "", "", "", ""],
    ["번호", "표준품명-규격코드", "표준품명", "표준규격", "담보기준가격(USD/TON)"],
    ...rows.map((r) => [
      r.seq_no,
      r.std_code,
      r.std_item_name,
      r.std_spec,
      r.security_price_display,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "사전세액심사 담보기준가격");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function resolveDefaultPriorTaxSecurityPriceExcelPath(): string {
  return (
    process.env.CLIP_PRIOR_TAX_SECURITY_PRICE_EXCEL_PATH?.trim() ||
    DEFAULT_CLIP_PRIOR_TAX_SECURITY_PRICE_EXCEL
  );
}
