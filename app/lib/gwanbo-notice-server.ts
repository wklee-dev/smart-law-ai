import "server-only";

import fs from "node:fs";
import {
  GWANBO_SORT_KEYS,
  type GwanboItemRow,
  type GwanboNoticeDetail,
  type GwanboNoticeListRow,
  type GwanboQueryParams,
  type GwanboSortKey,
} from "@/app/lib/gwanbo-notice-shared";
import {
  openSmartLawDb,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import { resolveYestradeLocalFile } from "@/app/lib/yestrade-sqlite";

const NOTICE_TABLE = "TB_GWANBO_NOTICE";
const ITEM_TABLE = "TB_GWANBO_ITEM";
const PDF_API = "/api/gwanbo-notice/file";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function numOrNull(v: unknown): number | null {
  if (v == null || str(v) === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function openGwanboDb(): Promise<SmartLawDb> {
  return openSmartLawDb(true);
}

export async function gwanboReady(db: SmartLawDb): Promise<boolean> {
  return smartLawTableExists(db, NOTICE_TABLE);
}

function localPdf(raw: unknown): string | null {
  const p = str(raw);
  if (!p) return null;
  try {
    const abs = resolveYestradeLocalFile(p);
    return fs.existsSync(abs) ? abs : null;
  } catch {
    return null;
  }
}

function mapListRow(r: Record<string, unknown>): GwanboNoticeListRow {
  const noticeId = str(r.notice_id);
  return {
    noticeId,
    categoryName: str(r.category_name) || null,
    regDate: str(r.reg_date) || null,
    ofcttNum: numOrNull(r.ofctt_num),
    title: str(r.title),
    organNm: str(r.organ_nm) || null,
    lawordNm: str(r.laword_nm) || null,
    viewerUrl: str(r.viewer_url) || null,
    pageCount: numOrNull(r.page_count),
    itemCount: numOrNull(r.item_count) ?? 0,
    pdfApiUrl: localPdf(r.pdf_file_path)
      ? `${PDF_API}?id=${encodeURIComponent(noticeId)}`
      : null,
  };
}

export async function queryGwanboNotices(
  db: SmartLawDb,
  params: GwanboQueryParams,
): Promise<{ rows: GwanboNoticeListRow[]; total: number }> {
  if (!(await gwanboReady(db))) return { rows: [], total: 0 };

  const page = Math.max(1, Math.floor(params.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize) || 10));

  const clauses: string[] = ["1=1"];
  const bind: unknown[] = [];
  const kw = str(params.keyword);
  if (kw) {
    const p = `%${escapeLike(kw)}%`;
    const field = str(params.field);
    if (field === "body") {
      clauses.push("IFNULL(n.body_text,'') LIKE ? ESCAPE '\\'");
      bind.push(p);
    } else if (field === "all") {
      clauses.push(
        "(IFNULL(n.title,'') LIKE ? ESCAPE '\\' OR IFNULL(n.body_text,'') LIKE ? ESCAPE '\\')",
      );
      bind.push(p, p);
    } else {
      clauses.push("IFNULL(n.title,'') LIKE ? ESCAPE '\\'");
      bind.push(p);
    }
  }
  const whereSql = `WHERE ${clauses.join(" AND ")}`;

  const sort: GwanboSortKey = (GWANBO_SORT_KEYS as string[]).includes(
    str(params.sort),
  )
    ? (str(params.sort) as GwanboSortKey)
    : "reg_date";
  const dir = str(params.sort_dir).toUpperCase() === "ASC" ? "ASC" : "DESC";
  const orderCol =
    sort === "title" ? "n.title" : sort === "ofctt_num" ? "n.ofctt_num" : "n.reg_date";

  const total = Number(
    (
      await db.get(
        `SELECT COUNT(*) AS n FROM "${NOTICE_TABLE}" n ${whereSql}`,
        bind,
      )
    )?.n ?? 0,
  );

  const raw = await db.all(
    `SELECT n.notice_id, n.category_name, n.reg_date, n.ofctt_num, n.title,
            n.organ_nm, n.laword_nm, n.viewer_url, n.page_count, n.pdf_file_path,
            (SELECT COUNT(*) FROM "${ITEM_TABLE}" i WHERE i.notice_id = n.notice_id) AS item_count
       FROM "${NOTICE_TABLE}" n
       ${whereSql}
       ORDER BY ${orderCol} ${dir}, n.ofctt_num DESC, n.notice_id DESC
       LIMIT ? OFFSET ?`,
    [...bind, pageSize, (page - 1) * pageSize],
  );

  return { rows: raw.map(mapListRow), total };
}

export async function getGwanboNoticeDetail(
  db: SmartLawDb,
  noticeId: string,
): Promise<GwanboNoticeDetail | null> {
  if (!(await gwanboReady(db)) || !noticeId) return null;

  const r = await db.get(
    `SELECT n.*,
            (SELECT COUNT(*) FROM "${ITEM_TABLE}" i WHERE i.notice_id = n.notice_id) AS item_count
       FROM "${NOTICE_TABLE}" n
      WHERE n.notice_id = ?`,
    [noticeId],
  );
  if (!r) return null;

  const itemRows = await db.all(
    `SELECT item_id, item_no, item_name, prev_doc_no, prev_hs_code, new_hs_code,
            change_reason, goods_desc, effective_date
       FROM "${ITEM_TABLE}"
      WHERE notice_id = ?
      ORDER BY IFNULL(item_no, item_id) ASC, item_id ASC`,
    [noticeId],
  );
  const items: GwanboItemRow[] = itemRows.map((a) => ({
    itemId: Number(a.item_id),
    itemNo: numOrNull(a.item_no),
    itemName: str(a.item_name) || null,
    prevDocNo: str(a.prev_doc_no) || null,
    prevHsCode: str(a.prev_hs_code) || null,
    newHsCode: str(a.new_hs_code) || null,
    changeReason: str(a.change_reason) || null,
    goodsDesc: str(a.goods_desc) || null,
    effectiveDate: str(a.effective_date) || null,
  }));

  return {
    ...mapListRow(r),
    organCode: str(r.organ_code) || null,
    pdfFileName: str(r.pdf_file_name) || null,
    pdfFileSize: numOrNull(r.pdf_file_size),
    bodyText: str(r.body_text),
    crawlDt: str(r.crawl_dt) || null,
    items,
  };
}

export async function getGwanboPdf(
  db: SmartLawDb,
  noticeId: string,
): Promise<{ absolutePath: string; fileName: string } | null> {
  if (!(await gwanboReady(db)) || !noticeId) return null;
  const r = await db.get(
    `SELECT pdf_file_name, pdf_file_path FROM "${NOTICE_TABLE}" WHERE notice_id = ?`,
    [noticeId],
  );
  if (!r) return null;
  const absolutePath = localPdf(r.pdf_file_path);
  if (!absolutePath) return null;
  return {
    absolutePath,
    fileName: str(r.pdf_file_name) || absolutePath.split(/[/\\]/).pop()!,
  };
}
