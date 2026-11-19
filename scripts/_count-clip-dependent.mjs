import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/clip_admin_rule.db", { readOnly: true });
const byType = db
  .prepare(
    `SELECT rule_type, COUNT(*) c FROM admin_rule 
     WHERE rule_type IN ('고시','훈령','공고','예규')
     GROUP BY rule_type`,
  )
  .all();
console.log("all dependent by type:", byType);

const customs = db
  .prepare(
    `SELECT COUNT(*) c FROM admin_rule 
     WHERE rule_type IN ('고시','훈령','공고','예규')
     AND (rule_name LIKE '%관세%' OR rule_name LIKE '%관세청%' OR rule_name LIKE '%보세%' OR rule_name LIKE '%통관%')`,
  )
  .get();
console.log("customs keyword filter:", customs.c);
