import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });

const types = db
  .prepare(
    `SELECT law_type, COUNT(*) n FROM raw WHERE gubun='관세관련' GROUP BY law_type ORDER BY n DESC`,
  )
  .all();
console.log("law_type 분포:", types);

const admin = db
  .prepare(
    `SELECT law_id, law_name, law_type FROM raw 
     WHERE gubun='관세관련' 
     AND (law_type LIKE '%고시%' OR law_type LIKE '%훈령%' OR law_type LIKE '%공고%' OR law_type = '예규')
     ORDER BY law_type, law_name LIMIT 30`,
  )
  .all();
console.log("\n고시/훈령/공고 샘플:", admin.length);
for (const r of admin) console.log(r.law_type, "|", r.law_name?.slice(0, 60));

const total = db
  .prepare("SELECT COUNT(*) n FROM raw WHERE gubun='관세관련'")
  .get();
console.log("\n관세관련 total:", total.n);

const mainRule = db
  .prepare("SELECT law_id, law_name FROM raw WHERE gubun='관세관련' AND law_name = '관세법 시행규칙'")
  .get();
console.log("관세법 시행규칙:", mainRule);
