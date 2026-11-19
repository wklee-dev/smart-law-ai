import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import {
  CLIP_STANDARD_PRODUCT_CODE_SORT_KEYS,
  type ClipStandardProductCodeListRow,
  type ClipStandardProductCodeQueryParams,
  type ClipStandardProductCodeSortKey,
} from "@/app/lib/clip-standard-product-code-shared";

export {
  type ClipStandardProductCodeListRow,
  type ClipStandardProductCodeQueryParams,
  type ClipStandardProductCodeSortKey,
} from "@/app/lib/clip-standard-product-code-shared";

export const DEFAULT_CLIP_STANDARD_PRODUCT_EXCEL =
  "C:/SQLiteDB/excel/표준품명‧규격 코드_2026092520009348.xls";

export type StandardProductCodeImportRow = {
  seq_no: number;
  std_code: string;
  hs_code: string;
  item_name: string;
  std_item_name: string;
  std_spec: string;
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

export function extractHsCodeFromStdCode(stdCode: string): string {
  const m = stdCode.trim().match(/^(\d+)/);
  return m ? m[1]! : stdCode.trim();
}

const CREATE_TABLE_SQL = `
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
`;

export function ensureClipStandardProductCodeTable(db: DatabaseSync): void {
  executeSql(db, CREATE_TABLE_SQL);
}

export function openClipStandardProductCodeDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  const db = new DatabaseSync(p);
  ensureClipStandardProductCodeTable(db);
  return db;
}

export function countClipStandardProductCodes(db: DatabaseSync): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM clip_standard_product_code")
    .get() as { n: number };
  return num(row?.n);
}

function normalizeSort(sort: string | null | undefined): ClipStandardProductCodeSortKey {
  const s = (sort ?? "seq_no").trim();
  return (CLIP_STANDARD_PRODUCT_CODE_SORT_KEYS as readonly string[]).includes(s)
    ? (s as ClipStandardProductCodeSortKey)
    : "seq_no";
}

function normalizeDir(d: string | null | undefined): "ASC" | "DESC" {
  return d?.trim().toLowerCase() === "desc" ? "DESC" : "ASC";
}

const SORT_SQL: Record<ClipStandardProductCodeSortKey, string> = {
  seq_no: "seq_no",
  std_code: "std_code",
  item_name: "item_name",
  std_item_name: "std_item_name",
  std_spec: "std_spec",
};

export function queryClipStandardProductCodes(
  db: DatabaseSync,
  params: ClipStandardProductCodeQueryParams,
): { rows: ClipStandardProductCodeListRow[]; total: number } {
  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const hs = str(params.hsCode);
  const item = str(params.itemName);
  const sort = normalizeSort(params.sort);
  const dir = normalizeDir(params.sort_dir);

  const where: string[] = [];
  const bind: unknown[] = [];

  if (hs) {
    where.push("(hs_code LIKE ? OR std_code LIKE ?)");
    bind.push(`${hs}%`, `${hs}%`);
  }
  if (item) {
    where.push(
      "(item_name LIKE ? OR std_item_name LIKE ? OR std_spec LIKE ? OR std_code LIKE ?)",
    );
    const like = `%${item}%`;
    bind.push(like, like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM clip_standard_product_code ${whereSql}`)
    .get(...bind) as { n: number };
  const total = num(totalRow?.n);

  const orderCol = SORT_SQL[sort];
  const rows = db
    .prepare(
      `SELECT id, seq_no, std_code, hs_code, item_name, std_item_name, std_spec
       FROM clip_standard_product_code
       ${whereSql}
       ORDER BY ${orderCol} ${dir}, id ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, (page - 1) * pageSize) as ClipStandardProductCodeListRow[];

  return { rows, total };
}

/** 엑셀 버퍼 → 행 (1행 제목·2행 헤더 이후) */
export function parseStandardProductCodeExcel(
  buffer: Buffer,
): StandardProductCodeImportRow[] {
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

  const out: StandardProductCodeImportRow[] = [];
  for (let i = start; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const stdCode = str(row[1]);
    if (!stdCode) continue;
    const seqNo = num(row[0]) || out.length + 1;
    out.push({
      seq_no: seqNo,
      std_code: stdCode,
      hs_code: extractHsCodeFromStdCode(stdCode),
      item_name: str(row[2]),
      std_item_name: str(row[3]),
      std_spec: str(row[4]),
    });
  }
  return out;
}

export function importStandardProductCodeRows(
  db: DatabaseSync,
  rows: StandardProductCodeImportRow[],
  sourceFile: string,
): { imported: number } {
  if (rows.length === 0) {
    throw new Error("가져올 데이터 행이 없습니다.");
  }

  ensureClipStandardProductCodeTable(db);
  stmtRun(db, "BEGIN IMMEDIATE");
  try {
    stmtRun(db, "DELETE FROM clip_standard_product_code");
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

export function importStandardProductCodeFromFile(
  filePath: string,
): { imported: number; dbPath: string } {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`엑셀 파일이 없습니다: ${resolved}`);
  }
  const buffer = fs.readFileSync(resolved);
  const rows = parseStandardProductCodeExcel(buffer);
  const db = openClipStandardProductCodeDb();
  try {
    const { imported } = importStandardProductCodeRows(db, rows, resolved);
    return { imported, dbPath: getSmartLawSqliteDbPath() };
  } finally {
    db.close();
  }
}

export function importStandardProductCodeFromBuffer(
  buffer: Buffer,
  sourceLabel: string,
): { imported: number } {
  const rows = parseStandardProductCodeExcel(buffer);
  const db = openClipStandardProductCodeDb();
  try {
    return importStandardProductCodeRows(db, rows, sourceLabel);
  } finally {
    db.close();
  }
}

export function exportStandardProductCodeExcel(
  db: DatabaseSync,
  params: Pick<ClipStandardProductCodeQueryParams, "hsCode" | "itemName">,
): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  const { rows } = queryClipStandardProductCodes(db, {
    page: 1,
    pageSize: 100000,
    hsCode: params.hsCode,
    itemName: params.itemName,
    sort: "seq_no",
    sort_dir: "asc",
  });

  const data: (string | number)[][] = [
    ["표준품명‧규격 코드", "", "", "", ""],
    ["번호", "표준품명·규격코드", "품명", "표준품명", "표준규격"],
    ...rows.map((r) => [
      r.seq_no,
      r.std_code,
      r.item_name,
      r.std_item_name,
      r.std_spec,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "표준품명‧규격 코드");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function resolveDefaultStandardProductExcelPath(): string {
  return (
    process.env.CLIP_STANDARD_PRODUCT_EXCEL_PATH?.trim() ||
    DEFAULT_CLIP_STANDARD_PRODUCT_EXCEL
  );
}
