import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/SQLiteDB/smart_law_ai.db", { readOnly: true });
const tables = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'kita%' ORDER BY name`,
  )
  .all();
console.log("tables", tables);
for (const { name } of tables) {
  const c = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get()?.n;
  console.log(name, c);
}
if (tables.some((t) => t.name === "kita_strategic_material_mapping")) {
  const sample = db
    .prepare(
      `SELECT m.hs_code, h.hs_name_ko, m.control_no, length(m.content_ko) AS ko_len
       FROM kita_strategic_material_mapping m
       LEFT JOIN kita_strategic_material_hs h ON h.hs_code = m.hs_code
       LIMIT 3`,
    )
    .all();
  console.log("sample", sample);
}
db.close();
