import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/smart_law_ai.db", { readOnly: true });
const tables = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%catalog%' OR name='rule_config') ORDER BY name`,
  )
  .all();
console.log("tables:", tables);

try {
  const total = db.prepare("SELECT COUNT(*) AS n FROM law_source_catalog").get();
  console.log("law_source_catalog total:", total);
  const rows = db
    .prepare(
      `SELECT gubun, classification, law_name, law_id, source_url, url_type
       FROM law_source_catalog WHERE gubun >= 460 ORDER BY gubun`,
    )
    .all();
  console.log(JSON.stringify(rows, null, 2));
} catch (e) {
  console.log("law_source_catalog error:", e.message);
}

try {
  const rc = db.prepare("SELECT COUNT(*) AS n FROM rule_config").get();
  console.log("rule_config total:", rc);
  const last = db
    .prepare(
      `SELECT param, gubun, table_name, description, url FROM rule_config ORDER BY rowid DESC LIMIT 15`,
    )
    .all();
  console.log("rule_config last:", JSON.stringify(last, null, 2));
} catch (e) {
  console.log("rule_config error:", e.message);
}
