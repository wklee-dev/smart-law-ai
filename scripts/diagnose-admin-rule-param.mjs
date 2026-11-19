import { DatabaseSync } from "node:sqlite";

const dbPath =
  process.env.ADMIN_RULES_DB_PATH ||
  process.env.SMART_LAW_SQLITE_DB_PATH ||
  "D:/SQLiteDB/smart_law_ai.db";
const needle = process.argv[2] || "감사원";

const db = new DatabaseSync(dbPath, { readOnly: true });

const meta =
  db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('rule_master','rule_config')").all();
console.log("meta tables", meta);

const table = meta.some((t) => t.name === "rule_master")
  ? "rule_master"
  : meta.some((t) => t.name === "rule_config")
    ? "rule_config"
    : null;

if (!table) {
  console.log("No rule_config/rule_master");
  process.exit(1);
}

const rules =
  needle.trim().length > 0
    ? db
        .prepare(
          table === "rule_master"
            ? `SELECT param, description, gubun, url FROM rule_master WHERE description LIKE ?`
            : `SELECT param, table_name, description, gubun, url FROM rule_config WHERE description LIKE ?`,
        )
        .all(`%${needle}%`)
    : [];

console.log("\nMatching rule_config rows:", rules);

for (const r of rules) {
  const param = String(r.param);
  console.log("\n---", r.description, "param=", param, "gubun=", r.gubun);
  for (const t of [
    "admin_rule",
    "admin_rule_addendum",
    "admin_rule_annex",
    "raw_rule",
    "raw_rule_addendum",
    "raw_rule_annex",
  ]) {
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(t);
    if (!exists) continue;
    const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name);
    const keyCol = cols.includes("param") ? "param" : cols.includes("table_name") ? "table_name" : null;
    if (!keyCol) {
      console.log(t, "columns", cols.slice(0, 8));
      continue;
    }
    const cnt = db
      .prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE "${keyCol}" = ?`)
      .get(param)?.n;
    console.log(`${t}.${keyCol}=${param} -> ${cnt} rows`);
    if (cnt === 0 && keyCol === "param" && r.table_name) {
      const cnt2 = db
        .prepare(`SELECT COUNT(*) AS n FROM "${t}" WHERE "${keyCol}" = ?`)
        .get(String(r.table_name))?.n;
      if (cnt2) console.log(`  (also tried table_name=${r.table_name} -> ${cnt2})`);
    }
  }
}

const totalAdmin = db.prepare("SELECT COUNT(DISTINCT param) AS n FROM admin_rule").get()?.n;
const totalConfig = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n;
console.log("\nTotals: rule rows", totalConfig, "distinct admin_rule.param", totalAdmin);

db.close();
