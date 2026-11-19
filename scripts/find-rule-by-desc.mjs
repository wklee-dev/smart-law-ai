import { DatabaseSync } from "node:sqlite";

const descPart = process.argv[2] || "\uac10\uc0ac\uc6d0\uc2ec\uc0ac";
const dbPath =
  process.env.ADMIN_RULES_DB_PATH ||
  process.env.SMART_LAW_SQLITE_DB_PATH ||
  "D:/SQLiteDB/smart_law_ai.db";
const db = new DatabaseSync(dbPath, { readOnly: true });

const rows = db
  .prepare(
    `SELECT param, description, gubun, url FROM rule_master WHERE description LIKE ?`,
  )
  .all(`%${descPart}%`);

console.log("rule_master", rows);

for (const r of rows) {
  const p = String(r.param);
  for (const t of ["admin_rule", "admin_rule_addendum", "admin_rule_annex", "raw_rule"]) {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE param = ?`).get(p)?.n;
    if (n) console.log(t, p, n);
  }
}

// fuzzy: any admin_rule with title containing
const art = db
  .prepare(
    `SELECT DISTINCT param FROM admin_rule WHERE article_title LIKE ? OR article_content LIKE ? LIMIT 5`,
  )
  .all(`%${descPart}%`, `%${descPart}%`);
console.log("admin_rule content match params", art);

db.close();
