import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type {
  LlcHsChangeNoticeDetail,
  LlcHsChangeNoticeListRow,
  LlcHsChangeNoticeQueryParams,
  LlcHsChangeNoticeTextItem,
} from "@/app/lib/llc-hs-change-notice-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

const TABLE = "llc_hs_change_notice";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseJsonArray(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(String(raw)) as unknown;
    return Array.isArray(v) ? v.map((x) => String(x ?? "")) : [];
  } catch {
    return [];
  }
}

function parseJsonRows(raw: unknown): string[][] {
  if (!raw) return [];
  try {
    const v = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(v)) return [];
    return v.map((row) =>
      Array.isArray(row) ? row.map((c) => String(c ?? "")) : [],
    );
  } catch {
    return [];
  }
}

function parsePrior(raw: unknown): { headers: string[]; rows: string[][] } {
  if (!raw) return { headers: [], rows: [] };
  try {
    const v = JSON.parse(String(raw)) as {
      headers?: unknown;
      rows?: unknown;
    };
    return {
      headers: Array.isArray(v.headers)
        ? v.headers.map((x) => String(x ?? ""))
        : [],
      rows: Array.isArray(v.rows)
        ? v.rows.map((row) =>
            Array.isArray(row) ? row.map((c) => String(c ?? "")) : [],
          )
        : [],
    };
  } catch {
    return { headers: [], rows: [] };
  }
}

function parseTextItems(raw: unknown): LlcHsChangeNoticeTextItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(v)) return [];
    return v.map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return {
        mark: str(o.mark),
        itemName: str(o.item_name ?? o.itemName),
        priorDoc: str(o.prior_doc ?? o.priorDoc),
        overview: str(o.overview),
        hsBefore: str(o.hs_before ?? o.hsBefore),
        hsAfter: str(o.hs_after ?? o.hsAfter),
        changeReason: str(o.change_reason ?? o.changeReason),
      };
    });
  } catch {
    return [];
  }
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { name: string } | undefined;
  return Boolean(row?.name);
}

export function openLlcHsChangeNoticeDb(): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly: true });
}

export function llcHsChangeNoticeTableReady(db: DatabaseSync): boolean {
  return hasTable(db, TABLE);
}

function mapListRow(row: Record<string, unknown>): LlcHsChangeNoticeListRow {
  return {
    id: num(row.id),
    seqNo: num(row.seq_no),
    noticeNo: str(row.notice_no),
    noticeNoLabel: str(row.notice_no_label) || `${str(row.notice_no)}호`,
    noticeDate: str(row.notice_date),
    itemName: str(row.item_name),
    hsBefore: str(row.hs_before),
    hsAfter: str(row.hs_after),
    layoutType: str(row.layout_type),
  };
}

function mapDetail(row: Record<string, unknown>): LlcHsChangeNoticeDetail {
  const page = row.source_pdf_page;
  const prior = parsePrior(row.prior_rows_json);
  const textItems = parseTextItems(row.text_items_json);
  let headers = parseJsonArray(row.table_headers_json);
  let rows = parseJsonRows(row.table_rows_json);

  // Fallback: build 4-col table from flat fields when JSON empty (표형만)
  if (
    textItems.length === 0 &&
    (headers.length === 0 || rows.length === 0)
  ) {
    headers = ["변경전 HS품목번호", "변경후 HS품목번호", "물품설명", "변경사유"];
    rows = [
      [
        str(row.hs_before),
        str(row.hs_after),
        str(row.product_overview),
        str(row.change_reason),
      ],
    ];
  }

  return {
    ...mapListRow(row),
    title: str(row.title),
    introText: str(row.intro_text),
    productOverview: str(row.product_overview),
    changeReason: str(row.change_reason),
    priorDocuments: str(row.prior_documents),
    applicationNote: str(row.application_note),
    tableHeaders: headers,
    tableRows: rows,
    priorHeaders: prior.headers,
    priorRows: prior.rows,
    textItems,
    sourcePdfPage: page == null || page === "" ? null : num(page) || null,
    sourceFile: str(row.source_file),
    rawText: str(row.raw_text),
  };
}

function normalizeHsFilter(raw: string): string {
  return str(raw).replace(/[.\s-]/g, "");
}

export function queryLlcHsChangeNotice(
  db: DatabaseSync,
  params: LlcHsChangeNoticeQueryParams,
): { ready: boolean; rows: LlcHsChangeNoticeListRow[]; total: number } {
  if (!llcHsChangeNoticeTableReady(db)) {
    return { ready: false, rows: [], total: 0 };
  }

  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(5, Math.floor(params.pageSize ?? 10)));
  const noticeNo = str(params.noticeNo);
  const hsDigits = normalizeHsFilter(params.hsCode ?? "");
  const keyword = str(params.keyword);

  const where: string[] = ["1=1"];
  const binds: unknown[] = [];

  if (noticeNo) {
    where.push(
      "(notice_no LIKE ? OR notice_no_label LIKE ? OR REPLACE(notice_no,'-','') LIKE ?)",
    );
    const like = `%${noticeNo}%`;
    binds.push(like, like, `%${noticeNo.replace(/-/g, "")}%`);
  }
  if (hsDigits) {
    where.push(
      `(REPLACE(REPLACE(REPLACE(hs_before,'.',''),'-',''),' ','') LIKE ?
       OR REPLACE(REPLACE(REPLACE(hs_after,'.',''),'-',''),' ','') LIKE ?
       OR table_rows_json LIKE ?)`,
    );
    const like = `%${hsDigits}%`;
    binds.push(like, like, `%${hsDigits}%`);
  }
  if (keyword) {
    where.push(
      `(item_name LIKE ? OR title LIKE ? OR product_overview LIKE ?
        OR change_reason LIKE ? OR raw_text LIKE ? OR table_rows_json LIKE ?)`,
    );
    const like = `%${keyword}%`;
    binds.push(like, like, like, like, like, like);
  }

  const whereSql = where.join(" AND ");
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM ${TABLE} WHERE ${whereSql}`)
    .get(...binds) as { c: number };
  const total = num(totalRow?.c);
  const offset = (page - 1) * pageSize;

  const rows = db
    .prepare(
      `SELECT id, seq_no, notice_no, notice_no_label, notice_date,
              item_name, hs_before, hs_after, layout_type
       FROM ${TABLE}
       WHERE ${whereSql}
       ORDER BY seq_no ASC
       LIMIT ? OFFSET ?`,
    )
    .all(...binds, pageSize, offset) as Record<string, unknown>[];

  return {
    ready: true,
    rows: rows.map(mapListRow),
    total,
  };
}

export function getLlcHsChangeNoticeDetail(
  db: DatabaseSync,
  id: number,
): LlcHsChangeNoticeDetail | null {
  if (!llcHsChangeNoticeTableReady(db) || !id) return null;
  const row = db
    .prepare(`SELECT * FROM ${TABLE} WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? mapDetail(row) : null;
}
