import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });

const gubuns = db
  .prepare("SELECT gubun, COUNT(*) AS n FROM raw GROUP BY gubun ORDER BY gubun")
  .all();
console.log("gubuns:", gubuns);

const types = db
  .prepare(
    "SELECT law_type, COUNT(*) AS n FROM raw WHERE gubun='관세관련' GROUP BY law_type ORDER BY n DESC",
  )
  .all();
console.log("\nlaw_types 관세관련:", types);

const rows = db
  .prepare(
    `SELECT law_id, law_name, law_type, enforcement_date, promulgation_date, promulgation_number, department
     FROM raw WHERE gubun='관세관련' ORDER BY law_name LIMIT 40`,
  )
  .all();
console.log("\nsample rows:");
for (const r of rows) {
  console.log(r.law_type, "|", r.law_name?.slice(0, 60));
}
