import "server-only";

import type { DatabaseSync } from "node:sqlite";
import type {
  YtgAttachmentRow,
  YtgImageRow,
  YtgLinkRow,
  YtgPageDetail,
  YtgPageListRow,
} from "@/app/lib/yestrade-guideline-shared";
import {
  openYestradeDb,
  yestradeHasTable,
  yestradeNum,
  yestradeStr,
} from "@/app/lib/yestrade-sqlite";

const PAGE = "ytg_page";

export function openYtgDb(readOnly = true) {
  return openYestradeDb(readOnly);
}

export function ytgTablesReady(db: DatabaseSync): boolean {
  return yestradeHasTable(db, PAGE);
}

function mapPageList(row: Record<string, unknown>): YtgPageListRow {
  return {
    page_id: yestradeNum(row.page_id),
    seq: yestradeNum(row.seq),
    menu_lv1: yestradeStr(row.menu_lv1),
    menu_lv2: yestradeStr(row.menu_lv2),
    page_name: yestradeStr(row.page_name),
    page_title: yestradeStr(row.page_title),
    source_url: yestradeStr(row.source_url),
    breadcrumb: yestradeStr(row.breadcrumb),
    n_sections: yestradeNum(row.n_sections),
    n_items: yestradeNum(row.n_items),
    n_tables: yestradeNum(row.n_tables),
    n_images: yestradeNum(row.n_images),
    n_attachments: yestradeNum(row.n_attachments),
    n_links: yestradeNum(row.n_links),
    crawled_at: yestradeStr(row.crawled_at),
  };
}

export function listYtgPages(db: DatabaseSync): YtgPageListRow[] {
  if (!ytgTablesReady(db)) return [];
  const rows = db
    .prepare(
      `SELECT page_id, seq, menu_lv1, menu_lv2, page_name, page_title,
              source_url, breadcrumb, n_sections, n_items, n_tables,
              n_images, n_attachments, n_links, crawled_at
         FROM ${PAGE}
        ORDER BY seq`,
    )
    .all() as Record<string, unknown>[];
  return rows.map(mapPageList);
}

export function getYtgPageDetail(
  db: DatabaseSync,
  pageId: number,
): YtgPageDetail | null {
  if (!ytgTablesReady(db) || !pageId) return null;
  const row = db
    .prepare(
      `SELECT page_id, seq, menu_lv1, menu_lv2, page_name, page_title,
              source_url, breadcrumb, page_text, content_xhtml,
              n_sections, n_items, n_tables, n_images, n_attachments,
              n_links, crawled_at
         FROM ${PAGE}
        WHERE page_id = ?`,
    )
    .get(pageId) as Record<string, unknown> | undefined;
  if (!row) return null;

  const attachments: YtgAttachmentRow[] = yestradeHasTable(db, "ytg_attachment")
    ? (
        db
          .prepare(
            `SELECT attach_id, seq, label, button_text, file_name, file_size, downloaded
               FROM ytg_attachment WHERE page_id = ? ORDER BY seq`,
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
        downloadUrl: `/api/yestrade-guideline/file?kind=attachment&id=${yestradeNum(a.attach_id)}`,
      }))
    : [];

  const images: YtgImageRow[] = yestradeHasTable(db, "ytg_image")
    ? (
        db
          .prepare(
            `SELECT image_id, seq, alt, file_name, url, downloaded
               FROM ytg_image WHERE page_id = ? ORDER BY seq`,
          )
          .all(pageId) as Record<string, unknown>[]
      ).map((im) => ({
        image_id: yestradeNum(im.image_id),
        seq: yestradeNum(im.seq),
        alt: yestradeStr(im.alt),
        file_name: yestradeStr(im.file_name),
        url: yestradeStr(im.url),
        downloaded: yestradeNum(im.downloaded),
        srcUrl: `/api/yestrade-guideline/file?kind=image&id=${yestradeNum(im.image_id)}`,
      }))
    : [];

  const links: YtgLinkRow[] = yestradeHasTable(db, "ytg_link")
    ? (
        db
          .prepare(
            `SELECT link_id, seq, label, url, domain, context
               FROM ytg_link WHERE page_id = ? ORDER BY seq`,
          )
          .all(pageId) as Record<string, unknown>[]
      ).map((l) => ({
        link_id: yestradeNum(l.link_id),
        seq: yestradeNum(l.seq),
        label: yestradeStr(l.label),
        url: yestradeStr(l.url),
        domain: yestradeStr(l.domain),
        context: yestradeStr(l.context),
      }))
    : [];

  return {
    ...mapPageList(row),
    page_text: yestradeStr(row.page_text),
    content_xhtml: yestradeStr(row.content_xhtml),
    attachments,
    images,
    links,
  };
}

export function getYtgFileRow(
  db: DatabaseSync,
  kind: "attachment" | "image",
  id: number,
): { local_path: string; file_name: string; content_type: string } | null {
  if (!id) return null;
  if (kind === "attachment") {
    if (!yestradeHasTable(db, "ytg_attachment")) return null;
    const row = db
      .prepare(
        `SELECT local_path, file_name, content_type FROM ytg_attachment WHERE attach_id = ?`,
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
  if (!yestradeHasTable(db, "ytg_image")) return null;
  const row = db
    .prepare(
      `SELECT local_path, file_name, content_type FROM ytg_image WHERE image_id = ?`,
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
