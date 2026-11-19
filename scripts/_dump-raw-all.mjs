import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });
const rows = db
  .prepare(
    "SELECT law_id, law_name, law_type FROM raw WHERE gubun='관세관련' ORDER BY law_type, law_name",
  )
  .all();

console.log("total:", rows.length);
const byType = {};
for (const r of rows) {
  byType[r.law_type] = (byType[r.law_type] ?? 0) + 1;
}
console.log("by type:", byType);

// show non-standard types
for (const r of rows) {
  if (!["법률", "대통령령", "기획재정부령", "재정경제부령", "보건복지부령", "대법원규칙"].includes(r.law_type)) {
    console.log("UNUSUAL:", r.law_type, r.law_name);
  }
}

// check related rules from decree
const decree = db
  .prepare("SELECT law_id FROM raw WHERE law_name='관세법 시행령'")
  .get();
console.log("\n관세법 시행령 id:", decree?.law_id);
