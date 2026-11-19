import "server-only";

import type { DatabaseSync } from "node:sqlite";
import type {
  YcpAttachmentRow,
  YcpImageRow,
  YcpIntroDetail,
  YcpPostDetail,
  YcpPostFileRow,
  YcpPostListRow,
} from "@/app/lib/yestrade-cp-shared";
import {
  openYestradeDb,
  yestradeHasTable,
  yestradeNum,
  yestradeStr,
} from "@/app/lib/yestrade-sqlite";

export function openYcpDb(readOnly = true) {
  return openYestradeDb(readOnly);
}

export function ycpTablesReady(db: DatabaseSync): boolean {
  return yestradeHasTable(db, "ycp_page");
}

export function getYcpIntro(db: DatabaseSync): YcpIntroDetail | null {
  if (!ycpTablesReady(db)) return null;
  const row = db
    .prepare(
      `SELECT page_id, page_name, page_title, source_url, breadcrumb,
              page_text, content_xhtml, n_attachments, n_images, crawled_at
         FROM ycp_page
        ORDER BY seq
        LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;
  if (!row) return null;

  const pageId = yestradeNum(row.page_id);

  const attachments: YcpAttachmentRow[] = yestradeHasTable(db, "ycp_attachment")
    ? (
        db
          .prepare(
            `SELECT attach_id, seq, label, button_text, file_name, file_size, downloaded
               FROM ycp_attachment WHERE page_id = ? ORDER BY seq`,
          )
          .all(pageId) as Record<string, unknown>[]
      ).map((a) => ({
        attach_id: yestradeNum(a.attach_id),
        seq: yestradeNum(a.seq),
        label: yestradeStr(a.label),
        button_text: yestradeStr(a.button_text),
        file_name: yestradeStr(a.file_name),
        file_size: yestradeNum(a.file_size),
        downloaded: yestradeNum(a.downloaded),
        downloadUrl: `/api/yestrade-cp/file?kind=attachment&id=${yestradeNum(a.attach_id)}`,
      }))
    : [];

  const images: YcpImageRow[] = yestradeHasTable(db, "ycp_image")
    ? (
        db
          .prepare(
            `SELECT image_id, seq, alt, file_name, url, downloaded
               FROM ycp_image
              WHERE page_id = ? OR (owner_type = 'page' AND page_id = ?)
              ORDER BY seq`,
          )
          .all(pageId, pageId) as Record<string, unknown>[]
      ).map((im) => ({
        image_id: yestradeNum(im.image_id),
        seq: yestradeNum(im.seq),
        alt: yestradeStr(im.alt),
        file_name: yestradeStr(im.file_name),
        url: yestradeStr(im.url),
        downloaded: yestradeNum(im.downloaded),
        srcUrl: `/api/yestrade-cp/file?kind=image&id=${yestradeNum(im.image_id)}`,
      }))
    : [];

  return {
    page_id: pageId,
    page_name: yestradeStr(row.page_name),
    page_title: yestradeStr(row.page_title),
    source_url: yestradeStr(row.source_url),
    breadcrumb: yestradeStr(row.breadcrumb),
    n_attachments: yestradeNum(row.n_attachments),
    n_images: yestradeNum(row.n_images),
    crawled_at: yestradeStr(row.crawled_at),
    page_text: yestradeStr(row.page_text),
    content_xhtml: yestradeStr(row.content_xhtml),
    attachments,
    images,
  };
}

export function listYcpPosts(
  db: DatabaseSync,
  params: { page: number; pageSize: number; keyword: string },
): { rows: YcpPostListRow[]; total: number } {
  if (!yestradeHasTable(db, "ycp_board_post")) {
    return { rows: [], total: 0 };
  }
  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const keyword = params.keyword.trim();
  const where: string[] = [];
  const bind: unknown[] = [];
  if (keyword) {
    where.push(`(title LIKE ? OR content_text LIKE ? OR attach_summary LIKE ?)`);
    const like = `%${keyword}%`;
    bind.push(like, like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS n FROM ycp_board_post ${whereSql}`)
    .get(...bind) as { n: number };
  const total = yestradeNum(totalRow?.n);
  const offset = (page - 1) * pageSize;
  const rows = db
    .prepare(
      `SELECT post_id, seq, list_no, title, posted_date, views, n_files,
              attach_summary, crawled_at
         FROM ycp_board_post
         ${whereSql}
        ORDER BY seq
        LIMIT ? OFFSET ?`,
    )
    .all(...bind, pageSize, offset) as Record<string, unknown>[];

  return {
    total,
    rows: rows.map((r) => ({
      post_id: yestradeNum(r.post_id),
      seq: yestradeNum(r.seq),
      list_no: yestradeStr(r.list_no),
      title: yestradeStr(r.title),
      posted_date: yestradeStr(r.posted_date),
      views: yestradeStr(r.views),
      n_files: yestradeNum(r.n_files),
      attach_summary: yestradeStr(r.attach_summary),
      crawled_at: yestradeStr(r.crawled_at),
    })),
  };
}

export function getYcpPostDetail(
  db: DatabaseSync,
  postId: number,
): YcpPostDetail | null {
  if (!yestradeHasTable(db, "ycp_board_post") || !postId) return null;
  const row = db
    .prepare(
      `SELECT post_id, seq, list_no, title, posted_date, views, n_files,
              attach_summary, crawled_at, source_url, breadcrumb,
              content_text, content_xhtml
         FROM ycp_board_post WHERE post_id = ?`,
    )
    .get(postId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const files: YcpPostFileRow[] = yestradeHasTable(db, "ycp_post_file")
    ? (
        db
          .prepare(
            `SELECT file_pk, seq, file_label, file_name, file_size, dup_count, downloaded
               FROM ycp_post_file WHERE post_id = ? ORDER BY seq`,
          )
          .all(postId) as Record<string, unknown>[]
      ).map((f) => ({
        file_pk: yestradeNum(f.file_pk),
        seq: yestradeNum(f.seq),
        file_label: yestradeStr(f.file_label),
        file_name: yestradeStr(f.file_name),
        file_size: yestradeNum(f.file_size),
        dup_count: yestradeNum(f.dup_count),
        downloaded: yestradeNum(f.downloaded),
        downloadUrl: `/api/yestrade-cp/file?kind=postFile&id=${yestradeNum(f.file_pk)}`,
      }))
    : [];

  return {
    post_id: yestradeNum(row.post_id),
    seq: yestradeNum(row.seq),
    list_no: yestradeStr(row.list_no),
    title: yestradeStr(row.title),
    posted_date: yestradeStr(row.posted_date),
    views: yestradeStr(row.views),
    n_files: yestradeNum(row.n_files),
    attach_summary: yestradeStr(row.attach_summary),
    crawled_at: yestradeStr(row.crawled_at),
    source_url: yestradeStr(row.source_url),
    breadcrumb: yestradeStr(row.breadcrumb),
    content_text: yestradeStr(row.content_text),
    content_xhtml: yestradeStr(row.content_xhtml),
    files,
  };
}

export function getYcpFileRow(
  db: DatabaseSync,
  kind: "attachment" | "image" | "postFile",
  id: number,
): { local_path: string; file_name: string; content_type: string } | null {
  if (!id) return null;
  if (kind === "attachment") {
    if (!yestradeHasTable(db, "ycp_attachment")) return null;
    const row = db
      .prepare(
        `SELECT local_path, file_name, content_type FROM ycp_attachment WHERE attach_id = ?`,
      )
      .get(id) as
      | { local_path: string; file_name: string; content_type: string }
      | undefined;
    return row
      ? {
          local_path: yestradeStr(row.local_path),
          file_name: yestradeStr(row.file_name),
          content_type: yestradeStr(row.content_type),
        }
      : null;
  }
  if (kind === "image") {
    if (!yestradeHasTable(db, "ycp_image")) return null;
    const row = db
      .prepare(
        `SELECT local_path, file_name, content_type FROM ycp_image WHERE image_id = ?`,
      )
      .get(id) as
      | { local_path: string; file_name: string; content_type: string }
      | undefined;
    return row
      ? {
          local_path: yestradeStr(row.local_path),
          file_name: yestradeStr(row.file_name),
          content_type: yestradeStr(row.content_type),
        }
      : null;
  }
  if (!yestradeHasTable(db, "ycp_post_file")) return null;
  const row = db
    .prepare(
      `SELECT local_path, file_name, content_type FROM ycp_post_file WHERE file_pk = ?`,
    )
    .get(id) as
    | { local_path: string; file_name: string; content_type: string }
    | undefined;
  return row
    ? {
        local_path: yestradeStr(row.local_path),
        file_name: yestradeStr(row.file_name),
        content_type: yestradeStr(row.content_type),
      }
    : null;
}
