import "server-only";

import type {
  FtaPortalFileRow,
  FtaPortalPostDetail,
  FtaPortalPostListRow,
} from "@/app/lib/fta-portal-board-shared";
import {
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import { yestradeNum, yestradeStr } from "@/app/lib/yestrade-sqlite";

const POST_TABLE = "fta_general_materials";
const FILE_TABLE = "fta_general_material_files";
const FILE_API = "/api/fta-general-materials/file";

export async function openFtaGeneralMaterialsDb(
  readOnly = true,
): Promise<SmartLawDb> {
  return openSmartLawDb(readOnly);
}

export async function ftaGeneralMaterialsReady(
  db: SmartLawDb,
): Promise<boolean> {
  return smartLawTableExists(db, POST_TABLE);
}

export async function listFtaGeneralMaterials(
  db: SmartLawDb,
  params: { page: number; pageSize: number; keyword?: string },
): Promise<{ rows: FtaPortalPostListRow[]; total: number }> {
  if (!(await ftaGeneralMaterialsReady(db))) return { rows: [], total: 0 };

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const keyword = yestradeStr(params.keyword);
  const where: string[] = [];
  const bind: unknown[] = [];

  if (keyword) {
    where.push(
      `(p.title LIKE ? OR IFNULL(p.agreement_name,'') LIKE ? OR IFNULL(p.content_text,'') LIKE ? OR IFNULL(p.author,'') LIKE ?)`,
    );
    const like = `%${keyword}%`;
    bind.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const hasFiles = await smartLawTableExists(db, FILE_TABLE);

  const total = yestradeNum(
    (await db.get(
      `SELECT COUNT(*) AS n FROM ${POST_TABLE} p ${whereSql}`,
      bind,
    ))?.n,
  );

  const fileJoin = hasFiles
    ? `LEFT JOIN (
         SELECT material_id, COUNT(*) AS n_files
           FROM ${FILE_TABLE}
          GROUP BY material_id
       ) f ON f.material_id = p.id`
    : "";
  const nFilesExpr = hasFiles ? "IFNULL(f.n_files, 0)" : "0";

  const rows = (
    await db.all(
      `SELECT p.id,
              IFNULL(p.list_number,'') AS list_number,
              IFNULL(p.agreement_name,'') AS category,
              p.title,
              IFNULL(p.author,'') AS author,
              IFNULL(p.registered_date,'') AS registered_date,
              IFNULL(p.view_count, 0) AS view_count,
              ${nFilesExpr} AS n_files
         FROM ${POST_TABLE} p
         ${fileJoin}
        ${whereSql}
        ORDER BY IFNULL(p.source_post_id, 0) DESC, p.id DESC
        LIMIT ? OFFSET ?`,
      [...bind, pageSize, (page - 1) * pageSize],
    )
  ).map(
    (r): FtaPortalPostListRow => ({
      id: yestradeNum(r.id),
      listNumber: yestradeStr(r.list_number),
      category: yestradeStr(r.category),
      title: yestradeStr(r.title),
      author: yestradeStr(r.author),
      registeredDate: yestradeStr(r.registered_date),
      viewCount: yestradeNum(r.view_count),
      nFiles: yestradeNum(r.n_files),
    }),
  );

  return { rows, total };
}

export async function getFtaGeneralMaterialDetail(
  db: SmartLawDb,
  id: number,
): Promise<FtaPortalPostDetail | null> {
  if (!(await ftaGeneralMaterialsReady(db)) || !id) return null;

  const r = await db.get(
    `SELECT id,
            IFNULL(list_number,'') AS list_number,
            IFNULL(agreement_name,'') AS category,
            title,
            IFNULL(author,'') AS author,
            IFNULL(registered_date,'') AS registered_date,
            IFNULL(view_count, 0) AS view_count,
            IFNULL(content_html,'') AS content_html,
            IFNULL(content_text,'') AS content_text,
            IFNULL(source_url,'') AS source_url,
            IFNULL(crawled_at_utc,'') AS crawled_at
       FROM ${POST_TABLE}
      WHERE id = ?`,
    [id],
  );
  if (!r) return null;

  const files: FtaPortalFileRow[] = (await smartLawTableExists(db, FILE_TABLE))
    ? (
        await db.all(
          `SELECT id,
                  original_filename,
                  IFNULL(downloaded_size_bytes, IFNULL(expected_size_bytes, 0)) AS size_bytes
             FROM ${FILE_TABLE}
            WHERE material_id = ?
            ORDER BY id`,
          [id],
        )
      ).map((f) => {
        const fid = yestradeNum(f.id);
        return {
          id: fid,
          fileName: yestradeStr(f.original_filename),
          sizeBytes: yestradeNum(f.size_bytes),
          downloadUrl: `${FILE_API}?id=${fid}`,
        };
      })
    : [];

  return {
    id: yestradeNum(r.id),
    listNumber: yestradeStr(r.list_number),
    category: yestradeStr(r.category),
    title: yestradeStr(r.title),
    author: yestradeStr(r.author),
    registeredDate: yestradeStr(r.registered_date),
    viewCount: yestradeNum(r.view_count),
    nFiles: files.length,
    contentHtml: yestradeStr(r.content_html),
    contentText: yestradeStr(r.content_text),
    sourceUrl: yestradeStr(r.source_url),
    crawledAt: yestradeStr(r.crawled_at),
    files,
  };
}

export async function getFtaGeneralMaterialFileRow(
  db: SmartLawDb,
  id: number,
): Promise<{ local_path: string; file_name: string } | null> {
  if (!(await smartLawTableExists(db, FILE_TABLE)) || !id) return null;
  const row = await db.get(
    `SELECT local_path, original_filename AS file_name
       FROM ${FILE_TABLE}
      WHERE id = ?`,
    [id],
  );
  if (!row?.local_path) return null;
  return {
    local_path: yestradeStr(row.local_path),
    file_name: yestradeStr(row.file_name),
  };
}
