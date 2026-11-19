import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/admin_rules.db", { readOnly: true });

const cols = db.prepare("PRAGMA table_info(raw_rule)").all();
console.log("raw_rule columns:", cols.map((c) => c.name));

const types = db
  .prepare(
    `SELECT law_type, COUNT(*) n FROM raw_rule GROUP BY law_type ORDER BY n DESC LIMIT 20`,
  )
  .all();
console.log("\nlaw_type in admin_rules.raw_rule:", types);

const admin = db
  .prepare(
    `SELECT law_id, law_name, law_type, param, gubun FROM raw_rule 
     WHERE law_type IN ('고시','훈령','공고','예규') 
        OR law_type LIKE '%고시%' OR law_type LIKE '%훈령%' OR law_type LIKE '%공고%'
     LIMIT 20`,
  )
  .all();
console.log("\n고시/훈령/공고 sample:", admin.length);
for (const r of admin) console.log(r.law_type, r.param, "|", r.law_name?.slice(0, 55));

const customs = db
  .prepare(
    `SELECT COUNT(*) n FROM raw_rule WHERE gubun='관세관련' OR param LIKE '%관세%'`,
  )
  .get();
console.log("\ncustoms related:", customs);

const total = db.prepare("SELECT COUNT(*) n FROM raw_rule").get();
console.log("raw_rule total:", total.n);
