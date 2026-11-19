import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import XLSX from "xlsx";

const dbPath =
  process.env.ADMIN_RULES_DB_PATH ||
  process.env.SMART_LAW_SQLITE_DB_PATH ||
  "D:/SQLiteDB/smart_law_ai.db";

const excelPath =
  process.env.ADMIN_RULES_CRAWL_TARGETS_XLSX ||
  "D:/Manus/행정규칙_안만복/2026-08-31 COB_CRB법령정보/법령_행정규칙_크롤링대상_종합_20260902.xlsx";

const db = new DatabaseSync(dbPath, { readOnly: true });

function norm(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function hasBody(param) {
  return Boolean(
    db.prepare("SELECT 1 AS o FROM admin_rule WHERE param = ? LIMIT 1").get(param),
  );
}

function hasRenderable(param) {
  for (const t of ["admin_rule", "admin_rule_addendum", "admin_rule_annex"]) {
    if (
      db
        .prepare(`SELECT 1 AS o FROM "${t}" WHERE param = ? LIMIT 1`)
        .get(param)
    ) {
      return true;
    }
  }
  return false;
}

const ruleMaster = db
  .prepare("SELECT param, description FROM rule_master")
  .all();
const byName = new Map(ruleMaster.map((r) => [norm(r.description), r]));

let excelOnly = 0;
let matched = 0;
let matchedNoBody = 0;
const matchedNoBodyList = [];

if (fs.existsSync(excelPath)) {
  const sheet = XLSX.readFile(excelPath).Sheets["01_크롤링대상"];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const seen = new Set();

  for (let i = 3; i < rows.length; i += 1) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const doc = String(row[4] ?? "").trim();
    if (doc === "법령" || doc === "법률") continue;
    const name = norm(row[3]);
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const dbRow = byName.get(name);
    if (!dbRow) {
      excelOnly += 1;
      continue;
    }
    matched += 1;
    if (!hasBody(dbRow.param) && hasRenderable(dbRow.param)) {
      matchedNoBody += 1;
      matchedNoBodyList.push({
        param: dbRow.param,
        description: dbRow.description,
      });
    }
  }
}

console.log("DB:", dbPath);
console.log("rule_master:", ruleMaster.length);
console.log("Excel(행정규칙) 고유명 × DB 매칭:", matched);
console.log("Excel에만 있음(미적재·crawl_target_only):", excelOnly);
console.log(
  "매칭됐지만 admin_rule 본문 없음(부칙/별표만):",
  matchedNoBody,
);
if (matchedNoBodyList.length) {
  console.log("\n목록:");
  for (const x of matchedNoBodyList) {
    console.log(`  [${x.param}] ${x.description}`);
  }
}

db.close();
