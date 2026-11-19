import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  QIA_NOTICE_SORT_KEYS,
  type QiaNoticeAttachRow,
  type QiaNoticeDetail,
  type QiaNoticeListRow,
  type QiaNoticeQueryParams,
  type QiaNoticeSortKey,
} from "@/app/lib/qia-notice-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import {
  guessYestradeContentType,
  resolveYestradeLocalFile,
} from "@/app/lib/yestrade-sqlite";

const POST_TABLE = "qia_notice_posts";
const BOARD_TYPE = "7_depart";
const FILE_API = "/api/qia-notice/file";

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

export function openQiaNoticeDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly: true });
}

export function qiaNoticeReady(db: DatabaseSync): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
    )
    .get(POST_TABLE) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

function parseSort(raw?: string): QiaNoticeSortKey {
  const s = str(raw);
  return (QIA_NOTICE_SORT_KEYS as readonly string[]).includes(s)
    ? (s as QiaNoticeSortKey)
    : "posted_date";
}

function parseDir(raw?: string): "ASC" | "DESC" {
  return str(raw).toUpperCase() === "ASC" ? "ASC" : "DESC";
}

function buildWhere(params: QiaNoticeQueryParams): {
  whereSql: string;
  bind: unknown[];
} {
  const clauses: string[] = ["board_type = ?"];
  const bind: unknown[] = [BOARD_TYPE];

  const title = str(params.title);
  if (title) {
    clauses.push("IFNULL(title,'') LIKE ? ESCAPE '\\'");
    bind.push(`%${escapeLike(title)}%`);
  }

  const kw = str(params.keyword);
  if (kw) {
    clauses.push(
      `(IFNULL(title,'') LIKE ? ESCAPE '\\'
        OR IFNULL(dept,'') LIKE ? ESCAPE '\\'
        OR IFNULL(writer,'') LIKE ? ESCAPE '\\')`,
    );
    const p = `%${escapeLike(kw)}%`;
    bind.push(p, p, p);
  }

  const dept = str(params.dept);
  if (dept) {
    clauses.push("IFNULL(dept,'') LIKE ? ESCAPE '\\'");
    bind.push(`%${escapeLike(dept)}%`);
  }

  const from = str(params.dateFrom);
  if (from) {
    clauses.push("IFNULL(posted_date,'') >= ?");
    bind.push(from);
  }
  const to = str(params.dateTo);
  if (to) {
    clauses.push("IFNULL(posted_date,'') <= ?");
    bind.push(to);
  }

  return { whereSql: `WHERE ${clauses.join(" AND ")}`, bind };
}

function mapListRow(r: Record<string, unknown>): QiaNoticeListRow {
  return {
    postId: str(r.post_id),
    boardNo: str(r.board_no) || null,
    title: str(r.title),
    dept: str(r.dept) || null,
    writer: str(r.writer) || null,
    postedDate: str(r.posted_date) || null,
    views: str(r.views) || null,
    sourceUrl: str(r.url) || null,
    attachmentCount: num(r.attachment_count),
  };
}

type RawAttach = {
  file_id?: string;
  name?: string;
  url?: string;
  local_path?: string;
  size?: number;
  status?: string;
};

function parseAttachmentsJson(
  raw: string,
  postId: string,
): QiaNoticeAttachRow[] {
  if (!raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.map((item, idx) => {
    const a = (item ?? {}) as RawAttach;
    const fileId = str(a.file_id) || String(idx + 1);
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
      fileId,
      name: str(a.name) || `첨부_${fileId}`,
      downloadUrl: str(a.url) || null,
      localPath: local || null,
      sizeBytes: num(a.size),
      status: str(a.status) || "",
      fileApiUrl: fileExists
        ? `${FILE_API}?postId=${encodeURIComponent(postId)}&fileId=${encodeURIComponent(fileId)}`
        : null,
    };
  });
}

function readLocalText(storedPath: string): string {
  const p = str(storedPath);
  if (!p) return "";
  try {
    const abs = resolveYestradeLocalFile(p);
    if (!fs.existsSync(abs)) return "";
    return fs.readFileSync(abs, "utf8");
  } catch {
    return "";
  }
}

export function queryQiaNotices(
  db: DatabaseSync,
  params: QiaNoticeQueryParams,
): { rows: QiaNoticeListRow[]; total: number } {
  if (!qiaNoticeReady(db)) return { rows: [], total: 0 };

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const { whereSql, bind } = buildWhere(params);
  const sort = parseSort(params.sort);
  const dir = parseDir(params.sort_dir);

  const total = num(
    (
      db
        .prepare(`SELECT COUNT(*) AS n FROM ${POST_TABLE} ${whereSql}`)
        .get(...bind) as { n: number }
    )?.n,
  );

  const orderCol =
    sort === "title"
      ? "title"
      : sort === "board_no"
        ? "CAST(board_no AS INTEGER)"
        : sort === "dept"
          ? "dept"
          : "posted_date";

  const rows = (
    db
      .prepare(
        `SELECT post_id, board_no, title, dept, writer, posted_date,
                views, url, attachment_count
           FROM ${POST_TABLE}
           ${whereSql}
           ORDER BY ${orderCol} ${dir}, CAST(post_id AS INTEGER) DESC
           LIMIT ? OFFSET ?`,
      )
      .all(...bind, pageSize, (page - 1) * pageSize) as Record<
      string,
      unknown
    >[]
  ).map(mapListRow);

  return { rows, total };
}

export function getQiaNoticeDetail(
  db: DatabaseSync,
  postId: string,
): QiaNoticeDetail | null {
  if (!qiaNoticeReady(db) || !postId) return null;

  const r = db
    .prepare(
      `SELECT post_id, board_no, title, dept, writer, posted_date,
              views, url, attachment_count, attachments,
              IFNULL(body_path,'') AS body_path,
              IFNULL(raw_path,'') AS raw_path
         FROM ${POST_TABLE}
        WHERE board_type = ? AND post_id = ?`,
    )
    .get(BOARD_TYPE, postId) as Record<string, unknown> | undefined;
  if (!r) return null;

  const contentHtml = readLocalText(str(r.raw_path));
  const contentText = readLocalText(str(r.body_path));

  return {
    ...mapListRow(r),
    contentText,
    contentHtml,
    attachments: parseAttachmentsJson(str(r.attachments), postId),
  };
}

export function getQiaNoticeFile(
  db: DatabaseSync,
  postId: string,
  fileId: string,
): {
  absolutePath: string;
  fileName: string;
  contentType: string;
} | null {
  if (!qiaNoticeReady(db) || !postId || !fileId) return null;

  const r = db
    .prepare(
      `SELECT IFNULL(attachments,'') AS attachments
         FROM ${POST_TABLE}
        WHERE board_type = ? AND post_id = ?`,
    )
    .get(BOARD_TYPE, postId) as { attachments?: string } | undefined;
  if (!r) return null;

  const attachments = parseAttachmentsJson(str(r.attachments), postId);
  const hit = attachments.find((a) => a.fileId === fileId);
  if (!hit?.localPath) return null;

  try {
    const absolutePath = resolveYestradeLocalFile(hit.localPath);
    if (!fs.existsSync(absolutePath)) return null;
    return {
      absolutePath,
      fileName: hit.name,
      contentType: guessYestradeContentType(hit.name),
    };
  } catch {
    return null;
  }
}
