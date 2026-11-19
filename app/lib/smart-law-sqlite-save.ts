import type { DatabaseSync } from "node:sqlite";
import {
  itemLevelToDb,
  itemSemanticLevel,
  uniqueArticleNoForDb,
} from "@/app/lib/law-article-db";
import {
  parseLawDetailJson,
  type ParsedArticleItem,
} from "@/app/lib/law-detail-parser";
import type { LawStructureNodeInsert } from "@/app/lib/law-structure-nodes";
import { insertLawStructureNodesForArticlesWith } from "@/app/lib/law-structure-nodes";
import { openSmartLawSqliteDbWritable } from "@/app/lib/smart-law-sqlite-server";
import { normalizeLawIdForStorage } from "@/app/shared/law-id";

export type SaveLawDetailSqliteResult = {
  lawId: string;
  lawVersionId: number;
  articleCount: number;
  chunkCount: number;
};

function toIsoDate(value: string): string | null {
  const t = value?.trim() ?? "";
  if (t.length === 8 && /^\d{8}$/.test(t)) {
    return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
  }
  return t || null;
}

function stmtGet<T extends Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

function stmtAll<T extends Record<string, unknown>>(
  db: DatabaseSync,
  sql: string,
  params: unknown[] = [],
): T[] {
  return (db.prepare(sql).all(...params) as T[]) ?? [];
}

function stmtRun(db: DatabaseSync, sql: string, params: unknown[] = []) {
  return db.prepare(sql).run(...params);
}

function getLastInsertRowId(result: unknown): number {
  if (
    typeof result !== "object" ||
    result === null ||
    !("lastInsertRowid" in result)
  ) {
    throw new Error(
      "SQLite INSERT 결과에 lastInsertRowid가 없습니다.",
    );
  }

  const value = result.lastInsertRowid;

  if (typeof value !== "number" && typeof value !== "bigint") {
    throw new Error(
      "SQLite lastInsertRowid 형식이 올바르지 않습니다.",
    );
  }

  const numericValue = Number(value);

  if (!Number.isSafeInteger(numericValue) || numericValue <= 0) {
    throw new Error(
      "SQLite lastInsertRowid 값이 올바르지 않습니다.",
    );
  }

  return numericValue;
}

function jsonText(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function insertStructureNodeSqlite(
  db: DatabaseSync,
  row: LawStructureNodeInsert,
): number {
  const result = stmtRun(
    db,
    `
    INSERT INTO law_structure_nodes (
      law_version_id, parent_id, node_type, node_no, node_title,
      full_title, display_order, depth, article_no, article_key, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      row.law_version_id,
      row.parent_id,
      row.node_type,
      row.node_no,
      row.node_title,
      row.full_title,
      row.display_order,
      row.depth,
      row.article_no,
      row.article_key,
      jsonText(row.raw_json),
    ],
  );
  return getLastInsertRowId(result);
}

function insertArticleItemTreeSqlite(
  db: DatabaseSync,
  lawArticleId: number,
  item: ParsedArticleItem,
  parentItemId: number | null,
) {
  const result = stmtRun(
    db,
    `
    INSERT INTO law_article_items (
      law_article_id, item_level, parent_item_id, item_no, item_content,
      display_order, depth, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      lawArticleId,
      itemLevelToDb(item.itemLevel),
      parentItemId,
      item.itemNo,
      item.itemContent,
      item.itemOrder,
      itemSemanticLevel(item.itemLevel),
      jsonText(item.rawJson),
    ],
  );

  const itemId = getLastInsertRowId(result);
  for (const child of item.children) {
    insertArticleItemTreeSqlite(db, lawArticleId, child, itemId);
  }
}

function clearVersionChildren(db: DatabaseSync, lawVersionId: number) {
  const articleIds = stmtAll<{ id: number }>(
    db,
    `SELECT id FROM law_articles WHERE law_version_id = ?`,
    [lawVersionId],
  );

  if (articleIds.length > 0) {
    const placeholders = articleIds.map(() => "?").join(", ");
    stmtRun(
      db,
      `DELETE FROM law_article_items WHERE law_article_id IN (${placeholders})`,
      articleIds.map((r) => r.id),
    );
  }

  stmtRun(db, `DELETE FROM law_articles WHERE law_version_id = ?`, [
    lawVersionId,
  ]);
  stmtRun(db, `DELETE FROM law_structure_nodes WHERE law_version_id = ?`, [
    lawVersionId,
  ]);
}

function demoteOtherCurrentVersions(
  db: DatabaseSync,
  lawPk: number,
  keepVersionId: number,
) {
  stmtRun(
    db,
    `UPDATE law_versions SET is_current = 0 WHERE law_id = ? AND id != ?`,
    [lawPk, keepVersionId],
  );
}

export function saveLawDetailToSqlite(
  rawJson: Record<string, unknown>,
): SaveLawDetailSqliteResult {
  const parsed = parseLawDetailJson(rawJson);
  const db = openSmartLawSqliteDbWritable();
  const lawIdStored = normalizeLawIdForStorage(parsed.document.lawId);
  const now = new Date().toISOString();

  stmtRun(db, "BEGIN IMMEDIATE");
  try {
    const existingLaw = stmtGet<{ id: number }>(
      db,
      `SELECT id FROM laws WHERE law_id = ?`,
      [lawIdStored],
    );

    let lawPk: number;
    if (existingLaw?.id) {
      lawPk = existingLaw.id;
      stmtRun(
        db,
        `
        UPDATE laws SET
          law_key = ?, law_name_kr = ?, law_name_hanja = ?, law_name_short = ?,
          law_type_name = ?, law_type_code = ?, ministry_name = ?, ministry_code = ?,
          language = ?, raw_json = ?, updated_at = ?
        WHERE id = ?
        `,
        [
          parsed.document.lawKey,
          parsed.document.lawNameKr,
          parsed.document.lawNameHanja,
          parsed.document.lawNameShort,
          parsed.document.lawTypeName,
          parsed.document.lawTypeCode,
          parsed.document.ministryName,
          parsed.document.ministryCode,
          parsed.document.language,
          jsonText(parsed.document.rawJson),
          now,
          lawPk,
        ],
      );
    } else {
      const inserted = stmtRun(
        db,
        `
        INSERT INTO laws (
          law_id, law_key, law_name_kr, law_name_hanja, law_name_short,
          law_type_name, law_type_code, ministry_name, ministry_code,
          language, raw_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          lawIdStored,
          parsed.document.lawKey,
          parsed.document.lawNameKr,
          parsed.document.lawNameHanja,
          parsed.document.lawNameShort,
          parsed.document.lawTypeName,
          parsed.document.lawTypeCode,
          parsed.document.ministryName,
          parsed.document.ministryCode,
          parsed.document.language,
          jsonText(parsed.document.rawJson),
          now,
        ],
      );
      lawPk = getLastInsertRowId(inserted);
    }

    const versionKey = `${parsed.document.promulgationNo}-${parsed.document.promulgationDate}`;
    const existingByKey = stmtGet<{ id: number }>(
      db,
      `SELECT id FROM law_versions WHERE law_id = ? AND version_key = ?`,
      [lawPk, versionKey],
    );
    const currentVer = stmtGet<{ id: number }>(
      db,
      `SELECT id FROM law_versions WHERE law_id = ? AND is_current = 1`,
      [lawPk],
    );

    // INSERT: law_id + 필드들 + is_current + updated_at
    // UPDATE: is_current는 SQL 리터럴(=1)이라 바인드에 넣지 않음
    const versionRowFields = [
      versionKey,
      parsed.document.promulgationNo,
      toIsoDate(parsed.document.promulgationDate),
      toIsoDate(parsed.document.enforcementDate),
      parsed.document.revisionType,
      parsed.document.articleEffectiveText,
      parsed.document.promulgatedLawYn,
      parsed.document.contactPhone,
      parsed.document.contactDepartmentName,
      jsonText(parsed.document.rawJson),
    ];

    let lawVersionId: number;

    if (existingByKey?.id != null) {
      lawVersionId = existingByKey.id;
      demoteOtherCurrentVersions(db, lawPk, lawVersionId);
      stmtRun(
        db,
        `
        UPDATE law_versions SET
          version_key = ?, promulgation_no = ?, promulgation_date = ?,
          enforcement_date = ?, revision_type = ?, article_effective_text = ?,
          promulgated_law_yn = ?, contact_phone = ?, contact_department_name = ?,
          raw_json = ?, is_current = 1, updated_at = ?
        WHERE id = ?
        `,
        [...versionRowFields, now, lawVersionId],
      );
    } else if (currentVer?.id) {
      lawVersionId = currentVer.id;
      demoteOtherCurrentVersions(db, lawPk, lawVersionId);
      stmtRun(
        db,
        `
        UPDATE law_versions SET
          version_key = ?, promulgation_no = ?, promulgation_date = ?,
          enforcement_date = ?, revision_type = ?, article_effective_text = ?,
          promulgated_law_yn = ?, contact_phone = ?, contact_department_name = ?,
          raw_json = ?, is_current = 1, updated_at = ?
        WHERE id = ?
        `,
        [...versionRowFields, now, lawVersionId],
      );
    } else {
      stmtRun(db, `UPDATE law_versions SET is_current = 0 WHERE law_id = ?`, [
        lawPk,
      ]);
      const inserted = stmtRun(
        db,
        `
        INSERT INTO law_versions (
          law_id, version_key, promulgation_no, promulgation_date,
          enforcement_date, revision_type, article_effective_text,
          promulgated_law_yn, contact_phone, contact_department_name,
          raw_json, is_current, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [lawPk, ...versionRowFields, 1, now],
      );
      lawVersionId = getLastInsertRowId(inserted);
    }

    clearVersionChildren(db, lawVersionId);

    const articleKeyToStructureNodeId = insertLawStructureNodesForArticlesWith(
      (row) => insertStructureNodeSqlite(db, row),
      lawVersionId,
      parsed.articles,
    );

    const usedArticleNos = new Set<number>();

    for (const article of parsed.articles) {
      const articleNoStored = uniqueArticleNoForDb(
        article.articleNo,
        article.articleKey,
        article.articleOrder,
        usedArticleNos,
      );
      const structureNodeId =
        articleKeyToStructureNodeId.get(article.articleKey) ?? null;

      const insertedArticle = stmtRun(
        db,
        `
        INSERT INTO law_articles (
          law_version_id, structure_node_id, article_key, article_no,
          article_title, article_content, article_type, article_revision_type,
          article_effective_date, article_changed_yn, article_moved_from,
          article_moved_to, article_reference, display_order, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          lawVersionId,
          structureNodeId,
          article.articleKey,
          articleNoStored,
          article.articleTitle,
          article.articleContent,
          article.articleType,
          article.articleRevisionType,
          toIsoDate(article.articleEffectiveDate),
          article.articleChangedYn,
          article.articleMovedFrom,
          article.articleMovedTo,
          article.articleReference,
          article.articleOrder,
          jsonText(article.rawJson),
        ],
      );

      const articleId = getLastInsertRowId(insertedArticle);
      for (const item of article.items) {
        insertArticleItemTreeSqlite(db, articleId, item, null);
      }
    }

    stmtRun(db, "COMMIT");

    return {
      lawId: lawIdStored,
      lawVersionId,
      articleCount: parsed.articles.length,
      // SQLite DB에는 law_chunks 테이블 없음 — 벡터화 미사용
      chunkCount: 0,
    };
  } catch (error) {
    stmtRun(db, "ROLLBACK");
    throw error;
  }
}

export type LawSearchMeta = {
  target: string;
  keyword: string;
  section: string;
  totalCnt: number;
  page: number;
  numOfRows: number;
  resultCode: string;
  resultMsg: string;
  requestedUrl: string;
};

export type LawSearchListItem = {
  itemNo: number;
  lawSerialNo: string;
  historyStatusCode: string;
  lawNameKr: string;
  lawNameShort: string;
  lawId: string;
  promulgationDate: string;
  promulgationNo: string;
  revisionTypeName: string;
  ministryCode: string;
  ministryName: string;
  lawTypeName: string;
  enforcementDate: string;
  detailLink: string;
};

export function saveLawSearchToSqlite(input: {
  searchMeta: LawSearchMeta;
  items: LawSearchListItem[];
  rawXml: string;
}) {
  const db = openSmartLawSqliteDbWritable();
  const now = new Date().toISOString();

  stmtRun(db, "BEGIN IMMEDIATE");
  try {
    const history = stmtRun(
      db,
      `
      INSERT INTO law_search_histories (
        target, keyword, section, total_count, page, num_of_rows,
        result_code, result_message, requested_url, raw_xml, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.searchMeta.target,
        input.searchMeta.keyword,
        input.searchMeta.section,
        input.searchMeta.totalCnt,
        input.searchMeta.page,
        input.searchMeta.numOfRows,
        input.searchMeta.resultCode,
        input.searchMeta.resultMsg,
        input.searchMeta.requestedUrl,
        input.rawXml,
        now,
      ],
    );

    const historyId = getLastInsertRowId(history);

    for (const item of input.items) {
      stmtRun(
        db,
        `
        INSERT INTO law_search_items (
          search_history_id, item_no, law_serial_no, history_status_code,
          law_name_kr, law_name_short, law_id, promulgation_date, promulgation_no,
          revision_type_name, ministry_code, ministry_name, law_type_name,
          enforcement_date, detail_link
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          historyId,
          item.itemNo,
          item.lawSerialNo,
          item.historyStatusCode,
          item.lawNameKr,
          item.lawNameShort,
          normalizeLawIdForStorage(item.lawId),
          item.promulgationDate,
          item.promulgationNo,
          item.revisionTypeName,
          item.ministryCode,
          item.ministryName,
          item.lawTypeName,
          item.enforcementDate,
          item.detailLink,
        ],
      );
    }

    stmtRun(db, "COMMIT");
    return { searchHistoryId: historyId, savedCount: input.items.length };
  } catch (error) {
    stmtRun(db, "ROLLBACK");
    throw error;
  }
}
