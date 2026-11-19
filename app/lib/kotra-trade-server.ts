import "server-only";

import fs from "node:fs";
import {
  KOTRA_TRADE_SORT_KEYS,
  type KotraTradeAttachRow,
  type KotraTradeDetail,
  type KotraTradeListRow,
  type KotraTradeQueryParams,
  type KotraTradeSortKey,
} from "@/app/lib/kotra-trade-shared";
import {
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import {
  guessYestradeContentType,
  resolveYestradeLocalFile,
} from "@/app/lib/yestrade-sqlite";

const POST_TABLE = "kotra_trade_articles";
const ATTACH_TABLE = "kotra_trade_attachments";
const FILE_API = "/api/kotra-trade/file";

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
    /* plain text */
  }
  return s
    .split(/[,|]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseListJson(raw: unknown): Record<string, unknown> {
  try {
    const v = JSON.parse(str(raw) || "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function openKotraTradeDb(): Promise<SmartLawDb> {
  return openSmartLawDb(true);
}

export async function kotraTradeReady(db: SmartLawDb): Promise<boolean> {
  return smartLawTableExists(db, POST_TABLE);
}

function parseSort(raw?: string): KotraTradeSortKey {
  const s = str(raw);
  return (KOTRA_TRADE_SORT_KEYS as readonly string[]).includes(s)
    ? (s as KotraTradeSortKey)
    : "published_date";
}

function parseDir(raw?: string): "ASC" | "DESC" {
  return str(raw).toUpperCase() === "ASC" ? "ASC" : "DESC";
}

function buildWhere(params: KotraTradeQueryParams): {
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
        OR IFNULL(summary,'') LIKE ? ESCAPE '\\'
        OR IFNULL(content_text,'') LIKE ? ESCAPE '\\'
        OR IFNULL(keywords,'') LIKE ? ESCAPE '\\'
        OR IFNULL(country,'') LIKE ? ESCAPE '\\'
        OR IFNULL(office,'') LIKE ? ESCAPE '\\')`,
    );
    bind.push(p, p, p, p, p, p);
  }

  const country = str(params.country);
  if (country) {
    clauses.push("IFNULL(country,'') = ?");
    bind.push(country);
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
): KotraTradeListRow {
  const lj = parseListJson(r.list_json);
  const thumbIdx = str(lj.THUMB_FILE_IDX_VAL);
  return {
    sourceId: str(r.source_id),
    listNumber,
    title: str(r.title),
    category: str(r.category) || null,
    country: str(r.country) || null,
    office: str(r.office) || null,
    publishedDate: str(r.published_date) || null,
    summary: str(r.summary) || null,
    keywords: parseKeywords(r.keywords),
    sourceUrl: str(r.original_url) || null,
    attachmentCount: num(r.attach_count),
    // 원문 썸네일은 로그인/세션이 필요한 경우가 많아, 인덱스가 있을 때만 후보 URL 제공
    thumbUrl: thumbIdx
      ? `https://dream.kotra.or.kr/ajaxa/fileCpnt/fileDown.do?atFileSn=${encodeURIComponent(thumbIdx)}`
      : null,
  };
}

function mapAttach(a: Record<string, unknown>): KotraTradeAttachRow {
  const fileId = str(a.file_id);
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
    fileName: str(a.original_name) || `첨부_${fileId}`,
    downloadUrl: str(a.download_url) || null,
    localPath: local || null,
    sizeBytes: num(a.size_bytes),
    status: str(a.status),
    fileApiUrl: fileExists
      ? `${FILE_API}?sourceId=${encodeURIComponent(str(a.source_id))}&fileId=${encodeURIComponent(fileId)}`
      : null,
  };
}

export async function listKotraTradeCountries(
  db: SmartLawDb,
): Promise<string[]> {
  if (!(await kotraTradeReady(db))) return [];
  const rows = await db.all(
    `SELECT DISTINCT country AS c
       FROM ${POST_TABLE}
      WHERE IFNULL(country,'') <> ''
      ORDER BY country`,
  );
  return rows.map((r) => str(r.c));
}

export async function queryKotraTrade(
  db: SmartLawDb,
  params: KotraTradeQueryParams,
): Promise<{ rows: KotraTradeListRow[]; total: number }> {
  if (!(await kotraTradeReady(db))) return { rows: [], total: 0 };

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
    sort === "title" ? "title" : sort === "country" ? "country" : "published_date";

  const raw = await db.all(
    `SELECT a.source_id, a.title, a.category, a.country, a.office,
            a.published_date, a.summary, a.keywords, a.original_url,
            a.list_json,
            (SELECT COUNT(*) FROM ${ATTACH_TABLE} t
              WHERE t.source_id = a.source_id) AS attach_count
       FROM ${POST_TABLE} a
       ${whereSql}
       ORDER BY ${orderCol} ${dir}, a.source_id DESC
       LIMIT ? OFFSET ?`,
    [...bind, pageSize, (page - 1) * pageSize],
  );

  const rows = raw.map((r, i) =>
    mapListRow(r, total - ((page - 1) * pageSize + i)),
  );
  return { rows, total };
}

export async function getKotraTradeDetail(
  db: SmartLawDb,
  sourceId: string,
): Promise<KotraTradeDetail | null> {
  const key = str(sourceId);
  if (!(await kotraTradeReady(db)) || !key) return null;

  const r = await db.get(
    `SELECT a.source_id, a.title, a.category, a.country, a.office,
            a.published_date, a.source, a.summary, a.keywords,
            a.original_url, a.list_json,
            IFNULL(a.content_html,'') AS content_html,
            IFNULL(a.content_text,'') AS content_text,
            (SELECT COUNT(*) FROM ${ATTACH_TABLE} t
              WHERE t.source_id = a.source_id) AS attach_count
       FROM ${POST_TABLE} a
      WHERE a.source_id = ?`,
    [key],
  );
  if (!r) return null;

  const attachments = (
    await db.all(
      `SELECT source_id, file_id, original_name, download_url, local_path,
              IFNULL(size_bytes,0) AS size_bytes,
              IFNULL(status,'') AS status
         FROM ${ATTACH_TABLE}
        WHERE source_id = ?
        ORDER BY file_id ASC`,
      [key],
    )
  ).map(mapAttach);

  return {
    ...mapListRow(r, null),
    source: str(r.source) || null,
    contentHtml: str(r.content_html),
    contentText: str(r.content_text),
    attachments,
  };
}

export async function getKotraTradeFile(
  db: SmartLawDb,
  sourceId: string,
  fileId: string,
): Promise<{
  absolutePath: string;
  fileName: string;
  contentType: string;
} | null> {
  if (!(await kotraTradeReady(db)) || !sourceId || !fileId) return null;
  const r = await db.get(
    `SELECT original_name, local_path
       FROM ${ATTACH_TABLE}
      WHERE source_id = ? AND file_id = ?`,
    [sourceId, fileId],
  );
  if (!r) return null;
  const local = str(r.local_path);
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
