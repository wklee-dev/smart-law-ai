import "server-only";

import fs from "node:fs";
import path from "node:path";
import {
  KCS_PRESS_SORT_KEYS,
  type KcsPressAttachRow,
  type KcsPressDetail,
  type KcsPressListRow,
  type KcsPressQueryParams,
  type KcsPressSortKey,
} from "@/app/lib/kcs-press-shared";
import {
  getSmartLawAttachRoot,
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import {
  guessYestradeContentType,
  resolveYestradeLocalFile,
} from "@/app/lib/yestrade-sqlite";

const POST_TABLE = "kcs_press_release_v1";
const ATTACH_TABLE = "kcs_press_attachment_v1";
const FILE_API = "/api/kcs-press/file";

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

export async function openKcsPressDb(): Promise<SmartLawDb> {
  return openSmartLawDb(true);
}

export async function kcsPressReady(db: SmartLawDb): Promise<boolean> {
  return smartLawTableExists(db, POST_TABLE);
}

function parseSort(raw?: string): KcsPressSortKey {
  const s = str(raw);
  return (KCS_PRESS_SORT_KEYS as readonly string[]).includes(s)
    ? (s as KcsPressSortKey)
    : "list_number";
}

function parseDir(raw?: string): "ASC" | "DESC" {
  return str(raw).toUpperCase() === "ASC" ? "ASC" : "DESC";
}

function buildWhere(params: KcsPressQueryParams): {
  whereSql: string;
  bind: unknown[];
} {
  const clauses: string[] = ["1=1"];
  const bind: unknown[] = [];

  const category = str(params.category);
  if (category) {
    clauses.push("IFNULL(category,'') = ?");
    bind.push(category);
  }

  const kw = str(params.keyword);
  if (kw) {
    const p = `%${escapeLike(kw)}%`;
    const field = str(params.searchField);
    const titleSql = `IFNULL(title,'') LIKE ? ESCAPE '\\'`;
    const contentSql = `IFNULL(body_text,'') LIKE ? ESCAPE '\\'`;
    if (field === "title") {
      clauses.push(`(${titleSql})`);
      bind.push(p);
    } else if (field === "content") {
      clauses.push(`(${contentSql})`);
      bind.push(p);
    } else if (field === "writer") {
      clauses.push("IFNULL(writer,'') LIKE ? ESCAPE '\\'");
      bind.push(p);
    } else {
      clauses.push(`(${titleSql} OR ${contentSql})`);
      bind.push(p, p);
    }
  }

  return { whereSql: `WHERE ${clauses.join(" AND ")}`, bind };
}

function mapListRow(r: Record<string, unknown>): KcsPressListRow {
  const listNumberRaw = str(r.list_number);
  return {
    nttSn: str(r.ntt_sn),
    listNumber: listNumberRaw ? num(listNumberRaw) : null,
    category: str(r.category) || null,
    title: str(r.title),
    writer: str(r.writer) || null,
    publishedDate: str(r.published_date) || null,
    viewCount: r.view_count == null ? null : num(r.view_count),
    sourceUrl: str(r.detail_url) || null,
    attachmentCount: num(r.attach_count),
  };
}

function resolveAttachLocal(relativePath: string): string {
  const rel = relativePath.replace(/\//g, path.sep).replace(/^[/\\]+/, "");
  return path.join(getSmartLawAttachRoot(), "downloads", rel);
}

function mapAttach(a: Record<string, unknown>): KcsPressAttachRow {
  const attachId = num(a.id);
  const relative = str(a.relative_path);
  const local = relative ? resolveAttachLocal(relative) : "";
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
    fileName: str(a.original_name) || `첨부_${attachId}`,
    downloadUrl: str(a.download_url) || null,
    localPath: local || null,
    sizeBytes: num(a.size_bytes),
    status: str(a.download_status),
    fileApiUrl: fileExists
      ? `${FILE_API}?attachId=${encodeURIComponent(String(attachId))}`
      : null,
  };
}

export async function listKcsPressCategories(db: SmartLawDb): Promise<string[]> {
  if (!(await kcsPressReady(db))) return [];
  return (
    await db.all(
      `SELECT DISTINCT category AS c
         FROM ${POST_TABLE}
        WHERE IFNULL(category,'') <> ''
        ORDER BY category`,
    )
  ).map((r) => str(r.c));
}

export async function queryKcsPress(
  db: SmartLawDb,
  params: KcsPressQueryParams,
): Promise<{ rows: KcsPressListRow[]; total: number }> {
  if (!(await kcsPressReady(db))) return { rows: [], total: 0 };

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
      : sort === "category"
        ? "category"
        : sort === "writer"
          ? "writer"
          : sort === "published_date"
            ? "published_date"
            : sort === "view_count"
              ? "view_count"
              : "CAST(IFNULL(list_number,'0') AS INTEGER)";

  const rows = (
    await db.all(
      `SELECT p.ntt_sn, p.list_number, p.category, p.title, p.writer,
              p.published_date, p.view_count, p.detail_url,
              (SELECT COUNT(*) FROM ${ATTACH_TABLE} a
                WHERE a.ntt_sn = p.ntt_sn
                  AND IFNULL(a.is_active,1) = 1) AS attach_count
         FROM ${POST_TABLE} p
         ${whereSql}
         ORDER BY ${orderCol} ${dir}, CAST(IFNULL(p.list_number,'0') AS INTEGER) DESC
         LIMIT ? OFFSET ?`,
      [...bind, pageSize, (page - 1) * pageSize],
    )
  ).map(mapListRow);

  return { rows, total };
}

export async function getKcsPressDetail(
  db: SmartLawDb,
  nttSn: string,
): Promise<KcsPressDetail | null> {
  const key = str(nttSn);
  if (!(await kcsPressReady(db)) || !key) return null;

  const r = await db.get(
    `SELECT p.ntt_sn, p.list_number, p.category, p.title, p.writer,
            p.published_date, p.view_count, p.detail_url,
            IFNULL(p.body_html,'') AS body_html,
            IFNULL(p.body_text,'') AS body_text,
            (SELECT COUNT(*) FROM ${ATTACH_TABLE} a
              WHERE a.ntt_sn = p.ntt_sn
                AND IFNULL(a.is_active,1) = 1) AS attach_count
       FROM ${POST_TABLE} p
      WHERE p.ntt_sn = ?`,
    [key],
  );
  if (!r) return null;

  const attachments: KcsPressAttachRow[] = (
    await db.all(
      `SELECT id, file_key, original_name, download_url, relative_path,
              IFNULL(size_bytes,0) AS size_bytes,
              IFNULL(download_status,'') AS download_status
         FROM ${ATTACH_TABLE}
        WHERE ntt_sn = ?
          AND IFNULL(is_active,1) = 1
        ORDER BY id ASC`,
      [key],
    )
  ).map(mapAttach);

  return {
    ...mapListRow(r),
    contentHtml: str(r.body_html),
    contentText: str(r.body_text),
    attachments,
  };
}

export async function getKcsPressFile(
  db: SmartLawDb,
  attachId: number,
): Promise<{
  absolutePath: string;
  fileName: string;
  contentType: string;
} | null> {
  if (!(await kcsPressReady(db)) || !attachId) return null;

  const r = await db.get(
    `SELECT original_name, relative_path
       FROM ${ATTACH_TABLE}
      WHERE id = ?
        AND IFNULL(is_active,1) = 1`,
    [attachId],
  );
  if (!r) return null;

  const relative = str(r.relative_path);
  if (!relative) return null;

  try {
    const absolutePath = resolveYestradeLocalFile(resolveAttachLocal(relative));
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
