import fs from "node:fs";
import path from "node:path";
import {
  resolveSmartLawLocalPath,
  smartLawTableExists,
  withSmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

const NOTICE_TABLE = "clip_admin_notices";
const ATTACH_TABLE = "clip_admin_attachments";

export type AdminNoticeRow = {
  id: string;
  no: string;
  title: string;
  department: string;
  writtenDate: string;
  files: number;
};

export type AdminNoticeFile = {
  id: number;
  name: string;
  size: number;
};

export type AdminNoticeDetail = AdminNoticeRow & {
  html: string;
  text: string;
  sourceUrl: string;
  publication: string;
  attachments: AdminNoticeFile[];
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function safeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

export async function searchAdminNotices(
  keyword: string,
  page: number,
  pageSize = 10,
): Promise<{ rows: AdminNoticeRow[]; total: number; page: number }> {
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, NOTICE_TABLE))) return { rows: [], total: 0, page: 1 };
    const size = Math.min(50, Math.max(1, pageSize));
    const p = Math.max(1, page);
    const kw = keyword.trim();
    const where = ["1=1"];
    const params: unknown[] = [];
    if (kw) {
      where.push("(n.title LIKE ? OR n.department_name LIKE ? OR IFNULL(n.content_text,'') LIKE ?)");
      const like = `%${kw}%`;
      params.push(like, like, like);
    }
    const whereSql = where.join(" AND ");
    const total = num(
      (await db.get(`SELECT COUNT(*) AS n FROM ${NOTICE_TABLE} n WHERE ${whereSql}`, params))?.n,
    );
    const offset = (p - 1) * size;
    const fileSql = (await smartLawTableExists(db, ATTACH_TABLE))
      ? `(SELECT COUNT(*) FROM ${ATTACH_TABLE} a WHERE a.notice_id = n.notice_id AND IFNULL(a.is_current,1)=1)`
      : "0";
    const rows = await db.all(
      `SELECT n.notice_id, n.title, n.department_name, n.written_date, ${fileSql} AS n_files
         FROM ${NOTICE_TABLE} n
        WHERE ${whereSql}
        ORDER BY IFNULL(n.written_date,'') DESC, n.notice_id DESC
        LIMIT ? OFFSET ?`,
      [...params, size, offset],
    );
    return {
      total,
      page: p,
      rows: rows.map((r, i) => ({
        id: str(r.notice_id),
        no: String(total - offset - i),
        title: str(r.title),
        department: str(r.department_name),
        writtenDate: str(r.written_date),
        files: num(r.n_files),
      })),
    };
  });
}

export async function getAdminNotice(id: string): Promise<AdminNoticeDetail | null> {
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, NOTICE_TABLE))) return null;
    const r = await db.get(
      `SELECT notice_id, title, department_name, written_date,
              publication_year, publication_number, source_url,
              content_html, content_text
         FROM ${NOTICE_TABLE}
        WHERE notice_id = ?`,
      [id],
    );
    if (!r) return null;
    let attachments: AdminNoticeFile[] = [];
    if (await smartLawTableExists(db, ATTACH_TABLE)) {
      attachments = (
        await db.all(
          `SELECT attachment_pk, original_name, file_size
             FROM ${ATTACH_TABLE}
            WHERE notice_id = ? AND IFNULL(is_current,1)=1
            ORDER BY attachment_pk`,
          [id],
        )
      ).map((f) => ({
        id: num(f.attachment_pk),
        name: str(f.original_name),
        size: num(f.file_size),
      }));
    }
    const year = str(r.publication_year);
    const no = str(r.publication_number);
    return {
      id: str(r.notice_id),
      no: "",
      title: str(r.title),
      department: str(r.department_name),
      writtenDate: str(r.written_date),
      files: attachments.length,
      html: safeHtml(str(r.content_html)),
      text: str(r.content_text),
      sourceUrl: str(r.source_url),
      publication: year && no ? `${year}-${no}` : year || no,
      attachments,
    };
  });
}

export async function readAdminNoticeFile(
  id: number,
): Promise<{ name: string; bytes: Buffer } | null> {
  if (!id) return null;
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, ATTACH_TABLE))) return null;
    const r = await db.get(
      `SELECT local_path, original_name FROM ${ATTACH_TABLE} WHERE attachment_pk = ?`,
      [id],
    );
    const raw = str(r?.local_path);
    if (!raw) return null;
    const abs = resolveSmartLawLocalPath(raw);
    if (!abs || !fs.existsSync(abs)) return null;
    return { name: str(r?.original_name) || path.basename(abs), bytes: fs.readFileSync(abs) };
  });
}
