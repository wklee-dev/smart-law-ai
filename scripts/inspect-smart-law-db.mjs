import { DatabaseSync } from "node:sqlite";

const p = "D:/SQLiteDB/smart_law_ai.db";
const db = new DatabaseSync(p, { readOnly: true });
const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
  .all();

console.log("TABLES:", tables.map((t) => t.name).join(", "));
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all();
  console.log(`\n## ${t.name}`);
  for (const c of cols) {
    console.log(
      `  ${c.name} ${c.type}${c.pk ? " PK" : ""}${c.notnull ? " NOT NULL" : ""}`,
    );
  }
  const cnt = db.prepare(`SELECT COUNT(*) as c FROM ${t.name}`).get();
  console.log(`  (rows: ${cnt.c})`);
}
