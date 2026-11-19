import "server-only";

import fs from "node:fs";
import {
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import {
  TT_PRESS_SORT_KEYS,
  type TtPressAttachRow,
  type TtPressDetail,
  type TtPressListRow,
  type TtPressQueryParams,
  type TtPressSortKey,
} from "@/app/lib/tt-press-shared";
import {
  guessYestradeContentType,
  resolveYestradeLocalFile,
} from "@/app/lib/yestrade-sqlite";

const POST_TABLE = "tt_press_posts";
const ATTACH_TABLE = "tt_press_attachments";
const FILE_API = "/api/tt-press/file";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function openTtPressDb(): Promise<SmartLawDb> {
  return openSmartLawDb(true);
}

export async function ttPressReady(db: SmartLawDb): Promise<boolean> {
  return smartLawTableExists(db, POST_TABLE);
}

function parseSort(raw?: string): TtPressSortKey {
  const s = str(raw);
  return (TT_PRESS_SORT_KEYS as readonly string[]).includes(s)
    ? (s as TtPressSortKey)
    : "published_date";
}

function parseDir(raw?: string): "ASC" | "DESC" {
  return str(raw).toUpperCase() === "ASC" ? "ASC" : "DESC";
}

function buildWhere(params: TtPressQueryParams): {
  whereSql: string;
  bind: unknown[];
} {
  const clauses: string[] = ["1=1"];
  const bind: unknown[] = [];

  const title = str(params.title);
  if (title) {
    clauses.push("IFNULL(title,'') LIKE ? ESCAPE '\\'");
    bind.push(`%${escapeLike(title)}%`);
  }

  const kw = str(params.keyword);
  if (kw) {
    clauses.push(
      `(IFNULL(title,'') LIKE ? ESCAPE '\\'
        OR IFNULL(content_text,'') LIKE ? ESCAPE '\\')`,
    );
    const p = `%${escapeLike(kw)}%`;
    bind.push(p, p);
  }

  const from = str(params.dateFrom);
  if (from) {
    clauses.push("IFNULL(published_date,'') >= ?");
    bind.push(from);
  }
  const to = str(params.dateTo);
  if (to) {
    clauses.push("IFNULL(published_date,'') <= ?");
    bind.push(to);
  }

  return { whereSql: `WHERE ${clauses.join(" AND ")}`, bind };
}

function mapListRow(r: Record<string, unknown>): TtPressListRow {
  return {
    postKey: str(r.post_key),
    sourceId: str(r.source_id),
    listNumber: r.list_number == null ? null : num(r.list_number),
    title: str(r.title),
    publishedDate: str(r.published_date) || null,
    sourceUrl: str(r.source_url) || null,
    attachmentCount: num(r.attachment_count),
    status: str(r.status),
  };
}

export async function queryTtPress(
  db: SmartLawDb,
  params: TtPressQueryParams,
): Promise<{ rows: TtPressListRow[]; total: number }> {
  if (!(await ttPressReady(db))) return { rows: [], total: 0 };

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const { whereSql, bind } = buildWhere(params);
  const sort = parseSort(params.sort);
  const dir = parseDir(params.sort_dir);

  const total = num(
    (await db.get(`SELECT COUNT(*) AS n FROM ${POST_TABLE} ${whereSql}`, bind))
      ?.n,
  );

  const orderCol =
    sort === "title"
      ? "title"
      : sort === "list_number"
        ? "list_number"
        : "published_date";

  const raw = await db.all(
    `SELECT post_key, source_id, list_number, title, published_date,
            source_url, attachment_count, status
       FROM ${POST_TABLE}
       ${whereSql}
       ORDER BY ${orderCol} ${dir}, post_key DESC
       LIMIT ? OFFSET ?`,
    [...bind, pageSize, (page - 1) * pageSize],
  );

  return { rows: raw.map(mapListRow), total };
}

export async function getTtPressDetail(
  db: SmartLawDb,
  postKey: string,
): Promise<TtPressDetail | null> {
  if (!(await ttPressReady(db)) || !postKey) return null;

  const r = await db.get(
    `SELECT post_key, source_id, list_number, title, published_date,
            source_url, attachment_count, status,
            IFNULL(content_text,'') AS content_text,
            IFNULL(content_html,'') AS content_html
       FROM ${POST_TABLE}
      WHERE post_key = ?`,
    [postKey],
  );
  if (!r) return null;

  const attachRows = await db.all(
    `SELECT attachment_key, ordinal, original_filename, download_url,
            local_path, IFNULL(size_bytes,0) AS size_bytes, status
       FROM ${ATTACH_TABLE}
      WHERE post_key = ? AND active = 1
      ORDER BY ordinal ASC`,
    [postKey],
  );
  const attachments: TtPressAttachRow[] = attachRows.map((a) => {
    const key = str(a.attachment_key);
    const local = str(a.local_path);
    let fileExists = false;
    if (local) {
      try {
        fileExists = fs.existsSync(resolveYestradeLocalFile(local));
      } catch {
        fileExists = false;
      }
    }
    return {
      attachmentKey: key,
      ordinal: num(a.ordinal),
      originalFilename: str(a.original_filename),
      downloadUrl: str(a.download_url) || null,
      localPath: local || null,
      sizeBytes: num(a.size_bytes),
      status: str(a.status),
      fileApiUrl: fileExists
        ? `${FILE_API}?key=${encodeURIComponent(key)}`
        : null,
    };
  });

  return {
    ...mapListRow(r),
    contentText: str(r.content_text),
    contentHtml: str(r.content_html),
    attachments,
  };
}

export async function getTtPressFile(
  db: SmartLawDb,
  attachmentKey: string,
): Promise<{
  absolutePath: string;
  fileName: string;
  contentType: string;
} | null> {
  if (!(await ttPressReady(db)) || !attachmentKey) return null;
  const r = await db.get(
    `SELECT original_filename, local_path
       FROM ${ATTACH_TABLE}
      WHERE attachment_key = ? AND active = 1`,
    [attachmentKey],
  );
  if (!r?.local_path) return null;
  const absolutePath = resolveYestradeLocalFile(str(r.local_path));
  if (!fs.existsSync(absolutePath)) return null;
  const fileName = str(r.original_filename) || absolutePath.split(/[/\\]/).pop()!;
  return {
    absolutePath,
    fileName,
    contentType: guessYestradeContentType(fileName),
  };
}
