import "server-only";

import fs from "node:fs";
import type {
  KctdiTradeAttachRow,
  KctdiTradeDetail,
  KctdiTradeListRow,
  KctdiTradeQueryParams,
} from "@/app/lib/kctdi-trade-shared";
import {
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import {
  guessYestradeContentType,
  resolveYestradeLocalFile,
} from "@/app/lib/yestrade-sqlite";

const POST_TABLE = "kctdi_trade_articles";
const ATTACH_TABLE = "kctdi_trade_attachments";
const FILE_API = "/api/kctdi-trade/file";

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

export async function openKctdiTradeDb(): Promise<SmartLawDb> {
  return openSmartLawDb(true);
}

function buildWhere(params: KctdiTradeQueryParams): {
  whereSql: string;
  bind: unknown[];
} {
  const clauses: string[] = ["1=1"];
  const bind: unknown[] = [];

  const kw = str(params.keyword);
  if (kw) {
    const p = `%${escapeLike(kw)}%`;
    const field = str(params.searchField);
    const titleSql = `IFNULL(a.title,'') LIKE ? ESCAPE '\\'`;
    const contentSql = `IFNULL(a.content_text,'') LIKE ? ESCAPE '\\'`;
    if (field === "title") {
      clauses.push(`(${titleSql})`);
      bind.push(p);
    } else if (field === "content") {
      clauses.push(`(${contentSql})`);
      bind.push(p);
    } else {
      clauses.push(`(${titleSql} OR ${contentSql})`);
      bind.push(p, p);
    }
  }

  const from = str(params.dateFrom);
  if (from) {
    clauses.push("a.registered_date >= ?");
    bind.push(from.slice(0, 10));
  }
  const to = str(params.dateTo);
  if (to) {
    clauses.push("a.registered_date <= ?");
    bind.push(to.slice(0, 10));
  }

  return { whereSql: `WHERE ${clauses.join(" AND ")}`, bind };
}

function mapListRow(r: Record<string, unknown>): KctdiTradeListRow {
  return {
    articleNo: str(r.article_no),
    boardNumber: str(r.board_number) || null,
    title: str(r.title),
    writer: str(r.writer) || null,
    registeredDate: str(r.registered_date) || null,
    sourceUrl: str(r.detail_url) || null,
    attachmentCount: num(r.attach_count),
  };
}

async function attachCountSql(db: SmartLawDb): Promise<string> {
  return (await smartLawTableExists(db, ATTACH_TABLE))
    ? `(SELECT COUNT(*) FROM ${ATTACH_TABLE} t WHERE t.article_no = a.article_no)`
    : "0";
}

const LIST_COLS = `a.article_no, a.board_number, a.title, a.writer,
  a.registered_date, a.detail_url`;

export async function queryKctdiTrade(
  db: SmartLawDb,
  params: KctdiTradeQueryParams,
): Promise<{ rows: KctdiTradeListRow[]; total: number }> {
  if (!(await smartLawTableExists(db, POST_TABLE))) return { rows: [], total: 0 };

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const { whereSql, bind } = buildWhere(params);

  const total = num(
    (
      await db.get(
        `SELECT COUNT(*) AS n FROM ${POST_TABLE} a ${whereSql}`,
        bind,
      )
    )?.n,
  );

  const raw = await db.all(
    `SELECT ${LIST_COLS}, ${await attachCountSql(db)} AS attach_count
       FROM ${POST_TABLE} a
       ${whereSql}
       ORDER BY a.registered_date DESC,
                CAST(a.board_number AS INTEGER) DESC,
                a.article_no DESC
       LIMIT ? OFFSET ?`,
    [...bind, pageSize, (page - 1) * pageSize],
  );

  return { rows: raw.map(mapListRow), total };
}

function mapAttach(a: Record<string, unknown>): KctdiTradeAttachRow {
  const articleNo = str(a.article_no);
  const fileKey = str(a.file_key);
  const local = str(a.saved_path);
  let fileExists = false;
  if (local) {
    try {
      fileExists = fs.existsSync(resolveYestradeLocalFile(local));
    } catch {
      fileExists = false;
    }
  }
  return {
    fileKey,
    fileName: str(a.original_filename) || `첨부_${fileKey}`,
    downloadUrl: str(a.download_url) || null,
    sizeBytes: num(a.size_bytes),
    fileApiUrl: fileExists
      ? `${FILE_API}?articleNo=${encodeURIComponent(articleNo)}&fileKey=${encodeURIComponent(fileKey)}`
      : null,
  };
}

export async function getKctdiTradeDetail(
  db: SmartLawDb,
  articleNo: string,
): Promise<KctdiTradeDetail | null> {
  if (!(await smartLawTableExists(db, POST_TABLE)) || !articleNo) return null;
  const r = await db.get(
    `SELECT ${LIST_COLS}, ${await attachCountSql(db)} AS attach_count,
            IFNULL(a.content_html,'') AS content_html,
            IFNULL(a.content_text,'') AS content_text
       FROM ${POST_TABLE} a
      WHERE a.article_no = ?`,
    [articleNo],
  );
  if (!r) return null;

  const attachments = (await smartLawTableExists(db, ATTACH_TABLE))
    ? (
        await db.all(
          `SELECT article_no, file_key, original_filename, download_url,
                  saved_path, IFNULL(size_bytes,0) AS size_bytes
             FROM ${ATTACH_TABLE}
            WHERE article_no = ?
            ORDER BY file_key`,
          [articleNo],
        )
      ).map(mapAttach)
    : [];

  return {
    ...mapListRow(r),
    contentHtml: str(r.content_html),
    contentText: str(r.content_text),
    attachments,
  };
}

export async function getKctdiTradeFile(
  db: SmartLawDb,
  articleNo: string,
  fileKey: string,
): Promise<{
  absolutePath: string;
  fileName: string;
  contentType: string;
} | null> {
  if (!(await smartLawTableExists(db, ATTACH_TABLE)) || !articleNo || !fileKey)
    return null;
  const r = await db.get(
    `SELECT original_filename, saved_path
       FROM ${ATTACH_TABLE}
      WHERE article_no = ? AND file_key = ?`,
    [articleNo, fileKey],
  );
  const local = str(r?.saved_path);
  if (!local) return null;
  try {
    const absolutePath = resolveYestradeLocalFile(local);
    if (!fs.existsSync(absolutePath)) return null;
    const fileName =
      str(r?.original_filename) || absolutePath.split(/[/\\]/).pop()!;
    return {
      absolutePath,
      fileName,
      contentType: guessYestradeContentType(fileName),
    };
  } catch {
    return null;
  }
}
