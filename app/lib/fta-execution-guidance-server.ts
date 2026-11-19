import "server-only";

import type {
  FtaPortalFileRow,
  FtaPortalPostDetail,
  FtaPortalPostListRow,
} from "@/app/lib/fta-portal-board-shared";
import {
  openYestradeDb,
  yestradeHasTable,
  yestradeNum,
  yestradeStr,
} from "@/app/lib/yestrade-sqlite";
import type { DatabaseSync } from "node:sqlite";

const POST_TABLE = "fta_execution_guidance_post";
const FILE_TABLE = "fta_execution_guidance_attachment";
const FILE_API = "/api/fta-execution-guidance/file";

export function openFtaExecutionGuidanceDb(readOnly = true) {
  return openYestradeDb(readOnly);
}

export function ftaExecutionGuidanceReady(db: DatabaseSync): boolean {
  return yestradeHasTable(db, POST_TABLE);
}

export function countFtaExecutionGuidance(db: DatabaseSync): number {
  if (!ftaExecutionGuidanceReady(db)) return 0;
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM ${POST_TABLE}`)
    .get() as { n: number };
  return yestradeNum(row?.n);
}

export function listFtaExecutionGuidance(
  db: DatabaseSync,
  params: { page: number; pageSize: number; keyword?: string },
): { rows: FtaPortalPostListRow[]; total: number } {
  if (!ftaExecutionGuidanceReady(db)) return { rows: [], total: 0 };

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const keyword = yestradeStr(params.keyword);
  const where: string[] = [];
  const bind: unknown[] = [];

  if (keyword) {
    where.push(
      `(p.title LIKE ? OR IFNULL(p.category,'') LIKE ? OR IFNULL(p.content_text,'') LIKE ? OR IFNULL(p.author,'') LIKE ?)`,
    );
    const like = `%${keyword}%`;
    bind.push(like, like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const hasFiles = yestradeHasTable(db, FILE_TABLE);

  const total = yestradeNum(
    (
      db
        .prepare(`SELECT COUNT(*) AS n FROM ${POST_TABLE} p ${whereSql}`)
        .get(...bind) as { n: number }
    )?.n,
  );

  const fileJoin = hasFiles
    ? `LEFT JOIN (
         SELECT post_id, COUNT(*) AS n_files
           FROM ${FILE_TABLE}
          GROUP BY post_id
       ) f ON f.post_id = p.post_id`
    : "";
  const nFilesExpr = hasFiles ? "IFNULL(f.n_files, 0)" : "0";

  const rows = (
    db
      .prepare(
        `SELECT p.post_id AS id,
                IFNULL(CAST(p.list_number AS TEXT),'') AS list_number,
                IFNULL(p.category,'') AS category,
                p.title,
                IFNULL(p.author,'') AS author,
                IFNULL(p.registered_date,'') AS registered_date,
                IFNULL(p.view_count, 0) AS view_count,
                ${nFilesExpr} AS n_files
           FROM ${POST_TABLE} p
           ${fileJoin}
          ${whereSql}
          ORDER BY IFNULL(p.ntt_sn, 0) DESC, p.post_id DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...bind, pageSize, (page - 1) * pageSize) as Record<string, unknown>[]
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

export function getFtaExecutionGuidanceDetail(
  db: DatabaseSync,
  id: number,
): FtaPortalPostDetail | null {
  if (!ftaExecutionGuidanceReady(db) || !id) return null;

  const r = db
    .prepare(
      `SELECT post_id AS id,
              IFNULL(CAST(list_number AS TEXT),'') AS list_number,
              IFNULL(category,'') AS category,
              title,
              IFNULL(author,'') AS author,
              IFNULL(registered_date,'') AS registered_date,
              IFNULL(view_count, 0) AS view_count,
              IFNULL(content_html,'') AS content_html,
              IFNULL(content_text,'') AS content_text,
              IFNULL(source_url,'') AS source_url,
              IFNULL(last_collected_at,'') AS crawled_at
         FROM ${POST_TABLE}
        WHERE post_id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;

  const files: FtaPortalFileRow[] = yestradeHasTable(db, FILE_TABLE)
    ? (
        db
          .prepare(
            `SELECT attachment_id AS id,
                    original_name AS file_name,
                    IFNULL(source_size, 0) AS size_bytes,
                    IFNULL(download_status,'') AS download_status,
                    IFNULL(stored_path,'') AS stored_path
               FROM ${FILE_TABLE}
              WHERE post_id = ?
              ORDER BY attachment_id`,
          )
          .all(id) as Record<string, unknown>[]
      )
        .filter((f) => yestradeStr(f.stored_path))
        .map((f) => {
          const fid = yestradeNum(f.id);
          return {
            id: fid,
            fileName: yestradeStr(f.file_name),
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

export function getFtaExecutionGuidanceFileRow(
  db: DatabaseSync,
  id: number,
): { local_path: string; file_name: string } | null {
  if (!yestradeHasTable(db, FILE_TABLE) || !id) return null;
  const row = db
    .prepare(
      `SELECT stored_path AS local_path, original_name AS file_name
         FROM ${FILE_TABLE}
        WHERE attachment_id = ?`,
    )
    .get(id) as { local_path?: string; file_name?: string } | undefined;
  if (!row?.local_path) return null;
  return {
    local_path: yestradeStr(row.local_path),
    file_name: yestradeStr(row.file_name),
  };
}
