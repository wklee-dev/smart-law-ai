/**
 * 세계HS 개정표 크롤러 DB → D:/SQLiteDB/smart_law_ai.db 병합
 *
 * Usage:
 *   node scripts/merge-world-hs-revision-db.mjs [sourceDb]
 *
 * 크롤러는 실행 파일과 같은 폴더의 smart_law_ai.db에 적재합니다.
 * 재크롤링 후 이 스크립트로 앱 DB에 반영하세요.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";

const targetDb = "D:/SQLiteDB/smart_law_ai.db";
const defaultSource =
  "D:/Manus/관세법령정보포털_세계HS/1.세계HS개정표/2026-09-11 V2/World_HS_Revision_Crawler_V1.0/World_HS_Revision_Crawler_V1.0/smart_law_ai.db";
const sourceDb = process.argv[2] || defaultSource;

function tableExists(db, name, schema = "main") {
  const prefix = schema === "main" ? "" : `${schema}.`;
  const row = db
    .prepare(
      `SELECT name FROM ${schema === "main" ? "sqlite_master" : `${schema}.sqlite_master`} WHERE type='table' AND name=?`,
    )
    .get(name);
  return Boolean(row?.name);
}

if (!fs.existsSync(sourceDb)) {
  console.error("source DB 없음:", sourceDb);
  console.error("크롤러 폴더의 smart_law_ai.db 경로를 인자로 지정하세요.");
  process.exit(1);
}
if (!fs.existsSync(targetDb)) {
  console.error("target DB 없음:", targetDb);
  process.exit(1);
}

const srcProbe = new DatabaseSync(sourceDb, { readOnly: true });
if (!tableExists(srcProbe, "world_hs_revision")) {
  srcProbe.close();
  console.error("source에 world_hs_revision 테이블이 없습니다:", sourceDb);
  process.exit(1);
}
const versionCounts = srcProbe
  .prepare(
    `SELECT version_pair, COUNT(*) AS row_count
     FROM world_hs_revision
     GROUP BY version_pair
     ORDER BY version_pair DESC`,
  )
  .all();
console.log("source 버전별 건수:");
for (const row of versionCounts) {
  console.log(`  ${row.version_pair}: ${row.row_count}`);
}
srcProbe.close();

const db = new DatabaseSync(targetDb);
db.exec("PRAGMA foreign_keys = OFF");
const attachPath = sourceDb.replace(/\\/g, "/").replace(/'/g, "''");
db.exec(`ATTACH DATABASE '${attachPath}' AS src`);

const tables = [
  "world_hs_revision",
  "world_hs_revision_crawl_run",
  "world_hs_revision_crawl_checkpoint",
];

for (const table of tables) {
  const srcHas = db
    .prepare(
      "SELECT name FROM src.sqlite_master WHERE type='table' AND name=?",
    )
    .get(table);
  if (!srcHas?.name) {
    console.log(`${table}: source에 없음 — 건너뜀`);
    continue;
  }
  const srcCount = db.prepare(`SELECT COUNT(*) AS n FROM src.${table}`).get().n;
  db.exec(
    `CREATE TABLE IF NOT EXISTS ${table} AS SELECT * FROM src.${table} WHERE 0`,
  );
  db.exec(`DELETE FROM ${table}`);
  db.exec(`INSERT INTO ${table} SELECT * FROM src.${table}`);
  const dstCount = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  console.log(`${table}: ${srcCount} → ${dstCount}`);
}

console.log("\ntarget 버전별 건수:");
const dstVersions = db
  .prepare(
    `SELECT version_pair, COUNT(*) AS row_count
     FROM world_hs_revision
     GROUP BY version_pair
     ORDER BY version_pair DESC`,
  )
  .all();
for (const row of dstVersions) {
  console.log(`  ${row.version_pair}: ${row.row_count}`);
}

db.exec("DETACH DATABASE src");
db.close();
console.log("\nmerge complete:", targetDb);
