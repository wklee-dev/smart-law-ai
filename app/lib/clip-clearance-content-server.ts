import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { rewriteClipPortalHtml } from "@/app/lib/clip-imex-notice-server";
import {
  CLIP_CLEARANCE_CONTENT_TABLE,
  type ClipClearanceContentDetail,
  type ClipClearanceContentSlug,
} from "@/app/lib/clip-clearance-content-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

export {
  CLIP_CLEARANCE_CONTENT_SLUGS,
  type ClipClearanceContentDetail,
  type ClipClearanceContentSlug,
  isClipClearanceContentSlug,
} from "@/app/lib/clip-clearance-content-shared";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

export function openClipClearanceContentDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly: true });
}

export function getClipClearanceContent(
  db: DatabaseSync,
  slug: ClipClearanceContentSlug,
): ClipClearanceContentDetail | null {
  const table = CLIP_CLEARANCE_CONTENT_TABLE[slug];
  if (!hasTable(db, table)) {
    throw new Error(
      `${table} 테이블이 없습니다. customs_law_crawler.py 로 수집하세요.`,
    );
  }
  const row = db
    .prepare(
      `SELECT page_ttl, body_html, body_txt, src_url, retrieved_at
       FROM ${table}
       ORDER BY rec_id DESC
       LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    slug,
    page_title: str(row.page_ttl),
    body_html: rewriteClipPortalHtml(str(row.body_html)),
    body_text: str(row.body_txt),
    source_url: str(row.src_url),
    retrieved_at: str(row.retrieved_at),
  };
}
