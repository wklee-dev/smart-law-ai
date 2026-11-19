import "server-only";

import fs from "node:fs";
import type {
  FtaTradeNewsAttachRow,
  FtaTradeNewsDetail,
  FtaTradeNewsListRow,
  FtaTradeNewsQueryParams,
} from "@/app/lib/fta-trade-news-shared";
import {
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import {
  guessYestradeContentType,
  resolveYestradeLocalFile,
} from "@/app/lib/yestrade-sqlite";

const POST_TABLE = "fta_trade_news_articles";
const ASSET_TABLE = "fta_trade_news_assets";
const FILE_API = "/api/fta-trade-news/file";

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

export async function openFtaTradeNewsDb(): Promise<SmartLawDb> {
  return openSmartLawDb(true);
}

function buildWhere(params: FtaTradeNewsQueryParams): {
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
    const contentSql = `IFNULL(a.body_text,'') LIKE ? ESCAPE '\\'`;
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

async function attachCountSql(db: SmartLawDb): Promise<string> {
  return (await smartLawTableExists(db, ASSET_TABLE))
    ? `(SELECT COUNT(*) FROM ${ASSET_TABLE} t
         WHERE t.article_id = a.article_id AND t.kind = 'attachment')`
    : "0";
}

function mapListRow(r: Record<string, unknown>): FtaTradeNewsListRow {
  const vc = r.view_count;
  return {
    articleId: str(r.article_id),
    title: str(r.title),
    registeredDate: str(r.registered_date) || null,
    viewCount: vc == null || vc === "" ? null : num(vc),
    sourceUrl: str(r.source_url) || null,
    attachmentCount: num(r.attach_count),
  };
}

const LIST_COLS = `a.article_id, a.title, a.registered_date, a.view_count, a.source_url`;

export async function queryFtaTradeNews(
  db: SmartLawDb,
  params: FtaTradeNewsQueryParams,
): Promise<{ rows: FtaTradeNewsListRow[]; total: number }> {
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
       ORDER BY a.registered_date DESC, CAST(a.article_id AS INTEGER) DESC
       LIMIT ? OFFSET ?`,
    [...bind, pageSize, (page - 1) * pageSize],
  );

  return { rows: raw.map(mapListRow), total };
}

function mapAttach(a: Record<string, unknown>): FtaTradeNewsAttachRow {
  const articleId = str(a.article_id);
  const assetKey = str(a.asset_key);
  const local = str(a.saved_path);
  let fileExists = false;
  if (local && str(a.status) === "downloaded") {
    try {
      fileExists = fs.existsSync(resolveYestradeLocalFile(local));
    } catch {
      fileExists = false;
    }
  }
  return {
    assetKey,
    fileName: str(a.original_name) || `첨부_${assetKey.slice(0, 8)}`,
    kind: str(a.kind),
    downloadUrl: str(a.source_url) || null,
    sizeBytes: num(a.size_bytes),
    status: str(a.status),
    fileApiUrl: fileExists
      ? `${FILE_API}?articleId=${encodeURIComponent(articleId)}&assetKey=${encodeURIComponent(assetKey)}`
      : null,
  };
}

export async function getFtaTradeNewsDetail(
  db: SmartLawDb,
  articleId: string,
): Promise<FtaTradeNewsDetail | null> {
  if (!(await smartLawTableExists(db, POST_TABLE)) || !articleId) return null;
  const r = await db.get(
    `SELECT ${LIST_COLS}, ${await attachCountSql(db)} AS attach_count,
            IFNULL(a.body_html,'') AS body_html,
            IFNULL(a.body_text,'') AS body_text
       FROM ${POST_TABLE} a
      WHERE a.article_id = ?`,
    [articleId],
  );
  if (!r) return null;

  const attachments = (await smartLawTableExists(db, ASSET_TABLE))
    ? (
        await db.all(
          `SELECT article_id, asset_key, kind, original_name, source_url,
                  status, saved_path, IFNULL(size_bytes,0) AS size_bytes
             FROM ${ASSET_TABLE}
            WHERE article_id = ? AND kind = 'attachment'
            ORDER BY asset_key`,
          [articleId],
        )
      ).map(mapAttach)
    : [];

  return {
    ...mapListRow(r),
    contentHtml: str(r.body_html),
    contentText: str(r.body_text),
    attachments,
  };
}

export async function getFtaTradeNewsFile(
  db: SmartLawDb,
  articleId: string,
  assetKey: string,
): Promise<{
  absolutePath: string;
  fileName: string;
  contentType: string;
} | null> {
  if (!(await smartLawTableExists(db, ASSET_TABLE)) || !articleId || !assetKey)
    return null;
  const r = await db.get(
    `SELECT original_name, saved_path, status
       FROM ${ASSET_TABLE}
      WHERE article_id = ? AND asset_key = ?`,
    [articleId, assetKey],
  );
  if (!r || str(r.status) !== "downloaded") return null;
  const local = str(r.saved_path);
  if (!local) return null;
  try {
    const absolutePath = resolveYestradeLocalFile(local);
    if (!fs.existsSync(absolutePath)) return null;
    const fileName =
      str(r.original_name) || absolutePath.split(/[/\\]/).pop()!;
    return {
      absolutePath,
      fileName,
      contentType: guessYestradeContentType(fileName),
    };
  } catch {
    return null;
  }
}
