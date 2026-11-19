import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const dbPath =
  process.env.ADMIN_RULES_DB_PATH ||
  process.env.SMART_LAW_SQLITE_DB_PATH ||
  "D:/SQLiteDB/smart_law_ai.db";

const db = new DatabaseSync(dbPath, { readOnly: true });

function count(table, param) {
  try {
    return (
      db.prepare(`SELECT COUNT(*) AS n FROM "${table}" WHERE param = ?`).get(param)
        ?.n ?? 0
    );
  } catch {
    return -1;
  }
}

const hasRaw = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='raw_rule'",
  )
  .get();

const rules = db
  .prepare(
    `SELECT param, description, gubun, url FROM rule_master ORDER BY description`,
  )
  .all();

const noAny = [];
const bodyMissingSatelliteOnly = [];
const bodyPresent = [];

for (const r of rules) {
  const p = String(r.param);
  const main = count("admin_rule", p);
  const add = count("admin_rule_addendum", p);
  const ann = count("admin_rule_annex", p);
  const att = count("admin_rule_attachment", p);
  let rawMain = 0;
  let rawAdd = 0;
  let rawAnn = 0;
  if (hasRaw) {
    rawMain = count("raw_rule", p);
    rawAdd = count("raw_rule_addendum", p);
    rawAnn = count("raw_rule_annex", p);
  }

  const hasBody = main > 0 || rawMain > 0;
  const hasSatellite =
    add > 0 || ann > 0 || att > 0 || rawAdd > 0 || rawAnn > 0;
  const hasAny = hasBody || hasSatellite;

  const row = {
    param: p,
    description: r.description,
    gubun: r.gubun,
    admin_rule: main,
    addendum: add,
    annex: ann,
    attachment: att,
    raw_rule: rawMain,
  };

  if (!hasAny) {
    noAny.push(row);
  } else if (!hasBody && hasSatellite) {
    bodyMissingSatelliteOnly.push(row);
  } else if (hasBody) {
    bodyPresent.push(row);
  }
}

console.log("DB:", dbPath);
console.log("rule_master:", rules.length);
console.log("본문 있음 (admin_rule 또는 raw_rule):", bodyPresent.length);
console.log(
  "본문 없음 · 부칙/별표/첨부만 있음 (화면 본문 탭 비어 있을 수 있음):",
  bodyMissingSatelliteOnly.length,
);
console.log("admin_rule* 전부 없음 (rule_master만 존재):", noAny.length);

console.log("\n--- 본문 없음 · 부칙/별표 등만 ---");
for (const x of bodyMissingSatelliteOnly) {
  console.log(
    `- [${x.param}] ${x.description} (부칙 ${x.addendum}, 별표 ${x.annex}, 첨부 ${x.attachment})`,
  );
}

console.log("\n--- rule_master만 · DB 본문/부칙/별표 없음 ---");
for (const x of noAny) {
  console.log(`- [${x.param}] ${x.description}`);
}

const outPath = "d:/CursorProject/smart-law-ai/scripts/_audit-admin-rules-body.json";
fs.writeFileSync(
  outPath,
  JSON.stringify(
    {
      dbPath,
      summary: {
        rule_master: rules.length,
        bodyPresent: bodyPresent.length,
        bodyMissingSatelliteOnly: bodyMissingSatelliteOnly.length,
        noRenderableRows: noAny.length,
      },
      bodyMissingSatelliteOnly,
      noRenderableRows: noAny,
    },
    null,
    2,
  ),
  "utf8",
);
console.log("\nWrote", outPath);

db.close();
