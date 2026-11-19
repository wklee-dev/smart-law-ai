import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/clip_admin_rule.db", { readOnly: true });

const types = db
  .prepare("SELECT rule_type, COUNT(*) n FROM admin_rule GROUP BY rule_type")
  .all();
console.log("rule_type:", types);

const admin = db
  .prepare(
    `SELECT rule_id, rule_name, rule_type FROM admin_rule 
     WHERE rule_type IN ('고시','훈령','공고','예규') LIMIT 20`,
  )
  .all();
console.log("\n고시/훈령/공고:", admin.length);
for (const r of admin) console.log(r.rule_type, "|", r.rule_name?.slice(0, 55));

const customs = db
  .prepare(
    `SELECT rule_id, rule_name, rule_type FROM admin_rule 
     WHERE rule_name LIKE '%관세%' AND rule_type IN ('고시','훈령','공고')
     LIMIT 20`,
  )
  .all();
console.log("\n관세 고시/훈령/공고:", customs.length);
for (const r of customs) console.log(r.rule_type, "|", r.rule_name?.slice(0, 55));
