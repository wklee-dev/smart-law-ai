import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
for (const t of tables) {
  const c = db.prepare(`SELECT COUNT(*) n FROM "${t.name}"`).get();
  console.log(t.name, c.n);
  if (t.name.includes("sub") || t.name.includes("admin") || t.name.includes("depend")) {
    console.log("  SQL:", t.sql?.slice(0, 200));
  }
}
