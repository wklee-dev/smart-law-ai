import "server-only";

import fs from "node:fs";
import type {
  MfdsPressAttachRow,
  MfdsPressDetail,
  MfdsPressListRow,
  MfdsPressQueryParams,
} from "@/app/lib/mfds-press-shared";
import {
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import {
  guessYestradeContentType,
  resolveYestradeLocalFile,
} from "@/app/lib/yestrade-sqlite";

const POST_TABLE = "mfds_press_articles";
const ATTACH_TABLE = "mfds_press_attachments";
const FILE_API = "/api/mfds-press/file";

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

export async function openMfdsPressDb(): Promise<SmartLawDb> {
  return openSmartLawDb(true);
}

export async function mfdsPressReady(db: SmartLawDb): Promise<boolean> {
  return smartLawTableExists(db, POST_TABLE);
}

function buildWhere(params: MfdsPressQueryParams): {
  whereSql: string;
  bind: unknown[];
} {
  const clauses: string[] = ["1=1"];
  const bind: unknown[] = [];

  const kw = str(params.keyword);
  if (kw) {
    const p = `%${escapeLike(kw)}%`;
    const field = str(params.searchField);
    const titleSql = `IFNULL(title,'') LIKE ? ESCAPE '\\'`;
    const contentSql = `IFNULL(body_text,'') LIKE ? ESCAPE '\\'`;
    if (field === "content") {
      clauses.push(`(${contentSql})`);
      bind.push(p);
    } else if (field === "all") {
      clauses.push(`(${titleSql} OR ${contentSql})`);
      bind.push(p, p);
    } else if (field === "department") {
      clauses.push("IFNULL(department,'') LIKE ? ESCAPE '\\'");
      bind.push(p);
    } else {
      clauses.push(`(${titleSql})`);
      bind.push(p);
    }
  }

  const from = str(params.dateFrom);
  if (from) {
    clauses.push("IFNULL(published_date, list_date) >= ?");
    bind.push(from.slice(0, 10));
  }
  const to = str(params.dateTo);
  if (to) {
    clauses.push("IFNULL(published_date, list_date) <= ?");
    bind.push(to.slice(0, 10));
  }

  return { whereSql: `WHERE ${clauses.join(" AND ")}`, bind };
}

function mapAttach(a: Record<string, unknown>): MfdsPressAttachRow {
  const seq = num(a.seq);
  const fileSeq = num(a.file_seq);
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
    fileSeq,
    fileName: str(a.original_name) || `첨부_${fileSeq}`,
    downloadUrl: str(a.url) || null,
    sizeBytes: num(a.size_bytes),
    status: str(a.status),
    fileApiUrl: fileExists
      ? `${FILE_API}?seq=${seq}&fileSeq=${fileSeq}`
      : null,
  };
}

async function loadAttachments(
  db: SmartLawDb,
  seqs: number[],
): Promise<Map<number, MfdsPressAttachRow[]>> {
  const out = new Map<number, MfdsPressAttachRow[]>();
  if (!seqs.length) return out;
  const marks = seqs.map(() => "?").join(",");
  const rows = await db.all(
    `SELECT seq, file_seq, original_name, url, saved_path, status,
            IFNULL(size_bytes,0) AS size_bytes
       FROM ${ATTACH_TABLE}
      WHERE seq IN (${marks})
      ORDER BY seq, file_seq`,
    seqs,
  );
  for (const r of rows) {
    const key = num(r.seq);
    const list = out.get(key) ?? [];
    list.push(mapAttach(r));
    out.set(key, list);
  }
  return out;
}

function mapListRow(
  r: Record<string, unknown>,
  attachments: MfdsPressAttachRow[],
): MfdsPressListRow {
  return {
    seq: num(r.seq),
    listNumber: str(r.list_number) || null,
    isNotice: num(r.is_notice) === 1,
    title: str(r.title),
    department: str(r.department) || null,
    viewCount: str(r.view_count) || null,
    publishedDate: str(r.published_date) || str(r.list_date) || null,
    sourceUrl: str(r.url) || null,
    attachments,
  };
}

const LIST_COLS = `seq, list_number, is_notice, title, department, view_count,
  published_date, list_date, url`;

export async function queryMfdsPress(
  db: SmartLawDb,
  params: MfdsPressQueryParams,
): Promise<{ rows: MfdsPressListRow[]; total: number }> {
  if (!(await mfdsPressReady(db))) return { rows: [], total: 0 };

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));
  const { whereSql, bind } = buildWhere(params);

  const total = num(
    (await db.get(`SELECT COUNT(*) AS n FROM ${POST_TABLE} ${whereSql}`, bind))
      ?.n,
  );

  const raw = await db.all(
    `SELECT ${LIST_COLS}
       FROM ${POST_TABLE}
       ${whereSql}
       ORDER BY is_notice DESC, seq DESC
       LIMIT ? OFFSET ?`,
    [...bind, pageSize, (page - 1) * pageSize],
  );

  const attach = await loadAttachments(
    db,
    raw.map((r) => num(r.seq)),
  );
  return {
    rows: raw.map((r) => mapListRow(r, attach.get(num(r.seq)) ?? [])),
    total,
  };
}

export async function getMfdsPressDetail(
  db: SmartLawDb,
  seq: number,
): Promise<MfdsPressDetail | null> {
  if (!(await mfdsPressReady(db)) || !seq) return null;
  const r = await db.get(
    `SELECT ${LIST_COLS}, contact, phone,
            IFNULL(body_html,'') AS body_html,
            IFNULL(body_text,'') AS body_text
       FROM ${POST_TABLE}
      WHERE seq = ?`,
    [seq],
  );
  if (!r) return null;
  const attach = await loadAttachments(db, [seq]);
  return {
    ...mapListRow(r, attach.get(seq) ?? []),
    contact: str(r.contact) || null,
    phone: str(r.phone) || null,
    contentHtml: str(r.body_html),
    contentText: str(r.body_text),
  };
}

export async function getMfdsPressFile(
  db: SmartLawDb,
  seq: number,
  fileSeq: number,
): Promise<{
  absolutePath: string;
  fileName: string;
  contentType: string;
} | null> {
  if (!(await mfdsPressReady(db)) || !seq || !fileSeq) return null;
  const r = await db.get(
    `SELECT original_name, saved_path, status
       FROM ${ATTACH_TABLE}
      WHERE seq = ? AND file_seq = ?`,
    [seq, fileSeq],
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
