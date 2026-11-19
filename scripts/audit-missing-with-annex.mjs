/**
 * 미적재(144) 건 — param 외 law_name·별표/부칙/본문 분리 점검
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
const OUT = path.join(process.cwd(), "scripts/admin-rules-missing-body-enriched.json");

function norm(name) {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function paramVariants(param) {
  const set = new Set([param]);
  if (param.startsWith("crawl-")) {
    set.add(param.replace("crawl-", "crawl_"));
    set.add(param.replace("crawl-", ""));
  }
  if (param.startsWith("crawl_")) {
    set.add(param.replace("crawl_", "crawl-"));
  }
  return [...set];
}

function countByParam(db, table, param) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
    return 0;
  }
  let n = 0;
  for (const p of paramVariants(param)) {
    n += db.prepare(`SELECT COUNT(1) c FROM "${table}" WHERE param = ?`).get(p).c;
  }
  return n;
}

function countByLawName(db, table, lawName) {
  if (!lawName || !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) {
    return 0;
  }
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes("law_name")) return 0;
  return db
    .prepare(`SELECT COUNT(1) c FROM "${table}" WHERE law_name = ?`)
    .get(lawName).c;
}

function presence(db, param, lawName) {
  const tables = [
    "admin_rule",
    "admin_rule_addendum",
    "admin_rule_annex",
    "admin_rule_attachment",
    "raw_rule",
    "raw_rule_addendum",
    "raw_rule_annex",
    "raw_rule_attachment",
  ];
  const byParam = { body: 0, addendum: 0, annex: 0, attachment: 0 };
  const byName = { body: 0, addendum: 0, annex: 0, attachment: 0 };

  for (const t of tables) {
    const cParam = countByParam(db, t, param);
    const cName = countByLawName(db, t, lawName);
    if (t.endsWith("_annex")) {
      byParam.annex += cParam;
      byName.annex += cName;
    } else if (t.endsWith("_addendum")) {
      byParam.addendum += cParam;
      byName.addendum += cName;
    } else if (t.endsWith("_attachment")) {
      byParam.attachment += cParam;
      byName.attachment += cName;
    } else {
      byParam.body += cParam;
      byName.body += cName;
    }
  }

  const best = {
    body: Math.max(byParam.body, byName.body),
    addendum: Math.max(byParam.addendum, byName.addendum),
    annex: Math.max(byParam.annex, byName.annex),
    attachment: Math.max(byParam.attachment, byName.attachment),
  };
  const anyParam =
    byParam.body + byParam.addendum + byParam.annex + byParam.attachment > 0;
  const anyName =
    byName.body + byName.addendum + byName.annex + byName.attachment > 0;
  const annexOnly =
    best.body === 0 && best.addendum === 0 && best.annex > 0;
  const attachmentOnly =
    best.body === 0 &&
    best.addendum === 0 &&
    best.annex === 0 &&
    best.attachment > 0;
  const hasAnnex = best.annex > 0;

  return {
    byParam,
    byName,
    best,
    anyParam,
    anyName,
    annexOnly,
    attachmentOnly,
    hasAnnex,
  };
}

const db = new DatabaseSync(DB, { readOnly: true });
const missing = JSON.parse(fs.readFileSync(MISSING_JSON, "utf8")).missing;

const enriched = [];
let annexOnlyCount = 0;
let attachmentOnlyCount = 0;
let hasAnnexNotBody = 0;
let foundByLawNameOnly = 0;
let stillEmpty = 0;

for (const row of missing) {
  const lawName = norm(row.description);
  const p = presence(db, row.param, lawName);
  let category = "empty";
  const total =
    p.best.body + p.best.addendum + p.best.annex + p.best.attachment;
  if (total === 0) {
    category = "empty";
    stillEmpty++;
  } else if (p.annexOnly) {
    category = "annex_only";
    annexOnlyCount++;
  } else if (p.attachmentOnly) {
    category = "attachment_only";
    attachmentOnlyCount++;
  } else if (p.best.body === 0 && p.hasAnnex) {
    category = "annex_with_addendum_no_body";
    hasAnnexNotBody++;
  } else if (!p.anyParam && p.anyName) {
    category = "law_name_match_only";
    foundByLawNameOnly++;
  } else {
    category = "partial_other";
  }

  enriched.push({
    ...row,
    audit: {
      category,
      counts: p.best,
      byParam: p.byParam,
      byLawName: p.byName,
    },
  });
}

enriched.sort((a, b) => a.description.localeCompare(b.description, "ko"));

const payload = {
  generatedAt: new Date().toISOString(),
  sourceMissingFile: MISSING_JSON,
  totalMissingInList: missing.length,
  summary: {
    stillEmpty,
    annexOnly: annexOnlyCount,
    attachmentOnly: attachmentOnlyCount,
    annexNoBodyOther: hasAnnexNotBody,
    lawNameMatchOnly: foundByLawNameOnly,
    partialOther: enriched.filter((r) => r.audit.category === "partial_other").length,
  },
  withAnnexOrForm: enriched.filter((r) => r.audit.counts.annex > 0),
  attachmentOnly: enriched.filter((r) => r.audit.category === "attachment_only"),
  annexOnly: enriched.filter((r) => r.audit.category === "annex_only"),
  stillEmpty: enriched.filter((r) => r.audit.category === "empty"),
  all: enriched,
};

fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

console.log("Summary:", payload.summary);
console.log("With annex rows:", payload.withAnnexOrForm.length);
console.log("Written:", OUT);

console.log("\n--- annex only (first 20) ---");
for (const r of payload.annexOnly.slice(0, 20)) {
  console.log(r.param, r.audit.counts.annex, r.description.slice(0, 50));
}

db.close();
