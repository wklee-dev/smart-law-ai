import { DatabaseSync } from "node:sqlite";

// Inline minimal test without path aliases
const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });
const rows = db
  .prepare("SELECT law_id, law_name, law_type FROM raw WHERE gubun='관세관련' LIMIT 3")
  .all();
console.log("sample:", rows);
const detail = db
  .prepare("SELECT length(content) as len FROM raw WHERE law_name='관세법 시행령'")
  .get();
console.log("content length:", detail);
