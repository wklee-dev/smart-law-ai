/**
 * 크롤러 기본 DB(data/smart_law_ai.db) → D:/SQLiteDB/smart_law_ai.db 병합
 * Usage: node scripts/merge-hs-import-guide-db.mjs [sourceDb]
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const targetDb = "D:/SQLiteDB/smart_law_ai.db";
const sourceDb =
  process.argv[2] ||
  "D:/Manus/관세법령정보포털_통관정보/8.HS별 품명규격 신고가이드/2026-09-11 V1/data/smart_law_ai.db";

if (!fs.existsSync(sourceDb)) {
  console.error("source DB 없음:", sourceDb);
  process.exit(1);
}
if (!fs.existsSync(targetDb)) {
  console.error("target DB 없음:", targetDb);
  process.exit(1);
}

const db = new DatabaseSync(targetDb);
db.exec("PRAGMA foreign_keys = OFF");
db.exec(`ATTACH DATABASE '${sourceDb.replace(/'/g, "''")}' AS src`);

const tables = [
  "hs_import_declaration_guide",
  "hs_import_declaration_guide_sync_runs",
  "hs_import_declaration_guide_files",
];

for (const table of tables) {
  const srcCount = db
    .prepare(`SELECT COUNT(*) AS n FROM src.${table}`)
    .get().n;
  db.exec(`CREATE TABLE IF NOT EXISTS ${table} AS SELECT * FROM src.${table} WHERE 0`);
  db.exec(`DELETE FROM ${table}`);
  db.exec(`INSERT INTO ${table} SELECT * FROM src.${table}`);
  const dstCount = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  console.log(`${table}: ${srcCount} → ${dstCount}`);
}

db.exec("DETACH DATABASE src");
db.close();
console.log("merge complete:", targetDb);
