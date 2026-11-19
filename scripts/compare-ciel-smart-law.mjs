import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const cielPath = "D:/SQLiteDB/ciel.db";
const lawPath = "D:/SQLiteDB/smart_law_ai.db";

function all(db, sql, params = []) {
  return db.prepare(sql).all(...params);
}

const out = { ciel: {}, smart: {} };

if (fs.existsSync(cielPath)) {
  const db = new DatabaseSync(cielPath, { readOnly: true });
  out.ciel.menus = all(
    db,
    `SELECT screen, parent_title, title, url FROM menu_list ORDER BY sort_order, id`,
  );
  out.ciel.menuCount = out.ciel.menus.length;
  out.ciel.lawContentCount = all(db, `SELECT COUNT(*) AS n FROM law_content`)[0]?.n;
  out.ciel.byScreen = all(
    db,
    `SELECT screen, COUNT(*) AS n FROM menu_list GROUP BY screen ORDER BY screen`,
  );
  db.close();
} else {
  out.ciel = { missing: cielPath };
}

if (fs.existsSync(lawPath)) {
  const db = new DatabaseSync(lawPath, { readOnly: true });
  const tables = all(
    db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  const rowCounts = {};
  for (const { name } of tables) {
    try {
      rowCounts[name] = all(db, `SELECT COUNT(*) AS n FROM "${name}"`)[0]?.n;
    } catch {
      rowCounts[name] = null;
    }
  }
  out.smart.rowCounts = rowCounts;
  db.close();
} else {
  out.smart = { missing: lawPath };
}

console.log(JSON.stringify(out, null, 2));
