import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type {
  ClipAdminNoticeDetail,
  ClipAdminNoticeFile,
  ClipAdminNoticeListRow,
} from "@/app/lib/clip-admin-notice-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

const NOTICE_TABLE = "clip_admin_notices";
const ATTACH_TABLE = "clip_admin_attachments";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
    )
    .get(name) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

export function openClipAdminNoticeDb(readOnly = true): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly });
}

export function clipAdminNoticeTablesReady(db: DatabaseSync): boolean {
  return hasTable(db, NOTICE_TABLE);
}

export type ClipAdminNoticeListQuery = {
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export function listClipAdminNotices(
  db: DatabaseSync,
  q: ClipAdminNoticeListQuery,
): { ready: boolean; rows: ClipAdminNoticeListRow[]; total: number } {
  if (!clipAdminNoticeTablesReady(db)) {
    return { ready: false, rows: [], total: 0 };
  }
  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 10));
  const page = Math.max(1, Number(q.page) || 1);
  const kw = str(q.keyword);
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (kw) {
    where.push(
      `(n.title LIKE ? OR n.department_name LIKE ? OR IFNULL(n.content_text,'') LIKE ?)`,
    );
    const like = `%${kw}%`;
    params.push(like, like, like);
  }
  const whereSql = where.join(" AND ");
  const total = num(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM ${NOTICE_TABLE} n WHERE ${whereSql}`,
        )
        .get(...params) as { n: number }
    )?.n,
  );
  const offset = (page - 1) * pageSize;
  const hasAttach = hasTable(db, ATTACH_TABLE);
  const fileSql = hasAttach
    ? `(SELECT COUNT(*) FROM ${ATTACH_TABLE} a
        WHERE a.notice_id = n.notice_id AND IFNULL(a.is_current,1)=1)`
    : `0`;
  const rows = (
    db
      .prepare(
        `SELECT n.notice_id, n.title, n.department_name, n.written_date,
                ${fileSql} AS n_files
           FROM ${NOTICE_TABLE} n
          WHERE ${whereSql}
          ORDER BY IFNULL(n.written_date,'') DESC, n.notice_id DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as Record<string, unknown>[]
  ).map((r, i) => ({
    noticeId: str(r.notice_id),
    listNumber: String(total - offset - i),
    title: str(r.title),
    departmentName: str(r.department_name),
    writtenDate: str(r.written_date),
    nFiles: num(r.n_files),
  }));
  return { ready: true, rows, total };
}

export function getClipAdminNoticeDetail(
  db: DatabaseSync,
  noticeId: string,
): ClipAdminNoticeDetail | null {
  const id = str(noticeId);
  if (!id || !clipAdminNoticeTablesReady(db)) return null;
  const r = db
    .prepare(
      `SELECT notice_id, title, department_name, written_date,
              publication_year, publication_number, source_url,
              content_html, content_text, detail_status
         FROM ${NOTICE_TABLE}
        WHERE notice_id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;

  let files: ClipAdminNoticeFile[] = [];
  if (hasTable(db, ATTACH_TABLE)) {
    files = (
      db
        .prepare(
          `SELECT attachment_pk, original_name, file_size, download_status
             FROM ${ATTACH_TABLE}
            WHERE notice_id = ? AND IFNULL(is_current,1)=1
            ORDER BY attachment_pk`,
        )
        .all(id) as Record<string, unknown>[]
    ).map((f) => ({
      attachmentPk: num(f.attachment_pk),
      fileName: str(f.original_name),
      sizeBytes: num(f.file_size),
      downloadUrl: `/api/clip-admin-notice/file?id=${num(f.attachment_pk)}`,
    }));
  }

  return {
    noticeId: str(r.notice_id),
    listNumber: "",
    title: str(r.title),
    departmentName: str(r.department_name),
    writtenDate: str(r.written_date),
    nFiles: files.length,
    contentHtml: str(r.content_html),
    contentText: str(r.content_text),
    sourceUrl: str(r.source_url),
    publicationYear: str(r.publication_year),
    publicationNumber: str(r.publication_number),
    detailStatus: str(r.detail_status),
    files,
  };
}

export function getClipAdminNoticeFileRow(
  db: DatabaseSync,
  attachmentPk: number,
): { local_path: string; file_name: string } | null {
  if (!attachmentPk || !hasTable(db, ATTACH_TABLE)) return null;
  const r = db
    .prepare(
      `SELECT local_path, original_name
         FROM ${ATTACH_TABLE}
        WHERE attachment_pk = ?`,
    )
    .get(attachmentPk) as
    | { local_path?: string; original_name?: string }
    | undefined;
  if (!r) return null;
  return {
    local_path: str(r.local_path),
    file_name: str(r.original_name),
  };
}
