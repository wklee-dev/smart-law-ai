/**
 * data/api-management-list.json → smart_law_ai.db gwanselaw_list 이전
 * 사용: node scripts/migrate-api-management-to-gwanselaw-list.mjs
 */
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const jsonPath = path.join(root, "data", "api-management-list.json");
const dbPath =
  process.env.SMART_LAW_SQLITE_DB_PATH?.trim() ||
  process.env.SMART_LAW_DB_PATH?.trim() ||
  "D:/SQLiteDB/smart_law_ai.db";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS gwanselaw_list (
  id TEXT PRIMARY KEY NOT NULL,
  division TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  upload_order INTEGER NOT NULL DEFAULT 0,
  api_name TEXT NOT NULL DEFAULT '',
  law_short_name TEXT NOT NULL DEFAULT '',
  law_id TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT 'XML',
  portal_category TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT '',
  last_received_eflaw_josub TEXT NOT NULL DEFAULT '',
  last_received_admrul_body TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_gwanselaw_list_law_id ON gwanselaw_list(law_id);
CREATE INDEX IF NOT EXISTS idx_gwanselaw_list_upload_order ON gwanselaw_list(upload_order);
`;

const raw = readFileSync(jsonPath, "utf-8");
const items = JSON.parse(raw);
if (!Array.isArray(items)) {
  throw new Error("api-management-list.json must be an array");
}

const db = new DatabaseSync(path.resolve(dbPath));
db.exec(CREATE_TABLE_SQL);

const existing = db.prepare("SELECT COUNT(*) AS c FROM gwanselaw_list").get();
console.log(`DB: ${dbPath}`);
console.log(`기존 gwanselaw_list: ${existing.c}건`);
console.log(`JSON: ${items.length}건`);

const insert = db.prepare(`
  INSERT OR REPLACE INTO gwanselaw_list (
    id, division, category, upload_order, api_name, law_short_name,
    law_id, file_type, portal_category, updated_at,
    last_received_eflaw_josub, last_received_admrul_body
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

db.exec("BEGIN");
try {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const fileType =
      item.fileType === "JSON" || item.fileType === "CSV"
        ? item.fileType
        : "XML";
    insert.run(
      item.id,
      item.division ?? "",
      item.category ?? "",
      item.uploadOrder ?? i + 1,
      item.apiName ?? "",
      item.lawShortName ?? "",
      item.lawId ?? "",
      fileType,
      item.portalCategory ?? "",
      item.updatedAt ?? "",
      item.lastReceivedEflawJosub ?? "",
      item.lastReceivedAdmrulBody ?? "",
    );
  }
  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}

const after = db.prepare("SELECT COUNT(*) AS c FROM gwanselaw_list").get();
console.log(`이전 완료: gwanselaw_list ${after.c}건`);
db.close();
