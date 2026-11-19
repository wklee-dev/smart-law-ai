import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all();

for (const { name } of tables) {
  const count = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get();
  const cols = db.prepare(`PRAGMA table_info(${name})`).all();
  console.log(`\n=== ${name} (${count.n}) ===`);
  for (const c of cols) console.log(`  ${c.name} ${c.type}`);
}

const sample = db
  .prepare(
    "SELECT * FROM rule_config LIMIT 5",
  )
  .all();
console.log("\nrule_config sample:", JSON.stringify(sample, null, 2));
