import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });
const r = db
  .prepare(
    "SELECT law_id, law_name, substr(content,1,800) as c FROM raw WHERE law_name = ?",
  )
  .get("관세법 시행령");
console.log(JSON.stringify(r, null, 2));
