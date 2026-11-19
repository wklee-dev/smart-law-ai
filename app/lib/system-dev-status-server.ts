import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as XLSX from "xlsx";
import {
  DEFAULT_SYSTEM_DEV_STATUS_YEAR,
  SYSTEM_DEV_STATUS_FIELD_LABELS,
  SYSTEM_DEV_STATUS_HISTORY_FIELD_KEYS,
  formatSystemDevProgress,
  type SystemDevStatusHistoryAction,
  type SystemDevStatusHistoryChange,
  type SystemDevStatusHistoryEntry,
  type SystemDevStatusItem,
} from "@/app/shared/system-dev-status-types";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import { preferCDrive } from "@/app/lib/drive-fallback";

export const DEFAULT_SYSTEM_DEV_STATUS_EXCEL_PATH = preferCDrive(
  "C:/HJCustoms/NEW CAS/4세대 CAS/1.진행사항/관세법인한주 시스템 WBS 2025 V2.xlsx",
);

export const DEFAULT_SYSTEM_DEV_STATUS_SHEET = "시스템개발현황 20251016";

const DATA_START_ROW_INDEX = 3;

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS system_dev_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL DEFAULT 2025,
  system_name TEXT NOT NULL DEFAULT '',
  task_no TEXT NOT NULL DEFAULT '',
  work_area TEXT NOT NULL DEFAULT '',
  feature_type TEXT NOT NULL DEFAULT '',
  menu_name TEXT NOT NULL DEFAULT '',
  feature_name TEXT NOT NULL DEFAULT '',
  feature_detail TEXT NOT NULL DEFAULT '',
  request_dept TEXT NOT NULL DEFAULT '',
  requester TEXT NOT NULL DEFAULT '',
  dev_owner TEXT NOT NULL DEFAULT '',
  work_frequency TEXT NOT NULL DEFAULT '',
  risk TEXT NOT NULL DEFAULT '',
  customer_request_level TEXT NOT NULL DEFAULT '',
  eval_score TEXT NOT NULL DEFAULT '',
  dev_difficulty TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT '',
  request_date TEXT NOT NULL DEFAULT '',
  expected_dev_days TEXT NOT NULL DEFAULT '',
  plan_start_date TEXT NOT NULL DEFAULT '',
  plan_end_date TEXT NOT NULL DEFAULT '',
  actual_start_date TEXT NOT NULL DEFAULT '',
  actual_end_date TEXT NOT NULL DEFAULT '',
  test_date TEXT NOT NULL DEFAULT '',
  test_complete_date TEXT NOT NULL DEFAULT '',
  production_apply_date TEXT NOT NULL DEFAULT '',
  progress REAL,
  delay_reason TEXT NOT NULL DEFAULT '',
  source_sheet TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_system_dev_status_task_no ON system_dev_status(task_no);
CREATE INDEX IF NOT EXISTS idx_system_dev_status_system ON system_dev_status(system_name);
CREATE INDEX IF NOT EXISTS idx_system_dev_status_sort ON system_dev_status(sort_order);
CREATE INDEX IF NOT EXISTS idx_system_dev_status_year ON system_dev_status(year);
`;

const CREATE_HISTORY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS system_dev_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status_id INTEGER NOT NULL,
  year INTEGER NOT NULL,
  task_no TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  changes_json TEXT NOT NULL DEFAULT '[]',
  changed_at TEXT NOT NULL DEFAULT '',
  changed_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_system_dev_status_history_status
  ON system_dev_status_history(status_id, changed_at DESC);
`;

export { DEFAULT_SYSTEM_DEV_STATUS_YEAR };

type SystemDevStatusHistoryRow = {
  id: number;
  status_id: number;
  year: number;
  task_no: string;
  action: string;
  changes_json: string;
  changed_at: string;
  changed_by: string;
};

export type SystemDevStatusWriteOptions = {
  changedBy?: string;
};

type SystemDevStatusRow = {
  id: number;
  year: number;
  system_name: string;
  task_no: string;
  work_area: string;
  feature_type: string;
  menu_name: string;
  feature_name: string;
  feature_detail: string;
  request_dept: string;
  requester: string;
  dev_owner: string;
  work_frequency: string;
  risk: string;
  customer_request_level: string;
  eval_score: string;
  dev_difficulty: string;
  priority: string;
  request_date: string;
  expected_dev_days: string;
  plan_start_date: string;
  plan_end_date: string;
  actual_start_date: string;
  actual_end_date: string;
  test_date: string;
  test_complete_date: string;
  production_apply_date: string;
  progress: number | null;
  delay_reason: string;
  source_sheet: string;
  sort_order: number;
  updated_at: string;
};

function stmtRun(db: DatabaseSync, sql: string, params: unknown[] = []) {
  return db.prepare(sql).run(...params);
}

function stmtGet<T>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

function stmtAll<T>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T[] {
  return (db.prepare(sql).all(...params) as T[]) ?? [];
}

function executeSql(db: DatabaseSync, sql: string): void {
  const statements = sql
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  for (const statement of statements) {
    stmtRun(db, statement);
  }
}

function openDb(readOnly: boolean): DatabaseSync {
  const p = path.resolve(getSmartLawSqliteDbPath().trim());
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(p) && !readOnly) {
    const init = new DatabaseSync(p);
    init.close();
  }
  if (!fs.existsSync(p)) {
    throw new Error(`SQLite DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly });
}

export function getSystemDevStatusDbPath(): string {
  return path.resolve(getSmartLawSqliteDbPath().trim());
}

function migrateSystemDevStatusSchema(db: DatabaseSync): void {
  const cols = stmtAll<{ name: string }>(db, "PRAGMA table_info(system_dev_status)");
  if (cols.length > 0 && !cols.some((c) => c.name === "year")) {
    stmtRun(
      db,
      "ALTER TABLE system_dev_status ADD COLUMN year INTEGER NOT NULL DEFAULT 2025",
    );
  }
  stmtRun(
    db,
    "UPDATE system_dev_status SET year = 2025 WHERE year IS NULL OR year = 0",
  );
  for (const col of [
    "test_date",
    "test_complete_date",
    "production_apply_date",
  ] as const) {
    const info = stmtAll<{ name: string }>(
      db,
      "PRAGMA table_info(system_dev_status)",
    );
    if (info.length > 0 && !info.some((c) => c.name === col)) {
      stmtRun(
        db,
        `ALTER TABLE system_dev_status ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`,
      );
    }
  }
  try {
    stmtRun(db, "DROP INDEX IF EXISTS idx_system_dev_status_task_no");
    stmtRun(
      db,
      "CREATE INDEX IF NOT EXISTS idx_system_dev_status_task_no ON system_dev_status(task_no)",
    );
    stmtRun(
      db,
      "CREATE INDEX IF NOT EXISTS idx_system_dev_status_year ON system_dev_status(year)",
    );
  } catch {
    // ignore
  }
}

export function ensureSystemDevStatusTable(db: DatabaseSync): void {
  executeSql(db, CREATE_TABLE_SQL);
  migrateSystemDevStatusSchema(db);
  executeSql(db, CREATE_HISTORY_TABLE_SQL);
}

function historyFieldDisplay(
  key: (typeof SYSTEM_DEV_STATUS_HISTORY_FIELD_KEYS)[number],
  value: unknown,
): string {
  if (key === "progress") {
    return formatSystemDevProgress(value as number | null | undefined);
  }
  if (value === null || value === undefined) return "";
  return String(value);
}

function progressValuesEqual(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  const norm = (v: number | null | undefined) => {
    if (v === null || v === undefined || Number.isNaN(v)) return null;
    return Math.round(v * 10000) / 10000;
  };
  return norm(a) === norm(b);
}

export function diffSystemDevStatusItems(
  before: SystemDevStatusItem | null,
  after: SystemDevStatusItem,
): SystemDevStatusHistoryChange[] {
  const changes: SystemDevStatusHistoryChange[] = [];
  for (const field of SYSTEM_DEV_STATUS_HISTORY_FIELD_KEYS) {
    const newRaw = after[field];
    const oldRaw = before ? before[field] : null;
    if (field === "progress") {
      if (
        progressValuesEqual(
          oldRaw as number | null | undefined,
          newRaw as number | null | undefined,
        )
      ) {
        continue;
      }
    } else if (String(oldRaw ?? "").trim() === String(newRaw ?? "").trim()) {
      continue;
    }
    changes.push({
      field,
      label: SYSTEM_DEV_STATUS_FIELD_LABELS[field],
      oldValue: historyFieldDisplay(field, oldRaw),
      newValue: historyFieldDisplay(field, newRaw),
    });
  }
  return changes;
}

function deleteSnapshotChanges(
  item: SystemDevStatusItem,
): SystemDevStatusHistoryChange[] {
  const changes: SystemDevStatusHistoryChange[] = [];
  for (const field of SYSTEM_DEV_STATUS_HISTORY_FIELD_KEYS) {
    const oldValue = historyFieldDisplay(field, item[field]);
    if (!oldValue.trim()) continue;
    changes.push({
      field,
      label: SYSTEM_DEV_STATUS_FIELD_LABELS[field],
      oldValue,
      newValue: "",
    });
  }
  return changes;
}

function insertSystemDevStatusHistory(
  db: DatabaseSync,
  input: {
    statusId: number;
    year: number;
    taskNo: string;
    action: SystemDevStatusHistoryAction;
    changes: SystemDevStatusHistoryChange[];
    changedAt: string;
    changedBy: string;
  },
): void {
  if (input.action === "update" && input.changes.length === 0) return;
  stmtRun(
    db,
    `
    INSERT INTO system_dev_status_history (
      status_id, year, task_no, action, changes_json, changed_at, changed_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.statusId,
      input.year,
      input.taskNo.trim(),
      input.action,
      JSON.stringify(input.changes),
      input.changedAt,
      input.changedBy.trim(),
    ],
  );
}

function historyRowToEntry(row: SystemDevStatusHistoryRow): SystemDevStatusHistoryEntry {
  let changes: SystemDevStatusHistoryChange[] = [];
  try {
    const parsed = JSON.parse(row.changes_json) as SystemDevStatusHistoryChange[];
    if (Array.isArray(parsed)) changes = parsed;
  } catch {
    changes = [];
  }
  return {
    id: row.id,
    statusId: row.status_id,
    year: row.year,
    taskNo: row.task_no,
    action: row.action as SystemDevStatusHistoryAction,
    changes,
    changedAt: row.changed_at,
    changedBy: row.changed_by,
  };
}

export function listSystemDevStatusHistory(
  statusId: number,
  limit = 100,
): SystemDevStatusHistoryEntry[] {
  const db = openDb(true);
  try {
    ensureSystemDevStatusTable(db);
    const rows = stmtAll<SystemDevStatusHistoryRow>(
      db,
      `
      SELECT *
      FROM system_dev_status_history
      WHERE status_id = ?
      ORDER BY changed_at DESC, id DESC
      LIMIT ?
      `,
      [statusId, limit],
    );
    return rows.map(historyRowToEntry);
  } finally {
    db.close();
  }
}

function getSystemDevStatusRowById(
  db: DatabaseSync,
  id: number,
): SystemDevStatusRow | undefined {
  return stmtGet<SystemDevStatusRow>(
    db,
    "SELECT * FROM system_dev_status WHERE id = ?",
    [id],
  );
}

function normalizeYear(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").trim());
  if (!Number.isFinite(n) || n < 2000 || n > 2100) {
    return DEFAULT_SYSTEM_DEV_STATUS_YEAR;
  }
  return Math.trunc(n);
}

function tableExists(db: DatabaseSync): boolean {
  const row = stmtGet<{ ok?: number }>(
    db,
    `SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'system_dev_status' LIMIT 1`,
  );
  return Boolean(row?.ok);
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && value > 30000 && value < 60000) {
    return excelSerialToDateString(value);
  }
  return String(value).replace(/\r\n/g, "\n").trim();
}

function excelSerialToDateString(serial: number): string {
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) return String(serial);
  const y = parsed.y;
  const m = String(parsed.m).padStart(2, "0");
  const d = String(parsed.d).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseProgress(value: unknown): number | null {
  if (value === "" || value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (Number.isNaN(n)) return null;
  return n;
}

function rowToItem(row: SystemDevStatusRow): SystemDevStatusItem {
  return {
    id: row.id,
    year: normalizeYear(row.year),
    systemName: row.system_name ?? "",
    taskNo: row.task_no ?? "",
    workArea: row.work_area ?? "",
    featureType: row.feature_type ?? "",
    menuName: row.menu_name ?? "",
    featureName: row.feature_name ?? "",
    featureDetail: row.feature_detail ?? "",
    requestDept: row.request_dept ?? "",
    requester: row.requester ?? "",
    devOwner: row.dev_owner ?? "",
    workFrequency: row.work_frequency ?? "",
    risk: row.risk ?? "",
    customerRequestLevel: row.customer_request_level ?? "",
    evalScore: row.eval_score ?? "",
    devDifficulty: row.dev_difficulty ?? "",
    priority: row.priority ?? "",
    requestDate: row.request_date ?? "",
    expectedDevDays: row.expected_dev_days ?? "",
    planStartDate: row.plan_start_date ?? "",
    planEndDate: row.plan_end_date ?? "",
    actualStartDate: row.actual_start_date ?? "",
    actualEndDate: row.actual_end_date ?? "",
    testDate: row.test_date ?? "",
    testCompleteDate: row.test_complete_date ?? "",
    productionApplyDate: row.production_apply_date ?? "",
    progress: row.progress,
    delayReason: row.delay_reason ?? "",
    sourceSheet: row.source_sheet ?? "",
    sortOrder: row.sort_order ?? 0,
    updatedAt: row.updated_at ?? "",
  };
}

function itemToRow(item: SystemDevStatusItem): Omit<SystemDevStatusRow, "id"> {
  return {
    year: normalizeYear(item.year),
    system_name: item.systemName.trim(),
    task_no: item.taskNo.trim(),
    work_area: item.workArea.trim(),
    feature_type: item.featureType.trim(),
    menu_name: item.menuName.trim(),
    feature_name: item.featureName.trim(),
    feature_detail: item.featureDetail.trim(),
    request_dept: item.requestDept.trim(),
    requester: item.requester.trim(),
    dev_owner: item.devOwner.trim(),
    work_frequency: item.workFrequency.trim(),
    risk: item.risk.trim(),
    customer_request_level: item.customerRequestLevel.trim(),
    eval_score: item.evalScore.trim(),
    dev_difficulty: item.devDifficulty.trim(),
    priority: item.priority.trim(),
    request_date: item.requestDate.trim(),
    expected_dev_days: item.expectedDevDays.trim(),
    plan_start_date: item.planStartDate.trim(),
    plan_end_date: item.planEndDate.trim(),
    actual_start_date: item.actualStartDate.trim(),
    actual_end_date: item.actualEndDate.trim(),
    test_date: item.testDate.trim(),
    test_complete_date: item.testCompleteDate.trim(),
    production_apply_date: item.productionApplyDate.trim(),
    progress: item.progress,
    delay_reason: item.delayReason.trim(),
    source_sheet: item.sourceSheet.trim(),
    sort_order: item.sortOrder,
    updated_at: item.updatedAt.trim(),
  };
}

const SELECT_ALL = `
  SELECT *
  FROM system_dev_status
  ORDER BY sort_order ASC, task_no ASC
`;

export type ListSystemDevStatusFilters = {
  year?: number;
  systemName?: string;
  workArea?: string;
  q?: string;
};

export function listSystemDevStatusYears(): number[] {
  const db = openDb(true);
  try {
    if (!tableExists(db)) return [DEFAULT_SYSTEM_DEV_STATUS_YEAR];
    const rows = stmtAll<{ year: number }>(
      db,
      "SELECT DISTINCT year FROM system_dev_status ORDER BY year DESC",
    );
    const years = rows.map((r) => normalizeYear(r.year));
    return years.length > 0 ? years : [DEFAULT_SYSTEM_DEV_STATUS_YEAR];
  } finally {
    db.close();
  }
}

export function countSystemDevStatusItems(year?: number): number {
  const db = openDb(true);
  try {
    if (!tableExists(db)) return 0;
    if (year != null) {
      const row = stmtGet<{ c: number }>(
        db,
        "SELECT COUNT(*) AS c FROM system_dev_status WHERE year = ?",
        [normalizeYear(year)],
      );
      return Number(row?.c) || 0;
    }
    const row = stmtGet<{ c: number }>(
      db,
      "SELECT COUNT(*) AS c FROM system_dev_status",
    );
    return Number(row?.c) || 0;
  } finally {
    db.close();
  }
}

export function listSystemDevStatusItems(
  filters: ListSystemDevStatusFilters = {},
): SystemDevStatusItem[] {
  const db = openDb(true);
  try {
    if (!tableExists(db)) return [];
    let rows = stmtAll<SystemDevStatusRow>(db, SELECT_ALL);
    const year =
      filters.year != null ? normalizeYear(filters.year) : undefined;
    const systemName = filters.systemName?.trim();
    const workArea = filters.workArea?.trim();
    const q = filters.q?.trim().toLowerCase();
    if (year != null) {
      rows = rows.filter((r) => normalizeYear(r.year) === year);
    }
    if (systemName) {
      rows = rows.filter((r) => r.system_name === systemName);
    }
    if (workArea) {
      rows = rows.filter((r) => r.work_area === workArea);
    }
    if (q) {
      rows = rows.filter((r) => {
        const hay = [
          r.task_no,
          r.feature_name,
          r.menu_name,
          r.feature_detail,
          r.dev_owner,
          r.requester,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return rows.map(rowToItem);
  } finally {
    db.close();
  }
}

export function upsertSystemDevStatusItem(
  item: SystemDevStatusItem,
  options?: SystemDevStatusWriteOptions,
): SystemDevStatusItem {
  const taskNo = item.taskNo.trim();
  if (!taskNo) {
    throw new Error("NO(과제번호)는 필수입니다.");
  }

  const now = new Date().toISOString();
  const row = itemToRow({ ...item, updatedAt: now });

  const changedBy = options?.changedBy ?? "";

  const db = openDb(false);
  try {
    ensureSystemDevStatusTable(db);
    if (item.id) {
      const existingRow = getSystemDevStatusRowById(db, item.id);
      const before = existingRow ? rowToItem(existingRow) : null;
      stmtRun(
        db,
        `
        UPDATE system_dev_status SET
          year = ?, system_name = ?, task_no = ?, work_area = ?, feature_type = ?,
          menu_name = ?, feature_name = ?, feature_detail = ?,
          request_dept = ?, requester = ?, dev_owner = ?,
          work_frequency = ?, risk = ?, customer_request_level = ?,
          eval_score = ?, dev_difficulty = ?, priority = ?,
          request_date = ?, expected_dev_days = ?,
          plan_start_date = ?, plan_end_date = ?,
          actual_start_date = ?, actual_end_date = ?,
          test_date = ?, test_complete_date = ?, production_apply_date = ?,
          progress = ?, delay_reason = ?, source_sheet = ?,
          sort_order = ?, updated_at = ?
        WHERE id = ?
        `,
        [
          row.year,
          row.system_name,
          row.task_no,
          row.work_area,
          row.feature_type,
          row.menu_name,
          row.feature_name,
          row.feature_detail,
          row.request_dept,
          row.requester,
          row.dev_owner,
          row.work_frequency,
          row.risk,
          row.customer_request_level,
          row.eval_score,
          row.dev_difficulty,
          row.priority,
          row.request_date,
          row.expected_dev_days,
          row.plan_start_date,
          row.plan_end_date,
          row.actual_start_date,
          row.actual_end_date,
          row.test_date,
          row.test_complete_date,
          row.production_apply_date,
          row.progress,
          row.delay_reason,
          row.source_sheet,
          row.sort_order,
          row.updated_at,
          item.id,
        ],
      );
      const saved = stmtGet<SystemDevStatusRow>(
        db,
        "SELECT * FROM system_dev_status WHERE id = ?",
        [item.id],
      );
      if (!saved) throw new Error("저장 후 조회에 실패했습니다.");
      const savedItem = rowToItem(saved);
      const changes = diffSystemDevStatusItems(before, savedItem);
      insertSystemDevStatusHistory(db, {
        statusId: savedItem.id!,
        year: savedItem.year,
        taskNo: savedItem.taskNo,
        action: "update",
        changes,
        changedAt: now,
        changedBy,
      });
      return savedItem;
    }

    stmtRun(
      db,
      `
      INSERT INTO system_dev_status (
        year, system_name, task_no, work_area, feature_type,
        menu_name, feature_name, feature_detail,
        request_dept, requester, dev_owner,
        work_frequency, risk, customer_request_level,
        eval_score, dev_difficulty, priority,
        request_date, expected_dev_days,
        plan_start_date, plan_end_date,
        actual_start_date, actual_end_date,
        test_date, test_complete_date, production_apply_date,
        progress, delay_reason, source_sheet,
        sort_order, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      `,
      [
        row.year,
        row.system_name,
        row.task_no,
        row.work_area,
        row.feature_type,
        row.menu_name,
        row.feature_name,
        row.feature_detail,
        row.request_dept,
        row.requester,
        row.dev_owner,
        row.work_frequency,
        row.risk,
        row.customer_request_level,
        row.eval_score,
        row.dev_difficulty,
        row.priority,
        row.request_date,
        row.expected_dev_days,
        row.plan_start_date,
        row.plan_end_date,
        row.actual_start_date,
        row.actual_end_date,
        row.test_date,
        row.test_complete_date,
        row.production_apply_date,
        row.progress,
        row.delay_reason,
        row.source_sheet,
        row.sort_order,
        row.updated_at,
      ],
    );
    const saved = stmtGet<SystemDevStatusRow>(
      db,
      "SELECT * FROM system_dev_status WHERE task_no = ? AND year = ?",
      [taskNo, row.year],
    );
    if (!saved) throw new Error("저장 후 조회에 실패했습니다.");
    const savedItem = rowToItem(saved);
    insertSystemDevStatusHistory(db, {
      statusId: savedItem.id!,
      year: savedItem.year,
      taskNo: savedItem.taskNo,
      action: "create",
      changes: diffSystemDevStatusItems(null, savedItem),
      changedAt: now,
      changedBy,
    });
    return savedItem;
  } finally {
    db.close();
  }
}

export function deleteSystemDevStatusItem(
  id: number,
  options?: SystemDevStatusWriteOptions,
): void {
  const changedBy = options?.changedBy ?? "";
  const now = new Date().toISOString();
  const db = openDb(false);
  try {
    ensureSystemDevStatusTable(db);
    const existingRow = getSystemDevStatusRowById(db, id);
    if (existingRow) {
      const before = rowToItem(existingRow);
      insertSystemDevStatusHistory(db, {
        statusId: id,
        year: before.year,
        taskNo: before.taskNo,
        action: "delete",
        changes: deleteSnapshotChanges(before),
        changedAt: now,
        changedBy,
      });
    }
    stmtRun(db, "DELETE FROM system_dev_status WHERE id = ?", [id]);
  } finally {
    db.close();
  }
}

/** WBS 확장: 22~24 테스트·운영일, 25 진척, 26 지연사유. 구형은 22 진척·23 지연 */
function parseExcelTailDatesAndProgress(row: unknown[]): {
  testDate: string;
  testCompleteDate: string;
  productionApplyDate: string;
  progress: number | null;
  delayReason: string;
} {
  const extended =
    row.length > 25 &&
    (row[25] !== "" && row[25] !== null && row[25] !== undefined);
  if (extended) {
    return {
      testDate: cellText(row[22]),
      testCompleteDate: cellText(row[23]),
      productionApplyDate: cellText(row[24]),
      progress: parseProgress(row[25]),
      delayReason: cellText(row[26]),
    };
  }
  return {
    testDate: "",
    testCompleteDate: "",
    productionApplyDate: "",
    progress: parseProgress(row[22]),
    delayReason: cellText(row[23]),
  };
}

function parseExcelRow(
  row: unknown[],
  sortOrder: number,
  sourceSheet: string,
  year: number,
): SystemDevStatusItem | null {
  const taskNo = cellText(row[1]);
  if (!taskNo) return null;

  return {
    id: null,
    year,
    systemName: cellText(row[0]),
    taskNo,
    workArea: cellText(row[2]),
    featureType: cellText(row[3]),
    menuName: cellText(row[4]),
    featureName: cellText(row[5]),
    featureDetail: cellText(row[6]),
    requestDept: cellText(row[7]),
    requester: cellText(row[8]),
    devOwner: cellText(row[9]),
    workFrequency: cellText(row[10]),
    risk: cellText(row[11]),
    customerRequestLevel: cellText(row[12]),
    evalScore: cellText(row[13]),
    devDifficulty: cellText(row[14]),
    priority: cellText(row[15]),
    requestDate: cellText(row[16]),
    expectedDevDays: cellText(row[17]),
    planStartDate: cellText(row[18]),
    planEndDate: cellText(row[19]),
    actualStartDate: cellText(row[20]),
    actualEndDate: cellText(row[21]),
    ...parseExcelTailDatesAndProgress(row),
    sourceSheet,
    sortOrder,
    updatedAt: new Date().toISOString(),
  };
}

function resolveSystemDevStatusSheetName(
  wb: XLSX.WorkBook,
  preferred?: string,
): string {
  const name = preferred?.trim();
  if (name && wb.Sheets[name]) return name;
  const hit = wb.SheetNames.find((n) => n.includes("시스템개발현황"));
  if (hit) return hit;
  if (name) {
    throw new Error(`시트를 찾을 수 없습니다: ${name}`);
  }
  throw new Error("「시스템개발현황」 시트를 찾을 수 없습니다.");
}

function parseSystemDevStatusMatrix(
  matrix: unknown[][],
  sheetName: string,
  year: number,
): { items: SystemDevStatusItem[]; skipped: number } {
  const byTaskNo = new Map<string, SystemDevStatusItem>();
  let skipped = 0;
  for (let i = DATA_START_ROW_INDEX; i < matrix.length; i++) {
    const parsed = parseExcelRow(
      matrix[i],
      i - DATA_START_ROW_INDEX,
      sheetName,
      year,
    );
    if (!parsed) {
      skipped += 1;
      continue;
    }
    byTaskNo.set(parsed.taskNo, parsed);
  }
  return { items: [...byTaskNo.values()], skipped };
}

function persistSystemDevStatusImport(
  items: SystemDevStatusItem[],
  year: number,
  replaceAll: boolean,
): void {
  const db = openDb(false);
  try {
    ensureSystemDevStatusTable(db);
    stmtRun(db, "BEGIN");
    try {
      if (replaceAll) {
        stmtRun(db, "DELETE FROM system_dev_status WHERE year = ?", [year]);
      }
      for (const item of items) {
        upsertSystemDevStatusItemInTx(db, item);
      }
      stmtRun(db, "COMMIT");
    } catch (e) {
      stmtRun(db, "ROLLBACK");
      throw e;
    }
  } finally {
    db.close();
  }
}

export function importSystemDevStatusFromExcelBuffer(
  buffer: Buffer,
  options?: {
    sheetName?: string;
    replaceAll?: boolean;
    year?: number;
    fileLabel?: string;
  },
): {
  imported: number;
  skipped: number;
  sheet: string;
  filePath: string;
  year: number;
} {
  const year = normalizeYear(options?.year ?? DEFAULT_SYSTEM_DEV_STATUS_YEAR);
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = resolveSystemDevStatusSheetName(wb, options?.sheetName);
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  }) as unknown[][];

  if (matrix.length <= DATA_START_ROW_INDEX) {
    return {
      imported: 0,
      skipped: 0,
      sheet: sheetName,
      filePath: options?.fileLabel ?? "(upload)",
      year,
    };
  }

  const { items, skipped } = parseSystemDevStatusMatrix(matrix, sheetName, year);
  persistSystemDevStatusImport(items, year, options?.replaceAll ?? true);

  return {
    imported: items.length,
    skipped,
    sheet: sheetName,
    filePath: options?.fileLabel ?? "(upload)",
    year,
  };
}

export function importSystemDevStatusFromExcel(options?: {
  filePath?: string;
  sheetName?: string;
  replaceAll?: boolean;
  year?: number;
}): {
  imported: number;
  skipped: number;
  sheet: string;
  filePath: string;
  year: number;
} {
  const year = normalizeYear(options?.year ?? DEFAULT_SYSTEM_DEV_STATUS_YEAR);
  const filePath = path.resolve(
    options?.filePath?.trim() || DEFAULT_SYSTEM_DEV_STATUS_EXCEL_PATH,
  );
  const sheetName = options?.sheetName?.trim() || DEFAULT_SYSTEM_DEV_STATUS_SHEET;

  if (!fs.existsSync(filePath)) {
    throw new Error(`엑셀 파일을 찾을 수 없습니다: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);
  return importSystemDevStatusFromExcelBuffer(buffer, {
    sheetName,
    replaceAll: options?.replaceAll,
    year,
    fileLabel: filePath,
  });
}

function upsertSystemDevStatusItemInTx(
  db: DatabaseSync,
  item: SystemDevStatusItem,
): void {
  const taskNo = item.taskNo.trim();
  const now = new Date().toISOString();
  const row = itemToRow({ ...item, updatedAt: now });
  const existing = stmtGet<{ id: number }>(
    db,
    "SELECT id FROM system_dev_status WHERE task_no = ? AND year = ?",
    [taskNo, row.year],
  );
  if (existing?.id) {
    stmtRun(
      db,
      `
      UPDATE system_dev_status SET
        system_name = ?, work_area = ?, feature_type = ?,
        menu_name = ?, feature_name = ?, feature_detail = ?,
        request_dept = ?, requester = ?, dev_owner = ?,
        work_frequency = ?, risk = ?, customer_request_level = ?,
        eval_score = ?, dev_difficulty = ?, priority = ?,
        request_date = ?, expected_dev_days = ?,
        plan_start_date = ?, plan_end_date = ?,
        actual_start_date = ?, actual_end_date = ?,
        test_date = ?, test_complete_date = ?, production_apply_date = ?,
        progress = ?, delay_reason = ?, source_sheet = ?,
        sort_order = ?, updated_at = ?
      WHERE id = ?
      `,
      [
        row.system_name,
        row.work_area,
        row.feature_type,
        row.menu_name,
        row.feature_name,
        row.feature_detail,
        row.request_dept,
        row.requester,
        row.dev_owner,
        row.work_frequency,
        row.risk,
        row.customer_request_level,
        row.eval_score,
        row.dev_difficulty,
        row.priority,
        row.request_date,
        row.expected_dev_days,
        row.plan_start_date,
        row.plan_end_date,
        row.actual_start_date,
        row.actual_end_date,
        row.test_date,
        row.test_complete_date,
        row.production_apply_date,
        row.progress,
        row.delay_reason,
        row.source_sheet,
        row.sort_order,
        row.updated_at,
        existing.id,
      ],
    );
    return;
  }

  stmtRun(
    db,
    `
    INSERT INTO system_dev_status (
      year, system_name, task_no, work_area, feature_type,
      menu_name, feature_name, feature_detail,
      request_dept, requester, dev_owner,
      work_frequency, risk, customer_request_level,
      eval_score, dev_difficulty, priority,
      request_date, expected_dev_days,
      plan_start_date, plan_end_date,
      actual_start_date, actual_end_date,
      test_date, test_complete_date, production_apply_date,
      progress, delay_reason, source_sheet,
      sort_order, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    `,
    [
      row.year,
      row.system_name,
      row.task_no,
      row.work_area,
      row.feature_type,
      row.menu_name,
      row.feature_name,
      row.feature_detail,
      row.request_dept,
      row.requester,
      row.dev_owner,
      row.work_frequency,
      row.risk,
      row.customer_request_level,
      row.eval_score,
      row.dev_difficulty,
      row.priority,
      row.request_date,
      row.expected_dev_days,
      row.plan_start_date,
      row.plan_end_date,
      row.actual_start_date,
      row.actual_end_date,
      row.test_date,
      row.test_complete_date,
      row.production_apply_date,
      row.progress,
      row.delay_reason,
      row.source_sheet,
      row.sort_order,
      row.updated_at,
    ],
  );
}

export function ensureSystemDevStatusSeededFromExcel(
  year: number = DEFAULT_SYSTEM_DEV_STATUS_YEAR,
): {
  seeded: boolean;
  importResult?: ReturnType<typeof importSystemDevStatusFromExcel>;
} {
  const y = normalizeYear(year);
  if (countSystemDevStatusItems(y) > 0) {
    return { seeded: false };
  }
  try {
    const importResult = importSystemDevStatusFromExcel({
      replaceAll: true,
      year: y,
    });
    return { seeded: true, importResult };
  } catch {
    return { seeded: false };
  }
}
