/**
 * law_source_catalog — smart_raw_ai.db (없으면 smart_law_ai.db)
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getSmartRawAiDbPath } from "@/app/lib/smart-raw-ai-db-paths";

const TABLE = "law_source_catalog";

export function getLawSourceCatalogDbPath(): string {
  return getSmartRawAiDbPath();
}

export function openLawSourceCatalogDb(): DatabaseSync {
  const p = getLawSourceCatalogDbPath();
  if (!fs.existsSync(p)) {
    throw new Error(`DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly: true });
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function tableExists(db: DatabaseSync): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
    )
    .get(TABLE) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

export type LawSourceCatalogRow = {
  gubun: number;
  classification: string;
  lawName: string;
  lawId: string;
  sourceUrl: string;
  urlType: string;
  sourceSheet: string;
  sourceFile: string;
  createdAt: string;
  updatedAt: string;
};

export type LawSourceCatalogMeta = {
  dbPath: string;
  total: number;
  missingLawIdCount: number;
  classifications: string[];
  urlTypes: { code: string; label: string; count: number }[];
};

const URL_TYPE_LABEL: Record<string, string> = {
  law: "법령",
  adm_rule: "행정규칙",
};

export function urlTypeLabel(code: string): string {
  return URL_TYPE_LABEL[code] ?? code;
}

export function getLawSourceCatalogMeta(): LawSourceCatalogMeta {
  const db = openLawSourceCatalogDb();
  try {
    if (!tableExists(db)) {
      throw new Error(`${TABLE} 테이블이 없습니다.`);
    }
    const total = Number(
      (db.prepare(`SELECT COUNT(*) AS n FROM ${TABLE}`).get() as { n: number })
        ?.n ?? 0,
    );
    const missingLawIdCount = Number(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM ${TABLE}
             WHERE law_id IS NULL OR TRIM(CAST(law_id AS TEXT)) = ''`,
          )
          .get() as { n: number }
      )?.n ?? 0,
    );
    const classifications = (
      db
        .prepare(
          `SELECT DISTINCT classification AS c FROM ${TABLE}
           WHERE classification IS NOT NULL AND TRIM(classification) != ''
           ORDER BY classification`,
        )
        .all() as { c: string }[]
    ).map((r) => str(r.c));
    const urlTypeRows = db
      .prepare(
        `SELECT url_type AS t, COUNT(*) AS n FROM ${TABLE}
         GROUP BY url_type ORDER BY url_type`,
      )
      .all() as { t: string; n: number }[];
    return {
      dbPath: getLawSourceCatalogDbPath(),
      total,
      missingLawIdCount,
      classifications,
      urlTypes: urlTypeRows.map((r) => ({
        code: str(r.t),
        label: urlTypeLabel(str(r.t)),
        count: Number(r.n) || 0,
      })),
    };
  } finally {
    db.close();
  }
}

export type LawSourceCatalogQuery = {
  classification?: string;
  urlType?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
};

export type LawSourceCatalogQueryResult = {
  items: LawSourceCatalogRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export function queryLawSourceCatalog(
  q: LawSourceCatalogQuery,
): LawSourceCatalogQueryResult {
  const classification = (q.classification ?? "").trim();
  const urlType = (q.urlType ?? "").trim();
  const keyword = (q.keyword ?? "").trim();
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 50));
  const page = Math.max(1, Number(q.page) || 1);

  const db = openLawSourceCatalogDb();
  try {
    if (!tableExists(db)) {
      throw new Error(`${TABLE} 테이블이 없습니다.`);
    }

    const where: string[] = [];
    const params: unknown[] = [];

    if (classification) {
      where.push("classification = ?");
      params.push(classification);
    }
    if (urlType) {
      where.push("url_type = ?");
      params.push(urlType);
    }
    if (keyword) {
      where.push("(law_name LIKE ? OR source_url LIKE ?)");
      const like = `%${keyword}%`;
      params.push(like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS n FROM ${TABLE} ${whereSql}`)
      .get(...params) as { n: number };
    const total = Number(totalRow?.n) || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;

    const rows = db
      .prepare(
        `SELECT gubun, classification, law_name, law_id, source_url, url_type,
                source_sheet, source_file, created_at, updated_at
         FROM ${TABLE}
         ${whereSql}
         ORDER BY gubun ASC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset) as Record<string, unknown>[];

    const items: LawSourceCatalogRow[] = rows.map((r) => ({
      gubun: Number(r.gubun) || 0,
      classification: str(r.classification),
      lawName: str(r.law_name),
      lawId: str(r.law_id),
      sourceUrl: str(r.source_url),
      urlType: str(r.url_type),
      sourceSheet: str(r.source_sheet),
      sourceFile: str(r.source_file),
      createdAt: str(r.created_at),
      updatedAt: str(r.updated_at),
    }));

    return { items, page, pageSize, total, totalPages };
  } finally {
    db.close();
  }
}
