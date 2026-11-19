/**
 * 미적재(144) + 전체 gap — 별표/서식·첨부·admrul·포털ID·법령명 LIKE 추가 점검
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
const MISSING_JSON = path.join(process.cwd(), "scripts/admin-rules-missing-body.json");
const GAP_JSON = path.join(process.cwd(), "scripts/admin-rules-body-annex-gap.json");
const OUT = path.join(process.cwd(), "scripts/admin-rules-missing-annex-extended.json");

function norm(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function tableExists(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function tableCols(db, table) {
  if (!tableExists(db, table)) return [];
  return db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
}

function countWhere(db, table, whereSql, params) {
  if (!tableExists(db, table)) return 0;
  return db.prepare(`SELECT COUNT(1) c FROM "${table}" WHERE ${whereSql}`).get(...params).c;
}

function paramVariants(param) {
  const set = new Set([param]);
  if (param.startsWith("crawl-")) set.add(param.replace("crawl-", "crawl_"));
  if (param.startsWith("crawl_")) set.add(param.replace("crawl_", "crawl-"));
  return [...set];
}

function satelliteCounts(db, param, lawName) {
  const tables = [
    ["body", "admin_rule"],
    ["addendum", "admin_rule_addendum"],
    ["annex", "admin_rule_annex"],
    ["attachment", "admin_rule_attachment"],
    ["body", "raw_rule"],
    ["addendum", "raw_rule_addendum"],
    ["annex", "raw_rule_annex"],
    ["attachment", "raw_rule_attachment"],
  ];
  const best = { body: 0, addendum: 0, annex: 0, attachment: 0 };
  for (const [kind, table] of tables) {
    let n = 0;
    for (const p of paramVariants(param)) {
      n += countWhere(db, table, "param = ?", [p]);
    }
    const cols = tableCols(db, table);
    if (cols.includes("law_name") && lawName) {
      n = Math.max(n, countWhere(db, table, "law_name = ?", [lawName]));
    }
    best[kind] += n;
  }
  return best;
}

function admrulMatch(db, lawName, portalId) {
  if (!tableExists(db, "admrul_annexes")) return { count: 0, sample: [] };
  const cols = tableCols(db, "admrul_annexes");
  const id = portalId.replace(/\D/g, "");
  let count = 0;
  const sample = [];
  if (cols.includes("law_name") && lawName) {
    count += countWhere(db, "admrul_annexes", "law_name LIKE ?", [`%${lawName.slice(0, 20)}%`]);
  }
  if (cols.includes("admrul_id") && id) {
    count += countWhere(db, "admrul_annexes", "admrul_id = ? OR CAST(admrul_id AS TEXT) = ?", [
      id,
      id,
    ]);
  }
  if (count > 0 && cols.length) {
    const row = db.prepare(`SELECT * FROM admrul_annexes LIMIT 1`).get();
    if (row) sample.push(Object.keys(row).slice(0, 8));
  }
  return { count, cols };
}

function portalSubstringHits(db, portalId) {
  const id = portalId.replace(/\D/g, "");
  if (!id || id.length < 4) return [];
  const hits = [];
  for (const table of [
    "admin_rule",
    "admin_rule_addendum",
    "admin_rule_annex",
    "admin_rule_attachment",
    "raw_rule_annex",
  ]) {
    if (!tableCols(db, table).includes("param")) continue;
    const n = countWhere(db, table, "param LIKE ?", [`%${id}%`]);
    if (n > 0) hits.push({ table, rows: n });
  }
  return hits;
}

function clipAnnexMatch(db, lawName) {
  if (!tableExists(db, "clip_annex_forms")) return 0;
  const cols = tableCols(db, "clip_annex_forms");
  if (cols.includes("law_name")) {
    return countWhere(db, "clip_annex_forms", "law_name = ? OR law_name LIKE ?", [
      lawName,
      `%${lawName.slice(0, 24)}%`,
    ]);
  }
  return 0;
}

const db = new DatabaseSync(DB, { readOnly: true });
const missing = JSON.parse(fs.readFileSync(MISSING_JSON, "utf8")).missing;
const gap = JSON.parse(fs.readFileSync(GAP_JSON, "utf8"));

const wb = XLSX.readFile(XLSX_PATH);
const excelRows = XLSX.utils.sheet_to_json(wb.Sheets["01_크롤링대상"], {
  header: 1,
  defval: "",
});
const annexFormExcel = [];
for (let i = 3; i < excelRows.length; i++) {
  const row = excelRows[i];
  if (!Array.isArray(row)) continue;
  const doc = String(row[4] ?? "").trim();
  if (/별표|서식/.test(doc)) {
    annexFormExcel.push({
      lawName: norm(row[3]),
      documentType: doc,
      portalLawId: String(row[7] ?? "").trim(),
    });
  }
}

const enriched = [];
let withSatellite = 0;
let withAdmrul = 0;
let withPortalSubstr = 0;
let withClip = 0;

for (const row of missing) {
  const lawName = norm(row.description);
  const counts = satelliteCounts(db, row.param, lawName);
  const adm = admrulMatch(db, lawName, row.portalLawId ?? "");
  const portalHits = portalSubstringHits(db, row.portalLawId ?? "");
  const clip = clipAnnexMatch(db, lawName);
  const hasSat =
    counts.body + counts.addendum + counts.annex + counts.attachment > 0;
  if (hasSat) withSatellite++;
  if (adm.count > 0) withAdmrul++;
  if (portalHits.length) withPortalSubstr++;
  if (clip > 0) withClip++;

  enriched.push({
    ...row,
    extended: { counts, admrulRows: adm.count, portalHits, clipAnnexRows: clip },
  });
}

const notInMissingButAnnex = [
  ...(gap.noBodyHasAnnex ?? []),
  ...(gap.noBodyHasAddendumOnly ?? []),
];

const payload = {
  generatedAt: new Date().toISOString(),
  excelAnnexFormDocTypeRows: annexFormExcel.length,
  excelAnnexFormSample: annexFormExcel.slice(0, 15),
  missing144: {
    total: missing.length,
    withAnySatelliteTable: withSatellite,
    withAdmrulAnnexes: withAdmrul,
    withPortalIdInOtherParam: withPortalSubstr,
    withClipAnnexForms: withClip,
    hits: enriched.filter(
      (r) =>
        r.extended.counts.annex > 0 ||
        r.extended.counts.addendum > 0 ||
        r.extended.counts.attachment > 0 ||
        r.extended.admrulRows > 0 ||
        r.extended.portalHits.length > 0 ||
        r.extended.clipAnnexRows > 0,
    ),
  },
  collectedButBodyEmpty: {
    noBodyHasAnnex: gap.noBodyHasAnnex ?? [],
    noBodyHasAddendumOnly: gap.noBodyHasAddendumOnly ?? [],
    note: "목록에는 적재됨(table_in_db). 본문 탭은 비지만 부칙·별표 탭에 데이터 있음.",
  },
  all: enriched,
};

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify(payload.missing144, null, 2));
console.log("collectedButBodyEmpty noBodyHasAnnex:", notInMissingButAnnex.length);
for (const x of notInMissingButAnnex) {
  console.log(" ", x.param, x.description?.slice(0, 60));
}
console.log("Written", OUT);
db.close();
