import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/smart_law_ai.db", { readOnly: true });
const rows = db
  .prepare(
    `SELECT l.law_name_kr, l.law_id
     FROM laws l
     JOIN law_versions v ON v.law_id = l.id
     WHERE v.is_current = 1 AND l.law_name_kr LIKE '%관세법%'
     ORDER BY l.law_name_kr`,
  )
  .all();
console.log("smart_law_ai 관세법:", rows.length);
for (const r of rows) console.log(r.law_name_kr, r.law_id);
