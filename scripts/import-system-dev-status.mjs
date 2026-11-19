import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import XLSX from "xlsx";

const DB_PATH =
  process.env.SMART_LAW_SQLITE_DB_PATH?.trim() ||
  "D:/SQLiteDB/smart_law_ai.db";
const EXCEL_PATH =
  "D:/HJCustoms/NEW CAS/4세대 CAS/1.진행사항/관세법인한주 시스템 WBS 2025 V2.xlsx";
const SHEET = "시스템개발현황 20251016";
const IMPORT_YEAR = 2025;
const DATA_START = 3;

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && value > 30000 && value < 60000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  return String(value).replace(/\r\n/g, "\n").trim();
}

const CREATE = `
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
`;

const wb = XLSX.readFile(EXCEL_PATH);
const matrix = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], {
  header: 1,
  defval: "",
});

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(DB_PATH);
for (const stmt of CREATE.split(";").filter((s) => s.trim())) {
  db.prepare(stmt).run();
}

const cols = db.prepare("PRAGMA table_info(system_dev_status)").all();
if (cols.length > 0 && !cols.some((c) => c.name === "year")) {
  db.prepare(
    "ALTER TABLE system_dev_status ADD COLUMN year INTEGER NOT NULL DEFAULT 2025",
  ).run();
}
for (const col of [
  "test_date",
  "test_complete_date",
  "production_apply_date",
]) {
  const info = db.prepare("PRAGMA table_info(system_dev_status)").all();
  if (info.length > 0 && !info.some((c) => c.name === col)) {
    db.prepare(
      `ALTER TABLE system_dev_status ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`,
    ).run();
  }
}
db.prepare("UPDATE system_dev_status SET year = 2025 WHERE year IS NULL OR year = 0").run();

db.prepare("DELETE FROM system_dev_status WHERE year = ?").run(IMPORT_YEAR);

const insert = db.prepare(`
INSERT INTO system_dev_status (
  year, system_name, task_no, work_area, feature_type, menu_name, feature_name, feature_detail,
  request_dept, requester, dev_owner, work_frequency, risk, customer_request_level,
  eval_score, dev_difficulty, priority, request_date, expected_dev_days,
  plan_start_date, plan_end_date, actual_start_date, actual_end_date,
  test_date, test_complete_date, production_apply_date,
  progress, delay_reason, source_sheet, sort_order, updated_at
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`);

const byTaskNo = new Map();
for (let i = DATA_START; i < matrix.length; i++) {
  const row = matrix[i];
  const taskNo = cellText(row[1]);
  if (!taskNo) continue;
  byTaskNo.set(taskNo, { row, sortOrder: i - DATA_START });
}

let n = 0;
const now = new Date().toISOString();
for (const { row, sortOrder } of byTaskNo.values()) {
  const taskNo = cellText(row[1]);
  const extended =
    row.length > 25 &&
    row[25] !== "" &&
    row[25] !== null &&
    row[25] !== undefined;
  const testDate = extended ? cellText(row[22]) : "";
  const testCompleteDate = extended ? cellText(row[23]) : "";
  const productionApplyDate = extended ? cellText(row[24]) : "";
  const progressRaw = extended ? row[25] : row[22];
  const progress =
    progressRaw === "" || progressRaw == null
      ? null
      : Number(progressRaw);
  const delayReason = extended ? cellText(row[26]) : cellText(row[23]);
  insert.run(
    IMPORT_YEAR,
    cellText(row[0]),
    taskNo,
    cellText(row[2]),
    cellText(row[3]),
    cellText(row[4]),
    cellText(row[5]),
    cellText(row[6]),
    cellText(row[7]),
    cellText(row[8]),
    cellText(row[9]),
    cellText(row[10]),
    cellText(row[11]),
    cellText(row[12]),
    cellText(row[13]),
    cellText(row[14]),
    cellText(row[15]),
    cellText(row[16]),
    cellText(row[17]),
    cellText(row[18]),
    cellText(row[19]),
    cellText(row[20]),
    cellText(row[21]),
    testDate,
    testCompleteDate,
    productionApplyDate,
    Number.isNaN(progress) ? null : progress,
    delayReason,
    SHEET,
    sortOrder,
    now,
  );
  n += 1;
}

const count = db.prepare("SELECT COUNT(*) AS c FROM system_dev_status").get().c;
db.close();
console.log(`imported ${n} (${IMPORT_YEAR}년), count=${count}, db=${DB_PATH}`);
