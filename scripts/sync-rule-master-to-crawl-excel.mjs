/**
 * rule_master를 크롤링 대상 Excel(법령 제외·이름 dedupe)과 맞춤.
 * DB에만 있고 Excel 615에 없는 rule_master 행을 제거 → 목록 618→615.
 *
 * Usage: node scripts/sync-rule-master-to-crawl-excel.mjs [--dry-run]
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const XLSX_PATH =
  process.env.ADMIN_RULES_CRAWL_TARGETS_XLSX?.trim() ||
  "D:/Manus/행정규칙_안만복/2026-08-31 COB_CRB법령정보/법령_행정규칙_크롤링대상_종합_20260902.xlsx";
const DB_PATH =
  process.env.ADMIN_RULES_DB_PATH?.trim() ||
  process.env.SMART_LAW_SQLITE_DB_PATH?.trim() ||
  "D:/SQLiteDB/smart_law_ai.db";

const SHEET = "01_크롤링대상";
const DATA_ROW = 3;
const dryRun = process.argv.includes("--dry-run");

function norm(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normCell(v) {
  if (v == null) return "";
  return String(v).trim();
}

function loadExcelAllowedNames(filePath) {
  const wb = XLSX.readFile(filePath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], {
    header: 1,
    defval: "",
  });
  const parsed = [];
  for (let i = DATA_ROW; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const lawName = norm(row[3]);
    const doc = normCell(row[4]);
    if (!lawName || doc === "법령" || doc === "법률") continue;
    parsed.push({
      lawName,
      portal: normCell(row[7]),
      flag: normCell(row[0]),
    });
  }
  const byName = new Map();
  for (const t of parsed) {
    const key = t.lawName;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, t);
      continue;
    }
    const rank = (x) =>
      (x.flag === "Y" ? 4 : x.flag === "검토" ? 2 : 0) + (x.portal ? 1 : 0);
    if (rank(t) > rank(prev)) byName.set(key, t);
  }
  return byName;
}

if (!fs.existsSync(XLSX_PATH)) {
  console.error("Excel not found:", XLSX_PATH);
  process.exit(1);
}
if (!fs.existsSync(DB_PATH)) {
  console.error("DB not found:", DB_PATH);
  process.exit(1);
}

const excelNames = loadExcelAllowedNames(XLSX_PATH);
console.log("Excel allowed (deduped):", excelNames.size);

const db = new DatabaseSync(DB_PATH);
const rows = db
  .prepare("SELECT param, description FROM rule_master ORDER BY param")
  .all();

const toRemove = rows.filter((r) => !excelNames.has(norm(r.description)));
console.log("rule_master rows:", rows.length);
console.log("To remove (not in Excel 615):", toRemove.length);
for (const r of toRemove) {
  console.log(" -", r.param, r.description);
}

if (toRemove.length === 0) {
  console.log("Already aligned.");
  db.close();
  process.exit(0);
}

if (dryRun) {
  console.log("Dry run — no changes written.");
  db.close();
  process.exit(0);
}

const del = db.prepare("DELETE FROM rule_master WHERE param = ?");
for (const r of toRemove) {
  del.run(r.param);
}
const after = db
  .prepare("SELECT COUNT(*) AS n FROM rule_master")
  .get().n;
console.log("rule_master after:", after);
db.close();
