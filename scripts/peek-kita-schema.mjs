import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/smart_law_ai.db", { readOnly: true });
for (const name of [
  "kita_strategic_material_hs",
  "kita_strategic_material_mapping",
  "kita_strategic_material_control",
]) {
  console.log("\n##", name);
  console.log(
    db.prepare(`PRAGMA table_info("${name}")`).all().map((c) => c.name),
  );
  console.log(db.prepare(`SELECT * FROM "${name}" LIMIT 1`).get());
}
db.close();
