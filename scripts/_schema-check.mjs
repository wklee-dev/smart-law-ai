import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/raw_rule.db", { readOnly: true });
const schema = db.prepare("PRAGMA table_info(raw)").all();
console.log("raw columns:", schema);

const sample = db.prepare("SELECT * FROM raw LIMIT 1").get();
console.log("sample keys:", Object.keys(sample ?? {}));

// check admin_rules.db for 고시
try {
  const adb = new DatabaseSync("D:/SQLiteDB/admin_rules.db", { readOnly: true });
  const tables = adb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log("\nadmin_rules tables:", tables.map((t) => t.name));
} catch (e) {
  console.log("admin_rules error", e.message);
}

try {
  const adb = new DatabaseSync("D:/SQLiteDB/clip_admin_rule.db", { readOnly: true });
  const types = adb
    .prepare("SELECT DISTINCT law_type FROM admin_rule LIMIT 20")
    .all()
    .catch?.(() => []);
} catch {}
