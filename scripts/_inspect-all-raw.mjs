import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });

const allTypes = db.prepare("SELECT DISTINCT law_type FROM raw ORDER BY law_type").all();
console.log("all law_types:", allTypes.map((r) => r.law_type));

const byGubun = db
  .prepare("SELECT gubun, COUNT(*) n FROM raw GROUP BY gubun ORDER BY n DESC")
  .all();
console.log("\ngubun:", byGubun);

const nameSearch = db
  .prepare(
    `SELECT law_name, law_type, gubun FROM raw 
     WHERE law_name LIKE '%고시%' OR law_name LIKE '%훈령%' OR law_name LIKE '%공고%'
     OR law_type LIKE '%고시%' OR law_type LIKE '%훈령%' OR law_type LIKE '%공고%'
     LIMIT 40`,
  )
  .all();
console.log("\nname/type search:", nameSearch.length);
for (const r of nameSearch) console.log(r.gubun, r.law_type, "|", r.law_name?.slice(0, 55));

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all();
console.log("\ntables:", tables.map((t) => t.name));

for (const t of tables.map((x) => x.name)) {
  if (t.startsWith("raw")) {
    const c = db.prepare(`SELECT COUNT(*) n FROM "${t}"`).get();
    console.log(t, "rows:", c.n);
  }
}
