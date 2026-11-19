import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });
const cols = db.prepare("PRAGMA table_info(raw)").all();
console.log("raw columns:", cols.map((c) => c.name).join(", "));
console.log("count:", db.prepare("SELECT COUNT(*) as c FROM raw").get().c);
const parent = db
  .prepare(
    "SELECT COUNT(*) as c FROM raw WHERE parent_internal_id IS NOT NULL AND TRIM(parent_internal_id) != ''",
  )
  .get();
console.log("with parent_internal_id:", parent.c);
const sample = db
  .prepare(
    "SELECT internal_id, law_id, law_name, law_type, parent_internal_id, gubun FROM raw LIMIT 5",
  )
  .all();
console.log("sample:", JSON.stringify(sample, null, 2));

const gubun = "관세법령";
const rows = db
  .prepare(
    "SELECT internal_id, law_name, law_type, parent_internal_id, meta_info FROM raw WHERE gubun = ? LIMIT 20",
  )
  .all(gubun);
console.log("\n=== 관세법령 샘플 ===");
for (const r of rows) {
  console.log(
    r.internal_id,
    "parent=" + (r.parent_internal_id ?? ""),
    "| name:",
    JSON.stringify(r.law_name),
    "| type:",
    (r.law_type ?? "").slice(0, 90),
  );
}

const emptyName = db
  .prepare(
    "SELECT COUNT(*) as c FROM raw WHERE law_name IS NULL OR TRIM(law_name) = ''",
  )
  .get();
console.log("\nempty law_name:", emptyName.c);
