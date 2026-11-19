import "server-only";

import fs from "node:fs";
import {
  KOTRA_US_TRADE_SORT_KEYS,
  type KotraUsTradeAttachRow,
  type KotraUsTradeDetail,
  type KotraUsTradeListRow,
  type KotraUsTradeQueryParams,
  type KotraUsTradeSortKey,
} from "@/app/lib/kotra-us-trade-shared";
import {
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import {
  guessYestradeContentType,
  resolveYestradeLocalFile,
} from "@/app/lib/yestrade-sqlite";

const POST_TABLE = "kotra_us_trade_articles";
const ATTACH_TABLE = "kotra_us_trade_attachments";
const FILE_API = "/api/kotra-us-trade/file";

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

function parseKeywords(raw: unknown): string[] {
  const s = str(raw);
  if (!s) return [];
  try {
    const parsed = JSON.parse(s) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((x) => str(x)).filter(Boolean);
    }
  } catch {
    /* plain */
  }
  return s
    .split(/[,|#]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export async function openKotraUsTradeDb(): Promise<SmartLawDb> {
  return openSmartLawDb(true);
}

export async function kotraUsTradeReady(db: SmartLawDb): Promise<boolean> {
  return smartLawTableExists(db, POST_TABLE);
}

function parseSort(raw?: string): KotraUsTradeSortKey {
  const s = str(raw);
  return (KOTRA_US_TRADE_SORT_KEYS as readonly string[]).includes(s)
    ? (s as KotraUsTradeSortKey)
    : "published_date";
}

function parseDir(raw?: string): "ASC" | "DESC" {
  return str(raw).toUpperCase() === "ASC" ? "ASC" : "DESC";
}

function buildWhere(params: KotraUsTradeQueryParams): {
  whereSql: string;
  bind: unknown[];
} {
  const clauses: string[] = ["1=1"];
  const bind: unknown[] = [];

  const kw = str(params.keyword);
  if (kw) {
    const p = `%${escapeLike(kw)}%`;
    clauses.push(
      `(IFNULL(title,'') LIKE ? ESCAPE '\\'
        OR IFNULL(body_text,'') LIKE ? ESCAPE '\\'
        OR IFNULL(keywords,'') LIKE ? ESCAPE '\\'
        OR IFNULL(author,'') LIKE ? ESCAPE '\\'
        OR IFNULL(office,'') LIKE ? ESCAPE '\\')`,
    );
    bind.push(p, p, p, p, p);
  }

  const from = str(params.dateFrom).replace(/\./g, "-");
  if (from) {
    clauses.push("IFNULL(published_date,'') >= ?");
    bind.push(from.slice(0, 10));
  }
  const to = str(params.dateTo).replace(/\./g, "-");
  if (to) {
    clauses.push("IFNULL(published_date,'') <= ?");
    bind.push(to.slice(0, 10));
  }

  return { whereSql: `WHERE ${clauses.join(" AND ")}`, bind };
}

function mapListRow(
  r: Record<string, unknown>,
  listNumber: number | null,
): KotraUsTradeListRow {
  const body = str(r.body_text);
  return {
    articleId: str(r.article_id),
    listNumber,
    title: str(r.title),
    publishedDate: str(r.published_date) || null,
    author: str(r.author) || null,
    office: str(r.office) || null,
    keywords: parseKeywords(r.keywords),
    summary: body ? body.slice(0, 180) : null,
    sourceUrl: str(r.url) || null,
    attachmentCount: num(r.attach_count),
  };
}

function mapAttach(a: Record<string, unknown>): KotraUsTradeAttachRow {
  const fileId = str(a.file_id);
  const local = str(a.stored_path);
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
    fileName: str(a.filename) || `첨부_${fileId}`,
    downloadUrl: str(a.url) || null,
    localPath: local || null,
    status: str(a.status),
    fileApiUrl: fileExists
      ? `${FILE_API}?articleId=${encodeURIComponent(str(a.article_id))}&fileId=${encodeURIComponent(fileId)}`
      : null,
  };
}

export async function queryKotraUsTrade(
  db: SmartLawDb,
  params: KotraUsTradeQueryParams,
): Promise<{ rows: KotraUsTradeListRow[]; total: number; ready: boolean }> {
  if (!(await kotraUsTradeReady(db))) return { rows: [], total: 0, ready: false };

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
    sort === "title" ? "title" : sort === "office" ? "office" : "published_date";

  const raw = await db.all(
    `SELECT a.article_id, a.title, a.published_date, a.author, a.office,
            a.keywords, a.url, IFNULL(a.body_text,'') AS body_text,
            (SELECT COUNT(*) FROM ${ATTACH_TABLE} t
              WHERE t.article_id = a.article_id) AS attach_count
       FROM ${POST_TABLE} a
       ${whereSql}
       ORDER BY ${orderCol} ${dir}, a.article_id DESC
       LIMIT ? OFFSET ?`,
    [...bind, pageSize, (page - 1) * pageSize],
  );

  return {
    rows: raw.map((r, i) =>
      mapListRow(r, total - ((page - 1) * pageSize + i)),
    ),
    total,
    ready: true,
  };
}

export async function getKotraUsTradeDetail(
  db: SmartLawDb,
  articleId: string,
): Promise<KotraUsTradeDetail | null> {
  const key = str(articleId);
  if (!(await kotraUsTradeReady(db)) || !key) return null;

  const r = await db.get(
    `SELECT a.article_id, a.title, a.published_date, a.author, a.office,
            a.keywords, a.url,
            IFNULL(a.body_html,'') AS body_html,
            IFNULL(a.body_text,'') AS body_text,
            (SELECT COUNT(*) FROM ${ATTACH_TABLE} t
              WHERE t.article_id = a.article_id) AS attach_count
       FROM ${POST_TABLE} a
      WHERE a.article_id = ?`,
    [key],
  );
  if (!r) return null;

  const attachments = (
    await db.all(
      `SELECT article_id, file_id, filename, url, stored_path,
              IFNULL(status,'') AS status
         FROM ${ATTACH_TABLE}
        WHERE article_id = ?
        ORDER BY file_id ASC`,
      [key],
    )
  ).map(mapAttach);

  return {
    ...mapListRow(r, null),
    contentHtml: str(r.body_html),
    contentText: str(r.body_text),
    attachments,
  };
}

export async function getKotraUsTradeFile(
  db: SmartLawDb,
  articleId: string,
  fileId: string,
): Promise<{
  absolutePath: string;
  fileName: string;
  contentType: string;
} | null> {
  if (!(await kotraUsTradeReady(db)) || !articleId || !fileId) return null;
  const r = await db.get(
    `SELECT filename, stored_path
       FROM ${ATTACH_TABLE}
      WHERE article_id = ? AND file_id = ?`,
    [articleId, fileId],
  );
  if (!r) return null;
  const local = str(r.stored_path);
  if (!local) return null;
  try {
    const absolutePath = resolveYestradeLocalFile(local);
    if (!fs.existsSync(absolutePath)) return null;
    const fileName = str(r.filename) || absolutePath.split(/[/\\]/).pop()!;
    return {
      absolutePath,
      fileName,
      contentType: guessYestradeContentType(fileName),
    };
  } catch {
    return null;
  }
}
