/**
 * 615건 전체 — 본문 없음 + 별표/부칙 있음 분류
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DB = "D:/SQLiteDB/smart_law_ai.db";
const XLSX_PATH =
  "D:/Manus/행정규칙_안만복/2026-08-31 COB_CRB법령정보/법령_행정규칙_크롤링대상_종합_20260902.xlsx";
const OUT = path.join(process.cwd(), "scripts/admin-rules-body-annex-gap.json");

const SHEET = "01_크롤링대상";
const DATA_ROW = 3;

function norm(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
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

function loadExcelTargets(filePath) {
  const wb = XLSX.readFile(filePath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[SHEET], { header: 1, defval: "" });
  const parsed = [];
  for (let i = DATA_ROW; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const lawName = norm(row[3]);
    const doc = normCell(row[4]);
    if (!lawName || doc === "법령" || doc === "법률") continue;
    parsed.push({ lawName, documentType: doc, portalLawId: normCell(row[7]) });
  }
  const byName = new Map();
  for (const t of parsed) {
    if (!byName.has(t.lawName)) byName.set(t.lawName, t);
  }
  return [...byName.values()];
}

function countParam(db, table, param) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) return 0;
  const variants = [param];
  if (param.startsWith("crawl-")) variants.push(param.replace("crawl-", "crawl_"));
  let n = 0;
  for (const p of variants) {
    n += db.prepare(`SELECT COUNT(1) c FROM "${table}" WHERE param=?`).get(p).c;
  }
  return n;
}

function countLawName(db, table, name) {
  if (!name) return 0;
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) return 0;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes("law_name")) return 0;
  return db.prepare(`SELECT COUNT(1) c FROM "${table}" WHERE law_name=?`).get(name).c;
}

function counts(db, param, lawName) {
  const parts = [
    ["body", "admin_rule"],
    ["addendum", "admin_rule_addendum"],
    ["annex", "admin_rule_annex"],
    ["body", "raw_rule"],
    ["addendum", "raw_rule_addendum"],
    ["annex", "raw_rule_annex"],
  ];
  const byParam = { body: 0, addendum: 0, annex: 0 };
  const byName = { body: 0, addendum: 0, annex: 0 };
  for (const [kind, table] of parts) {
    byParam[kind] += countParam(db, table, param);
    byName[kind] += countLawName(db, table, lawName);
  }
  const best = {
    body: Math.max(byParam.body, byName.body),
    addendum: Math.max(byParam.addendum, byName.addendum),
    annex: Math.max(byParam.annex, byName.annex),
  };
  return { byParam, byName, best };
}

const db = new DatabaseSync(DB, { readOnly: true });
const rm = db.prepare("SELECT param, description FROM rule_master").all();
const dbByName = new Map();
for (const r of rm) {
  const n = norm(r.description);
  if (n && !dbByName.has(n)) dbByName.set(n, r.param);
}

const targets = loadExcelTargets(XLSX_PATH);
const rows = [];

for (const t of targets) {
  const fromDb = dbByName.get(t.lawName);
  const param = fromDb ?? crawlParam(t.portalLawId, t.lawName);
  const c = counts(db, param, t.lawName);
  const hasAny = c.best.body + c.best.addendum + c.best.annex > 0;
  let gap = null;
  if (c.best.body === 0 && c.best.annex > 0) gap = "no_body_has_annex";
  else if (c.best.body === 0 && c.best.addendum > 0 && c.best.annex === 0)
    gap = "no_body_has_addendum_only";
  else if (!hasAny) gap = "missing_all";
  else if (c.best.body > 0) gap = "has_body";

  rows.push({
    description: t.lawName,
    param,
    documentType: t.documentType,
    inRuleMaster: Boolean(fromDb),
    counts: c.best,
    byParam: c.byParam,
    byLawName: c.byName,
    gap,
  });
}

const noBodyHasAnnex = rows.filter((r) => r.gap === "no_body_has_annex");
const noBodyHasAddendum = rows.filter((r) => r.gap === "no_body_has_addendum_only");
const missingAll = rows.filter((r) => r.gap === "missing_all");

// admrul_annexes / law_annexes by title
let admrulAnnex = 0;
if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='admrul_annexes'").get()) {
  admrulAnnex = db.prepare("SELECT COUNT(1) n FROM admrul_annexes").get().n;
}

const payload = {
  generatedAt: new Date().toISOString(),
  total: rows.length,
  summary: {
    hasBody: rows.filter((r) => r.gap === "has_body").length,
    missingAll: missingAll.length,
    noBodyHasAnnex: noBodyHasAnnex.length,
    noBodyHasAddendumOnly: noBodyHasAddendum.length,
    admrul_annexes_rows: admrulAnnex,
  },
  noBodyHasAnnex,
  noBodyHasAddendumOnly: noBodyHasAddendum,
  missingAll,
};

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify(payload.summary, null, 2));
console.log("Written", OUT);
console.log("\nno_body_has_annex sample:");
for (const r of noBodyHasAnnex.slice(0, 25)) {
  console.log(r.param, r.counts, r.description.slice(0, 55));
}

db.close();
