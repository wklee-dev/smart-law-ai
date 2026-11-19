import {
  smartLawTableExists,
  withSmartLawDb,
} from "@/hanjoo/lib/smart-law-db";

export type ClipAdminNoticeRow = {
  noticeId: string;
  title: string;
  departmentName: string;
  writtenDate: string;
  sourceUrl: string;
};

export type ClipAdminNoticeDetail = ClipAdminNoticeRow & {
  contentText: string;
  contentHtml: string;
  publicationYear: string;
  publicationNumber: string;
};

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** 홈·뉴스 목록 — CLIP 관세청 행정예고/공고 (CLHS News 대체 가능 데이터) */
export async function listClipAdminNotices(
  limit = 20,
  page = 1,
): Promise<{
  rows: ClipAdminNoticeRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const pageSize = Math.min(50, Math.max(1, limit));
  const pageNo = Math.max(1, page);
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "clip_admin_notices"))) {
      return { rows: [], total: 0, page: pageNo, pageSize };
    }
    const total = Number(
      (await db.get(`SELECT COUNT(*) AS c FROM clip_admin_notices`))?.c ?? 0,
    );
    const offset = (pageNo - 1) * pageSize;
    const rows = (
      await db.all(
        `SELECT notice_id, title, department_name, written_date, source_url
           FROM clip_admin_notices
          ORDER BY IFNULL(written_date,'') DESC, notice_id DESC
          LIMIT ? OFFSET ?`,
        [pageSize, offset],
      )
    ).map((r) => ({
      noticeId: str(r.notice_id),
      title: str(r.title),
      departmentName: str(r.department_name),
      writtenDate: str(r.written_date),
      sourceUrl: str(r.source_url),
    }));
    return { rows, total, page: pageNo, pageSize };
  });
}

export async function getClipAdminNotice(
  noticeId: string,
): Promise<ClipAdminNoticeDetail | null> {
  const id = noticeId.trim();
  if (!id) return null;
  return withSmartLawDb(async (db) => {
    if (!(await smartLawTableExists(db, "clip_admin_notices"))) return null;
    const row = await db.get(
      `SELECT notice_id, title, department_name, written_date, source_url,
              content_text, content_html, publication_year, publication_number
         FROM clip_admin_notices
        WHERE notice_id = ?
        LIMIT 1`,
      [id],
    );
    if (!row) return null;
    return {
      noticeId: str(row.notice_id),
      title: str(row.title),
      departmentName: str(row.department_name),
      writtenDate: str(row.written_date),
      sourceUrl: str(row.source_url),
      contentText: str(row.content_text),
      contentHtml: str(row.content_html),
      publicationYear: str(row.publication_year),
      publicationNumber: str(row.publication_number),
    };
  });
}
