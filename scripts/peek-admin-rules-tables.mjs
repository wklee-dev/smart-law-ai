import { DatabaseSync } from "node:sqlite";

for (const p of ["D:/SQLiteDB/smart_law_ai.db", "D:/SQLiteDB/admin_rules.db"]) {
  console.log("\n===", p, "===");
  try {
    const db = new DatabaseSync(p, { readOnly: true });
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND (
          name LIKE 'rule_%' OR name LIKE 'admin_rule%' OR name LIKE 'raw_rule%'
        ) ORDER BY name`,
      )
      .all();
    console.log("tables", tables.map((t) => t.name));
    for (const name of ["rule_master", "rule_config", "admin_rule"]) {
      if (tables.some((t) => t.name === name)) {
        const n = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get()?.n;
        console.log(name, "rows", n);
      }
    }
    db.close();
  } catch (e) {
    console.log("err", e.message);
  }
}
