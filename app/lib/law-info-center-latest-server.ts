import "server-only";

import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type {
  LawInfoCenterAttachment,
  LawInfoCenterCategoryCode,
  LawInfoCenterDetail,
  LawInfoCenterListRow,
  LawInfoCenterPart,
  LawInfoCenterTabCounts,
} from "@/app/lib/law-info-center-latest-shared";
import { LAW_INFO_CENTER_CATEGORY_TABS } from "@/app/lib/law-info-center-latest-shared";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

const LIST_TABLE = "llc_v1_list";

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function hasTable(db: DatabaseSync, name: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
    )
    .get(name) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

export function openLawInfoCenterDb(readOnly = true): DatabaseSync {
  const p = getSmartLawSqliteDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly });
}

export function lawInfoCenterTablesReady(db: DatabaseSync): boolean {
  return hasTable(db, LIST_TABLE);
}

function mapListRow(r: Record<string, unknown>): LawInfoCenterListRow {
  return {
    key: str(r.key),
    category: str(r.category),
    title: str(r.title),
    lawType: str(r.law_type),
    ministry: str(r.ministry),
    announceDate: str(r.announce_date),
    effectiveDate: str(r.effective_date),
    expireDate: str(r.expire_date),
    revisionType: str(r.revision_type),
    announceNo: str(r.announce_no),
    articleLabel: str(r.article_label),
    sourceUrl: str(r.source_url),
    matchedKeywords: str(r.matched_keywords),
  };
}

function mapPart(r: Record<string, unknown>): LawInfoCenterPart {
  return {
    partId: str(r.part_id),
    title: str(r.title),
    text: str(r.text),
    html: str(r.html),
  };
}

export function listLawInfoCenterFilters(db: DatabaseSync): {
  ready: boolean;
  ministries: string[];
  lawTypes: string[];
} {
  if (!lawInfoCenterTablesReady(db)) {
    return { ready: false, ministries: [], lawTypes: [] };
  }
  const ministries = (
    db
      .prepare(
        `SELECT DISTINCT ministry AS v FROM ${LIST_TABLE}
          WHERE TRIM(IFNULL(ministry,'')) != ''
          ORDER BY ministry`,
      )
      .all() as { v: string }[]
  ).map((r) => str(r.v));
  const lawTypes = (
    db
      .prepare(
        `SELECT DISTINCT law_type AS v FROM ${LIST_TABLE}
          WHERE TRIM(IFNULL(law_type,'')) != ''
          ORDER BY law_type`,
      )
      .all() as { v: string }[]
  ).map((r) => str(r.v));
  return { ready: true, ministries, lawTypes };
}

export type LawInfoCenterQuery = {
  category?: string;
  ministry?: string;
  lawType?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export function queryLawInfoCenterLatest(
  db: DatabaseSync,
  q: LawInfoCenterQuery,
): {
  ready: boolean;
  tabCounts: LawInfoCenterTabCounts;
  rows: LawInfoCenterListRow[];
  total: number;
  page: number;
  pageSize: number;
} {
  const emptyCounts = {
    전체: 0,
    ...Object.fromEntries(
      LAW_INFO_CENTER_CATEGORY_TABS.map((t) => [t.code, 0]),
    ),
  } as LawInfoCenterTabCounts;

  if (!lawInfoCenterTablesReady(db)) {
    return {
      ready: false,
      tabCounts: emptyCounts,
      rows: [],
      total: 0,
      page: 1,
      pageSize: 10,
    };
  }

  const pageSize = Math.min(100, Math.max(1, Number(q.pageSize) || 10));
  const page = Math.max(1, Number(q.page) || 1);
  const category = str(q.category);
  const ministry = str(q.ministry);
  const lawType = str(q.lawType);
  const keyword = str(q.keyword);

  const baseWhere: string[] = ["1=1"];
  const baseParams: unknown[] = [];
  if (ministry) {
    baseWhere.push("ministry = ?");
    baseParams.push(ministry);
  }
  if (lawType) {
    baseWhere.push("law_type = ?");
    baseParams.push(lawType);
  }
  if (keyword) {
    baseWhere.push(
      `(title LIKE ? OR IFNULL(article_label,'') LIKE ? OR IFNULL(matched_keywords,'') LIKE ?)`,
    );
    const like = `%${keyword}%`;
    baseParams.push(like, like, like);
  }
  const baseSql = baseWhere.join(" AND ");

  const tabCounts = { ...emptyCounts };
  tabCounts.전체 = num(
    (
      db
        .prepare(`SELECT COUNT(*) AS n FROM ${LIST_TABLE} WHERE ${baseSql}`)
        .get(...baseParams) as { n: number }
    )?.n,
  );
  for (const tab of LAW_INFO_CENTER_CATEGORY_TABS) {
    tabCounts[tab.code] = num(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM ${LIST_TABLE}
              WHERE ${baseSql} AND category = ?`,
          )
          .get(...baseParams, tab.code) as { n: number }
      )?.n,
    );
  }

  const where = [...baseWhere];
  const params = [...baseParams];
  if (
    category &&
    LAW_INFO_CENTER_CATEGORY_TABS.some((t) => t.code === category)
  ) {
    where.push("category = ?");
    params.push(category as LawInfoCenterCategoryCode);
  }
  const whereSql = where.join(" AND ");
  const total = num(
    (
      db
        .prepare(`SELECT COUNT(*) AS n FROM ${LIST_TABLE} WHERE ${whereSql}`)
        .get(...params) as { n: number }
    )?.n,
  );
  const offset = (page - 1) * pageSize;
  const rows = (
    db
      .prepare(
        `SELECT key, category, title, law_type, ministry, announce_date,
                effective_date, expire_date, revision_type, announce_no,
                article_label, source_url, matched_keywords
           FROM ${LIST_TABLE}
          WHERE ${whereSql}
          ORDER BY IFNULL(announce_date,'') DESC, IFNULL(effective_date,'') DESC, title
          LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as Record<string, unknown>[]
  ).map(mapListRow);

  return { ready: true, tabCounts, rows, total, page, pageSize };
}

function loadParts(
  db: DatabaseSync,
  table: string,
  itemKey: string,
): LawInfoCenterPart[] {
  if (!hasTable(db, table)) return [];
  return (
    db
      .prepare(
        `SELECT part_id, title, text, html
           FROM ${table}
          WHERE item_key = ?
          ORDER BY part_id`,
      )
      .all(itemKey) as Record<string, unknown>[]
  ).map(mapPart);
}

export function getLawInfoCenterDetail(
  db: DatabaseSync,
  key: string,
): LawInfoCenterDetail | null {
  const itemKey = str(key);
  if (!itemKey || !lawInfoCenterTablesReady(db)) return null;
  const r = db
    .prepare(
      `SELECT key, category, source_id, title, law_type, ministry,
              announce_date, effective_date, expire_date, revision_type,
              announce_no, article_label, source_url, matched_keywords
         FROM ${LIST_TABLE}
        WHERE key = ?`,
    )
    .get(itemKey) as Record<string, unknown> | undefined;
  if (!r) return null;

  let attachments: LawInfoCenterAttachment[] = [];
  if (hasTable(db, "llc_v1_raw_attachment")) {
    attachments = (
      db
        .prepare(
          `SELECT part_id, annex_id, display_name, size, status, local_path, url
             FROM llc_v1_raw_attachment
            WHERE item_key = ?
            ORDER BY part_id`,
        )
        .all(itemKey) as Record<string, unknown>[]
    ).map((f) => {
      const partId = str(f.part_id);
      const local = str(f.local_path);
      return {
        partId,
        annexId: str(f.annex_id),
        displayName: str(f.display_name),
        sizeBytes: num(f.size),
        status: str(f.status),
        hasLocalFile: Boolean(local && fs.existsSync(local)),
        downloadUrl: `/api/law-info-center/latest-laws/file?key=${encodeURIComponent(itemKey)}&partId=${encodeURIComponent(partId)}`,
        sourceUrl: str(f.url),
      };
    });
  }

  return {
    ...mapListRow(r),
    sourceId: str(r.source_id),
    articles: loadParts(db, "llc_v1_raw_articles", itemKey),
    addenda: loadParts(db, "llc_v1_raw_addendum", itemKey),
    annexes: loadParts(db, "llc_v1_raw_annex", itemKey),
    attachments,
  };
}

export function getLawInfoCenterAttachmentRow(
  db: DatabaseSync,
  itemKey: string,
  partId: string,
): { local_path: string; file_name: string } | null {
  if (!hasTable(db, "llc_v1_raw_attachment")) return null;
  const r = db
    .prepare(
      `SELECT local_path, display_name
         FROM llc_v1_raw_attachment
        WHERE item_key = ? AND part_id = ?`,
    )
    .get(str(itemKey), str(partId)) as
    | { local_path?: string; display_name?: string }
    | undefined;
  if (!r) return null;
  return {
    local_path: str(r.local_path),
    file_name: str(r.display_name),
  };
}
