import { DatabaseSync } from "node:sqlite";

for (const path of [
  "D:/SQLiteDB/clip_admin_rule.db",
  "D:/SQLiteDB/admin_rules.db",
]) {
  try {
    const db = new DatabaseSync(path, { readOnly: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    console.log("\n===", path, "===");
    for (const { name } of tables) {
      const n = db.prepare(`SELECT COUNT(*) c FROM "${name}"`).get().c;
      console.log(name, n);
    }
    if (tables.some((t) => t.name === "rule_master")) {
      const rm = db
        .prepare(
          "SELECT DISTINCT rule_type FROM rule_master LIMIT 20",
        )
        .all()
        .catch?.(() => []);
    }
  } catch (e) {
    console.log(path, e.message);
  }
}
