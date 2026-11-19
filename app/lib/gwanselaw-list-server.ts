import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  prepareApiManagementList,
  type ApiManagementListItem,
} from "@/app/shared/api-management-list";
import {
  isSmartLawPostgres,
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

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
CREATE INDEX IF NOT EXISTS idx_gwanselaw_list_division ON gwanselaw_list(division);
`;

type GwanselawListRow = {
  id: string;
  division: string;
  category: string;
  upload_order: number;
  api_name: string;
  law_short_name: string;
  law_id: string;
  file_type: string;
  portal_category: string;
  updated_at: string;
  last_received_eflaw_josub: string;
  last_received_admrul_body: string;
};

/** SQLite 파일이 없을 때 writable open 전에 빈 DB 생성 */
function ensureSqliteFileExists(): void {
  const p = path.resolve(getSmartLawSqliteDbPath().trim());
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(p)) {
    const init = new DatabaseSync(p);
    init.close();
  }
}

export function getGwanselawListDbPath(): string {
  return path.resolve(getSmartLawSqliteDbPath().trim());
}

export async function ensureGwanselawListTable(db: SmartLawDb): Promise<void> {
  await db.exec(CREATE_TABLE_SQL);
}

function rowToItem(row: GwanselawListRow): ApiManagementListItem {
  return {
    id: row.id,
    division: row.division ?? "",
    category: row.category ?? "",
    uploadOrder: row.upload_order ?? 0,
    apiName: row.api_name ?? "",
    lawShortName: row.law_short_name ?? "",
    lawId: row.law_id ?? "",
    fileType:
      row.file_type === "JSON" || row.file_type === "CSV"
        ? row.file_type
        : "XML",
    portalCategory: row.portal_category ?? "",
    updatedAt: row.updated_at ?? "",
    lastReceivedEflawJosub: row.last_received_eflaw_josub ?? "",
    lastReceivedAdmrulBody: row.last_received_admrul_body ?? "",
  };
}

function itemToRow(item: ApiManagementListItem): GwanselawListRow {
  return {
    id: item.id,
    division: item.division,
    category: item.category,
    upload_order: item.uploadOrder,
    api_name: item.apiName,
    law_short_name: item.lawShortName,
    law_id: item.lawId,
    file_type: item.fileType,
    portal_category: item.portalCategory ?? "",
    updated_at: item.updatedAt,
    last_received_eflaw_josub: item.lastReceivedEflawJosub,
    last_received_admrul_body: item.lastReceivedAdmrulBody,
  };
}

const SELECT_ALL_SQL = `
  SELECT
    id, division, category, upload_order, api_name, law_short_name,
    law_id, file_type, portal_category, updated_at,
    last_received_eflaw_josub, last_received_admrul_body
  FROM gwanselaw_list
  ORDER BY upload_order ASC, api_name ASC
`;

const INSERT_SQL = `
  INSERT INTO gwanselaw_list (
    id, division, category, upload_order, api_name, law_short_name,
    law_id, file_type, portal_category, updated_at,
    last_received_eflaw_josub, last_received_admrul_body
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

async function listRows(db: SmartLawDb): Promise<GwanselawListRow[]> {
  if (!(await smartLawTableExists(db, "gwanselaw_list"))) return [];
  return (await db.all(SELECT_ALL_SQL)) as GwanselawListRow[];
}

export async function listGwanselawItemsFromDb(): Promise<
  ApiManagementListItem[]
> {
  const db = await openSmartLawDb(true);
  try {
    const rows = await listRows(db);
    return prepareApiManagementList(rows.map(rowToItem));
  } finally {
    await db.close();
  }
}

/**
 * 목록을 정규화·중복제거한 뒤, 행 수가 줄었으면 DB에 반영합니다.
 */
export async function listAndPersistDedupedGwanselawItems(): Promise<{
  data: ApiManagementListItem[];
  deduped: boolean;
  beforeCount: number;
  afterCount: number;
}> {
  const db = await openSmartLawDb(true);
  let beforeCount = 0;
  let rawItems: ApiManagementListItem[] = [];
  try {
    const rows = await listRows(db);
    rawItems = rows.map(rowToItem);
    beforeCount = rawItems.length;
  } finally {
    await db.close();
  }

  const data = prepareApiManagementList(rawItems);
  const afterCount = data.length;
  if (afterCount < beforeCount) {
    await saveGwanselawItemsToDb(data);
    return { data, deduped: true, beforeCount, afterCount };
  }
  return { data, deduped: false, beforeCount, afterCount };
}

export async function saveGwanselawItemsToDb(
  items: (Partial<ApiManagementListItem> & Record<string, unknown>)[],
): Promise<ApiManagementListItem[]> {
  const prepared = prepareApiManagementList(items);
  if (!isSmartLawPostgres()) ensureSqliteFileExists();
  const db = await openSmartLawDb(false);
  try {
    await ensureGwanselawListTable(db);
    await db.exec("BEGIN");
    try {
      await db.exec("DELETE FROM gwanselaw_list");
      for (const item of prepared) {
        const row = itemToRow(item);
        await db.all(INSERT_SQL, [
          row.id,
          row.division,
          row.category,
          row.upload_order,
          row.api_name,
          row.law_short_name,
          row.law_id,
          row.file_type,
          row.portal_category,
          row.updated_at,
          row.last_received_eflaw_josub,
          row.last_received_admrul_body,
        ]);
      }
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }
    return prepared;
  } finally {
    await db.close();
  }
}

export async function countGwanselawItemsInDb(): Promise<number> {
  const db = await openSmartLawDb(true);
  try {
    if (!(await smartLawTableExists(db, "gwanselaw_list"))) return 0;
    const row = await db.get("SELECT COUNT(*) AS c FROM gwanselaw_list");
    return Number(row?.c) || 0;
  } finally {
    await db.close();
  }
}
