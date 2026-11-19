import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  KCS_ADMIN_NOTICE_SORT_KEYS,
  type KcsAdminNoticeAttachRow,
  type KcsAdminNoticeDetail,
  type KcsAdminNoticeListRow,
  type KcsAdminNoticeQueryParams,
  type KcsAdminNoticeSortKey,
} from "@/app/lib/kcs-admin-notice-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";
import {
  guessYestradeContentType,
  resolveYestradeLocalFile,
} from "@/app/lib/yestrade-sqlite";

const POST_TABLE = "customs_admin_notice";
const ATTACH_TABLE = "customs_admin_notice_attach";
const FILE_API = "/api/kcs-admin-notice/file";

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

export function openKcsAdminNoticeDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly: true });
}

export function kcsAdminNoticeReady(db: DatabaseSync): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
    )
    .get(POST_TABLE) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

function parseSort(raw?: string): KcsAdminNoticeSortKey {
  const s = str(raw);
  return (KCS_ADMIN_NOTICE_SORT_KEYS as readonly string[]).includes(s)
    ? (s as KcsAdminNoticeSortKey)
    : "seq_no";
}

function parseDir(raw?: string): "ASC" | "DESC" {
  return str(raw).toUpperCase() === "ASC" ? "ASC" : "DESC";
}

function buildWhere(params: KcsAdminNoticeQueryParams): {
  whereSql: string;
  bind: unknown[];
} {
  const clauses: string[] = ["1=1"];
  const bind: unknown[] = [];

  const title = str(params.title);
  if (title) {
    clauses.push(
      `(IFNULL(full_title,'') LIKE ? ESCAPE '\\'
        OR IFNULL(list_title,'') LIKE ? ESCAPE '\\')`,
    );
    const p = `%${escapeLike(title)}%`;
    bind.push(p, p);
  }

  const kw = str(params.keyword);
  if (kw) {
    const p = `%${escapeLike(kw)}%`;
    const field = str(params.searchField);
    const titleSql = `IFNULL(full_title,'') LIKE ? ESCAPE '\\'
        OR IFNULL(list_title,'') LIKE ? ESCAPE '\\'`;
    const contentSql = `IFNULL(content_text,'') LIKE ? ESCAPE '\\'`;
    if (field === "title") {
      clauses.push(`(${titleSql})`);
      bind.push(p, p);
    } else if (field === "content") {
      clauses.push(`(${contentSql})`);
      bind.push(p);
    } else if (field === "writer") {
      clauses.push("IFNULL(writer,'') LIKE ? ESCAPE '\\'");
      bind.push(p);
    } else {
      clauses.push(`(${titleSql} OR ${contentSql})`);
      bind.push(p, p, p);
    }
  }

  const writer = str(params.writer);
  if (writer) {
    clauses.push("IFNULL(writer,'') LIKE ? ESCAPE '\\'");
    bind.push(`%${escapeLike(writer)}%`);
  }

  const from = str(params.dateFrom);
  if (from) {
    clauses.push("IFNULL(reg_date,'') >= ?");
    bind.push(from);
  }
  const to = str(params.dateTo);
  if (to) {
    clauses.push("IFNULL(reg_date,'') <= ?");
    bind.push(to);
  }

  return { whereSql: `WHERE ${clauses.join(" AND ")}`, bind };
}

function mapListRow(r: Record<string, unknown>): KcsAdminNoticeListRow {
  const full = str(r.full_title);
  const list = str(r.list_title);
  return {
    id: num(r.id),
    nttSn: str(r.ntt_sn),
    seqNo: r.seq_no == null || str(r.seq_no) === "" ? null : num(r.seq_no),
    title: full || list,
    writer: str(r.writer) || null,
    regDate: str(r.reg_date) || null,
    viewCount: r.view_count == null ? null : num(r.view_count),
    sourceUrl: str(r.detail_url) || null,
    attachmentCount: num(r.attach_count),
  };
}

function mapAttach(
  a: Record<string, unknown>,
): KcsAdminNoticeAttachRow {
  const attachId = num(a.id);
  const local =
    str(a.saved_full_path) ||
    (str(a.save_dir) && str(a.saved_file_name)
      ? `${str(a.save_dir)}\\${str(a.saved_file_name)}`
      : "");
  let fileExists = false;
  if (local) {
    try {
      fileExists = fs.existsSync(resolveYestradeLocalFile(local));
    } catch {
      fileExists = false;
    }
  }
  return {
    attachId,
    fileKey: str(a.file_key),
    fileName: str(a.file_name) || str(a.saved_file_name) || `첨부_${attachId}`,
    downloadUrl: str(a.download_url) || null,
    localPath: local || null,
    sizeBytes: num(a.file_size_bytes),
    status: str(a.download_status),
    fileApiUrl: fileExists
      ? `${FILE_API}?attachId=${encodeURIComponent(String(attachId))}`
      : null,
  };
}

export function queryKcsAdminNotices(
  db: DatabaseSync,
  params: KcsAdminNoticeQueryParams,
): { rows: KcsAdminNoticeListRow[]; total: number } {
  if (!kcsAdminNoticeReady(db)) return { rows: [], total: 0 };

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
      ? "IFNULL(NULLIF(full_title,''), list_title)"
      : sort === "writer"
        ? "writer"
        : sort === "reg_date"
          ? "reg_date"
          : sort === "view_count"
            ? "view_count"
            : "seq_no";

  const rows = (
    db
      .prepare(
        `SELECT id, ntt_sn, seq_no, list_title, full_title, writer,
                reg_date, view_count, detail_url, attach_count
           FROM ${POST_TABLE}
           ${whereSql}
           ORDER BY ${orderCol} ${dir}, id DESC
           LIMIT ? OFFSET ?`,
      )
      .all(...bind, pageSize, (page - 1) * pageSize) as Record<
      string,
      unknown
    >[]
  ).map(mapListRow);

  return { rows, total };
}

export function getKcsAdminNoticeDetail(
  db: DatabaseSync,
  id: number,
): KcsAdminNoticeDetail | null {
  if (!kcsAdminNoticeReady(db) || !id) return null;

  const r = db
    .prepare(
      `SELECT id, ntt_sn, seq_no, list_title, full_title, writer,
              reg_date, view_count, detail_url, attach_count,
              IFNULL(content_html,'') AS content_html,
              IFNULL(content_text,'') AS content_text
         FROM ${POST_TABLE}
        WHERE id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!r) return null;

  const attachments: KcsAdminNoticeAttachRow[] = (
    db
      .prepare(
        `SELECT id, file_key, file_name, download_url, save_dir,
                saved_file_name, saved_full_path,
                IFNULL(file_size_bytes,0) AS file_size_bytes,
                IFNULL(download_status,'') AS download_status
           FROM ${ATTACH_TABLE}
          WHERE notice_id = ?
          ORDER BY IFNULL(file_seq, id) ASC`,
      )
      .all(id) as Record<string, unknown>[]
  ).map(mapAttach);

  return {
    ...mapListRow(r),
    contentHtml: str(r.content_html),
    contentText: str(r.content_text),
    attachments,
  };
}

export function getKcsAdminNoticeFile(
  db: DatabaseSync,
  attachId: number,
): {
  absolutePath: string;
  fileName: string;
  contentType: string;
} | null {
  if (!kcsAdminNoticeReady(db) || !attachId) return null;

  const r = db
    .prepare(
      `SELECT file_name, saved_file_name, save_dir, saved_full_path
         FROM ${ATTACH_TABLE}
        WHERE id = ?`,
    )
    .get(attachId) as Record<string, unknown> | undefined;
  if (!r) return null;

  const local =
    str(r.saved_full_path) ||
    (str(r.save_dir) && str(r.saved_file_name)
      ? `${str(r.save_dir)}\\${str(r.saved_file_name)}`
      : "");
  if (!local) return null;

  try {
    const absolutePath = resolveYestradeLocalFile(local);
    if (!fs.existsSync(absolutePath)) return null;
    const fileName =
      str(r.file_name) || str(r.saved_file_name) || absolutePath.split(/[/\\]/).pop()!;
    return {
      absolutePath,
      fileName,
      contentType: guessYestradeContentType(fileName),
    };
  } catch {
    return null;
  }
}
