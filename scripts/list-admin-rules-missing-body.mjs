/**
 * 규칙 목록(Excel 615 + rule_master 병합) 중 본문·부칙·별표 미적재 항목
 * Usage: node scripts/list-admin-rules-missing-body.mjs
 */
import fs from "node:fs";
import path from "node:path";
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
const OUT = path.join(
  process.cwd(),
  "scripts/admin-rules-missing-body.json",
);

const SHEET = "01_크롤링대상";
const DATA_ROW = 3;

function norm(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normCell(v) {
  if (v == null) return "";
  return String(v).trim();
}

function crawlParam(portalLawId, lawName) {
  const id = portalLawId.replace(/\D/g, "").padStart(6, "0").slice(-6);
  if (id && id !== "000000") return `crawl-${id}`;
  const slug = lawName
    .trim()
    .slice(0, 40)
    .replace(/[^\w가-힣]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `crawl-${slug || "unknown"}`;
}

function sourceFamily(gubun, url) {
  const g = (gubun ?? "").trim().toLowerCase();
  const u = url ?? "";
  if (g === "raw_rule" || g.startsWith("raw_rule_")) return "law";
  if (
    g.includes("법령") ||
    g === "law" ||
    g === "statute" ||
    g === "시행령" ||
    g === "시행규칙" ||
    g === "대통령령"
  ) {
    return "law";
  }
  if (u.includes("/법령/")) return "law";
  if (u.includes("/행정규칙/")) return "admin";
  return "admin";
}

function tableNames(family) {
  const p = family === "law" ? "raw_rule" : "admin_rule";
  return { main: p, addendum: `${p}_addendum`, annex: `${p}_annex` };
}

function hasKey(db, table, key) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
    return false;
  }
  return !!db.prepare(`SELECT 1 AS o FROM "${table}" WHERE param = ? LIMIT 1`).get(key);
}

function hasRenderable(db, source) {
  const key = source.param;
  const admin = tableNames("admin");
  const law = tableNames("law");
  const inAdmin =
    hasKey(db, admin.main, key) ||
    hasKey(db, admin.addendum, key) ||
    hasKey(db, admin.annex, key);
  const inLaw =
    hasKey(db, law.main, key) ||
    hasKey(db, law.addendum, key) ||
    hasKey(db, law.annex, key);
  if (inAdmin || inLaw) return { ok: true, inAdmin, inLaw };
  return { ok: false, inAdmin: false, inLaw: false };
}

function loadExcelTargets(filePath) {
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
      documentType: doc,
      portalLawId: normCell(row[7]),
      targetFlag: normCell(row[0]),
    });
  }
  const byName = new Map();
  for (const t of parsed) {
    const prev = byName.get(t.lawName);
    if (!prev) {
      byName.set(t.lawName, t);
      continue;
    }
    const rank = (x) =>
      (x.targetFlag === "Y" ? 4 : x.targetFlag === "검토" ? 2 : 0) +
      (x.portalLawId ? 1 : 0);
    if (rank(t) > rank(prev)) byName.set(t.lawName, t);
  }
  return [...byName.values()];
}

const db = new DatabaseSync(DB_PATH, { readOnly: true });
const rmRows = db
  .prepare("SELECT param, description, gubun, url FROM rule_master")
  .all();
const dbByName = new Map();
for (const r of rmRows) {
  const n = norm(r.description);
  if (n && !dbByName.has(n)) dbByName.set(n, r);
}

const targets = loadExcelTargets(XLSX_PATH);
const missing = [];
const collected = [];

for (const t of targets) {
  const fromDb = dbByName.get(t.lawName);
  let param;
  let gubun;
  let url;
  let inRuleMaster;
  if (fromDb) {
    param = fromDb.param;
    gubun = fromDb.gubun ?? t.documentType;
    url = fromDb.url ?? "";
    inRuleMaster = true;
  } else {
    param = crawlParam(t.portalLawId, t.lawName);
    gubun = t.documentType || "adm_rule";
    const seg =
      gubun === "시행령" ||
      gubun === "시행규칙" ||
      gubun === "법률" ||
      gubun === "법령" ||
      gubun === "대통령령"
        ? "법령"
        : "행정규칙";
    url = `https://www.law.go.kr/${seg}/${encodeURIComponent(t.lawName)}`;
    inRuleMaster = false;
  }
  const family = sourceFamily(gubun, url);
  const render = hasRenderable(db, { param });
  const row = {
    description: t.lawName,
    param,
    documentType: t.documentType,
    targetFlag: t.targetFlag,
    portalLawId: t.portalLawId,
    inRuleMaster,
    sourceFamily: family,
    table_in_db: render.ok,
  };
  if (render.ok) collected.push(row);
  else missing.push(row);
}

missing.sort((a, b) => a.description.localeCompare(b.description, "ko"));

const payload = {
  generatedAt: new Date().toISOString(),
  excelPath: XLSX_PATH,
  dbPath: DB_PATH,
  listTotal: targets.length,
  collectedCount: collected.length,
  missingCount: missing.length,
  missing,
};

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log("Total:", targets.length);
console.log("Collected (body/addendum/annex):", collected.length);
console.log("Missing:", missing.length);
console.log("Written:", OUT);
console.log("\n--- missing (first 30) ---");
for (const r of missing.slice(0, 30)) {
  console.log(`${r.param}\t${r.documentType}\t${r.description}`);
}

db.close();
