import "server-only";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

const DEFAULT_ATTACH_ROOT = "C:/SQLiteDB/ATTACH";
const CLIP_NTX_BASE_URL = "https://unipass.customs.go.kr";

export type NtxPageTableRow = {
  table_seq: number;
  table_caption: string;
  headers_json: string;
  rows_json: string;
};

export type NtxPageContent = {
  section_code: string;
  section_name: string;
  source_url: string;
  content_html: string;
  content_text: string;
  fetched_at_utc: string;
  tables: NtxPageTableRow[];
};

type NtxPageImageRow = {
  image_id: number;
  source_url: string;
  local_path: string;
  content_type: string;
  download_status: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function openSmartLawDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly: true });
}

export function getClipNtxAttachRoot(): string {
  return (
    process.env.CLIP_NTX_ATTACH_DIR?.trim() ||
    process.env.SMART_LAW_ATTACH_DIR?.trim() ||
    DEFAULT_ATTACH_ROOT
  );
}

function hasNtxPageImageTable(db: DatabaseSync): boolean {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ntx_page_image'",
    )
    .get() as { name: string } | undefined;
  return Boolean(row?.name);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 크롤 HTML의 /clip/images/… → 로컬 첨부 또는 절대 URL */
function rewriteNtxContentHtml(
  html: string,
  images: NtxPageImageRow[],
): string {
  let out = html;
  for (const image of images) {
    if (image.download_status !== "DOWNLOADED" || !image.local_path.trim()) {
      continue;
    }
    const apiUrl = `/api/clip-ntx-image?imageId=${image.image_id}`;
    const sourceUrl = image.source_url.trim();
    if (sourceUrl) {
      out = out.split(sourceUrl).join(apiUrl);
      try {
        const pathname = new URL(sourceUrl).pathname;
        out = out.replace(
          new RegExp(`(src=(['"]))${escapeRegExp(pathname)}\\2`, "gi"),
          `$1${apiUrl}$2`,
        );
      } catch {
        /* ignore invalid URL */
      }
    }
  }
  // ntx_page_image 매핑이 없을 때 원본 포털 절대 URL로 폴백
  out = out.replace(
    /\ssrc=(['"])\/clip\/images\/([^'"]+)\1/gi,
    ` src=$1${CLIP_NTX_BASE_URL}/clip/images/$2$1`,
  );
  return out;
}

export function resolveClipNtxImagePath(
  imageId: string,
): { absolutePath: string; fileName: string; contentType: string } | null {
  const id = Number(imageId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const db = openSmartLawDb();
  try {
    if (!hasNtxPageImageTable(db)) return null;
    const row = db
      .prepare(
        `SELECT local_path, file_name, content_type, download_status
         FROM ntx_page_image WHERE image_id = ?`,
      )
      .get(id) as
      | {
          local_path: string | null;
          file_name: string | null;
          content_type: string | null;
          download_status: string | null;
        }
      | undefined;
    if (!row || row.download_status !== "DOWNLOADED" || !row.local_path?.trim()) {
      return null;
    }

    const attachRoot = path.resolve(getClipNtxAttachRoot());
    const abs = path.resolve(row.local_path.replaceAll("\\", path.sep));
    if (!abs.startsWith(attachRoot)) return null;
    if (!fs.existsSync(abs)) return null;

    return {
      absolutePath: abs,
      fileName: str(row.file_name) || path.basename(abs),
      contentType: str(row.content_type) || "application/octet-stream",
    };
  } finally {
    db.close();
  }
}

/** CLIP ntx_page 최신 스냅샷 본문 */
export function getLatestNtxPageContent(
  sectionCode: string,
): NtxPageContent | null {
  const db = openSmartLawDb();
  try {
    const page = db
      .prepare(
        `SELECT page_id, section_code, section_name, source_url
         FROM ntx_page WHERE section_code = ?`,
      )
      .get(sectionCode) as
      | {
          page_id: number;
          section_code: string;
          section_name: string;
          source_url: string;
        }
      | undefined;
    if (!page) return null;

    const snap = db
      .prepare(
        `SELECT page_snapshot_id, content_html, content_text, fetched_at_utc
         FROM ntx_page_snapshot
         WHERE page_id = ?
         ORDER BY fetched_at_utc DESC, page_snapshot_id DESC
         LIMIT 1`,
      )
      .get(page.page_id) as
      | {
          page_snapshot_id: number;
          content_html: string;
          content_text: string;
          fetched_at_utc: string;
        }
      | undefined;
    if (!snap) return null;

    let images: NtxPageImageRow[] = [];
    if (hasNtxPageImageTable(db)) {
      images = db
        .prepare(
          `SELECT image_id, source_url, local_path, content_type, download_status
           FROM ntx_page_image
           WHERE page_snapshot_id = ?
           ORDER BY image_seq ASC`,
        )
        .all(snap.page_snapshot_id) as NtxPageImageRow[];
    }

    const tables = db
      .prepare(
        `SELECT pt.table_seq, pt.table_caption, pt.headers_json, pt.rows_json
         FROM ntx_page_table pt
         JOIN ntx_page_snapshot ps ON ps.page_snapshot_id = pt.page_snapshot_id
         WHERE ps.page_id = ?
         ORDER BY ps.fetched_at_utc DESC, ps.page_snapshot_id DESC, pt.table_seq ASC`,
      )
      .all(page.page_id) as Record<string, unknown>[];

    const seen = new Set<number>();
    const uniqueTables: NtxPageTableRow[] = [];
    for (const t of tables) {
      const seq = num(t.table_seq);
      if (seen.has(seq)) continue;
      seen.add(seq);
      uniqueTables.push({
        table_seq: seq,
        table_caption: str(t.table_caption),
        headers_json: str(t.headers_json),
        rows_json: str(t.rows_json),
      });
    }

    return {
      section_code: page.section_code,
      section_name: page.section_name,
      source_url: page.source_url,
      content_html: rewriteNtxContentHtml(str(snap.content_html), images),
      content_text: str(snap.content_text),
      fetched_at_utc: str(snap.fetched_at_utc),
      tables: uniqueTables,
    };
  } finally {
    db.close();
  }
}
