import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const stat = fs.statSync("D:/SQLiteDB/raw_rule.db");
console.log("db size:", stat.size, "mtime:", stat.mtime);

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });
console.log("row count:", db.prepare("SELECT COUNT(*) n FROM raw").get().n);

const patterns = db
  .prepare(
    `SELECT law_name, law_type FROM raw 
     WHERE law_name LIKE '%관세청%' OR law_name LIKE '%(국세청)%' OR law_name LIKE '%고시%'
        OR law_name LIKE '%훈령%' OR law_name LIKE '%공고%'
     LIMIT 30`,
  )
  .all();
console.log("pattern matches:", patterns.length);
for (const r of patterns) console.log(r.law_type, "|", r.law_name?.slice(0, 60));
