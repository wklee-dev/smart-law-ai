import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { itemLevelToDisplay } from "@/app/lib/law-article-db";
import {
  mapVersionAndLawToDocument,
  resolveArticleNoForDisplay,
  type LawRowForList,
  type LawVersionRowForList,
} from "@/app/lib/law-supabase-helpers";
import {
  adaptRowidSql,
  openSmartLawDb,
  smartLawTableColumns,
  smartLawTableExists,
  type SmartLawDb,
} from "@/app/lib/smart-law-db";
import { getSmartLawSqliteDbPath } from "@/app/lib/smart-law-sqlite-paths";

function parseJsonColumn(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const t = value.trim();
  if (!t) return null;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return value;
  }
}

function q(db: SmartLawDb, sql: string): string {
  return adaptRowidSql(sql, db.dialect);
}

/** 저장/동기화용 — SQLite 전용 동기 핸들 (Postgres 모드에서는 사용 금지) */
export function openSmartLawSqliteDb(readOnly = true): DatabaseSync {
  const p = path.resolve(getSmartLawSqliteDbPath().trim());
  if (!fs.existsSync(p)) {
    throw new Error(`법령 SQLite DB 파일이 없습니다: ${p}`);
  }
  return new DatabaseSync(p, { readOnly });
}

export function openSmartLawSqliteDbWritable(): DatabaseSync {
  return openSmartLawSqliteDb(false);
}

export async function listCurrentLawDocumentsFromSqlite() {
  const db = await openSmartLawDb(true);
  try {
    const rows = await db.all(
      q(
        db,
        `
    SELECT
      v.id,
      v.law_id,
      v.version_key,
      v.promulgation_no,
      v.promulgation_date,
      v.enforcement_date,
      v.revision_type,
      v.article_effective_text,
      v.promulgated_law_yn,
      v.contact_phone,
      v.contact_department_name,
      v.is_current,
      v.raw_json,
      v.updated_at,
      l.id AS laws_id,
      l.law_id AS laws_law_id,
      l.law_key,
      l.law_name_kr,
      l.law_name_short,
      l.law_name_hanja,
      l.ministry_name,
      l.ministry_code
    FROM law_versions v
    INNER JOIN laws l ON l.id = v.law_id
    WHERE v.is_current = 1
      AND v.id IS NOT NULL
    ORDER BY v.id DESC
    `,
      ),
    );

    return rows.map((row) => {
      const law: LawRowForList = {
        id: Number(row.laws_id),
        law_id: String(row.laws_law_id ?? ""),
        law_key: (row.law_key as string | null) ?? null,
        law_name_kr: String(row.law_name_kr ?? ""),
        law_name_short: (row.law_name_short as string | null) ?? null,
        law_name_hanja: (row.law_name_hanja as string | null) ?? null,
        ministry_name: (row.ministry_name as string | null) ?? null,
        ministry_code: (row.ministry_code as string | null) ?? null,
      };

      const version: LawVersionRowForList = {
        id: Number(row.id),
        law_id: row.law_id as number | string,
        version_key: (row.version_key as string | null) ?? null,
        promulgation_no: (row.promulgation_no as string | null) ?? null,
        promulgation_date: (row.promulgation_date as string | null) ?? null,
        enforcement_date: (row.enforcement_date as string | null) ?? null,
        revision_type: (row.revision_type as string | null) ?? null,
        article_effective_text:
          (row.article_effective_text as string | null) ?? null,
        promulgated_law_yn: (row.promulgated_law_yn as string | null) ?? null,
        contact_phone: (row.contact_phone as string | null) ?? null,
        contact_department_name:
          (row.contact_department_name as string | null) ?? null,
        is_current: Boolean(row.is_current),
        raw_json: parseJsonColumn(row.raw_json),
        updated_at: (row.updated_at as string | null) ?? null,
      };

      return mapVersionAndLawToDocument(version, law);
    });
  } finally {
    await db.close();
  }
}

export async function listLawArticlesFromSqlite(lawVersionId: number) {
  const db = await openSmartLawDb(true);
  try {
    const rows = await db.all(
      q(
        db,
        `
    SELECT
      COALESCE(id, rowid) AS id,
      law_version_id,
      structure_node_id,
      article_key,
      article_no,
      article_title,
      article_content,
      article_type,
      article_revision_type,
      article_effective_date,
      display_order,
      raw_json
    FROM law_articles
    WHERE law_version_id = ?
    ORDER BY display_order ASC, rowid ASC
    `,
      ),
      [lawVersionId],
    );

    return rows.map((row) => {
      const rawJson = parseJsonColumn(row.raw_json);
      return {
        ...row,
        article_no: resolveArticleNoForDisplay(row.article_no, rawJson),
        law_document_id: row.law_version_id,
        article_order: row.display_order,
        raw_json: rawJson,
      };
    });
  } finally {
    await db.close();
  }
}

export async function listLawArticleItemsByVersionFromSqlite(
  lawVersionId: number,
) {
  const db = await openSmartLawDb(true);
  try {
    const articleIds = (
      await db.all(
        q(
          db,
          `
    SELECT COALESCE(id, rowid) AS id
    FROM law_articles
    WHERE law_version_id = ?
    ORDER BY display_order ASC, rowid ASC
    `,
        ),
        [lawVersionId],
      )
    ).map((r) => Number(r.id));

    if (articleIds.length === 0) {
      return [];
    }

    const placeholders = articleIds.map(() => "?").join(", ");
    const rows = await db.all(
      q(
        db,
        `
    SELECT
      COALESCE(id, rowid) AS id,
      law_article_id,
      item_level,
      parent_item_id,
      item_no,
      item_content,
      display_order,
      depth,
      raw_json
    FROM law_article_items
    WHERE law_article_id IN (${placeholders})
    ORDER BY display_order ASC, rowid ASC
    `,
      ),
      articleIds,
    );

    return rows.map((row) => ({
      ...row,
      item_level: itemLevelToDisplay(String(row.item_level ?? "")),
      item_order: row.display_order,
      raw_json: parseJsonColumn(row.raw_json),
    }));
  } finally {
    await db.close();
  }
}

/** 수집된 행정규칙 스냅샷 → 일반법령조회 목록용 */
export async function listAdmrulDocumentsFromSqlite() {
  const db = await openSmartLawDb(true);
  try {
    if (!(await smartLawTableExists(db, "admrul_snapshots"))) return [];

    const cols = await smartLawTableColumns(db, "admrul_snapshots");
    const hasTs = cols.has("adm_serial_id") && cols.has("raw_response");

    const rows = hasTs
      ? await db.all(
          q(
            db,
            `
        SELECT
          COALESCE(id, rowid) AS id,
          adm_serial_id,
          adm_lid,
          rule_name_kr,
          ministry_name,
          enforcement_date,
          promulgation_date,
          raw_response,
          created_at
        FROM admrul_snapshots
        WHERE COALESCE(TRIM(rule_name_kr), '') != ''
        ORDER BY COALESCE(id, rowid) DESC
        `,
          ),
        )
      : await db.all(
          q(
            db,
            `
        SELECT
          COALESCE(id, rowid) AS id,
          admrul_id AS adm_lid,
          admrul_id AS adm_serial_id,
          admrul_name AS rule_name_kr,
          org_name AS ministry_name,
          enf_date AS enforcement_date,
          prom_date AS promulgation_date,
          raw_json AS raw_response,
          created_at
        FROM admrul_snapshots
        WHERE COALESCE(TRIM(admrul_name), '') != ''
        ORDER BY COALESCE(id, rowid) DESC
        `,
          ),
        );

    const linkMap = new Map<string, string>();
    if (await smartLawTableExists(db, "law_admrul_links")) {
      for (const link of await db.all(
        `SELECT law_id, adm_serial_id FROM law_admrul_links`,
      )) {
        const serial = String(link.adm_serial_id ?? "").trim();
        if (serial && !linkMap.has(serial)) {
          linkMap.set(serial, String(link.law_id ?? "").trim());
        }
      }
    }

    return rows.map((row) => {
      const serial = String(row.adm_serial_id ?? "").trim();
      const name = String(row.rule_name_kr ?? "").trim();
      return {
        id: Number(row.id),
        doc_kind: "admrul" as const,
        selection_key: `admrul:${Number(row.id)}`,
        law_pk: Number(row.id),
        law_id: serial,
        law_key: String(row.adm_lid ?? "") || null,
        law_name_kr: name,
        law_name_short: name,
        law_name_hanja: "",
        ministry_name: String(row.ministry_name ?? "") || null,
        ministry_code: null,
        promulgation_no: "",
        promulgation_date: String(row.promulgation_date ?? "") || null,
        enforcement_date: String(row.enforcement_date ?? "") || null,
        revision_type: "행정규칙",
        contact_phone: "",
        updated_at: String(row.created_at ?? "") || null,
        raw_json: parseJsonColumn(row.raw_response),
        related_law_id: linkMap.get(serial) || null,
      };
    });
  } finally {
    await db.close();
  }
}

export async function listLawAnnexesFromSqlite(lawVersionId: number) {
  const db = await openSmartLawDb(true);
  try {
    if (!(await smartLawTableExists(db, "law_annexes"))) return [];

    return (
      await db.all(
        q(
          db,
          `
    SELECT
      COALESCE(id, rowid) AS id,
      law_version_id,
      annex_no,
      annex_sub_no,
      annex_type,
      annex_title,
      enf_date,
      file_link,
      local_path,
      content,
      raw_json
    FROM law_annexes
    WHERE law_version_id = ?
    ORDER BY rowid ASC
    `,
        ),
        [lawVersionId],
      )
    ).map((row) => ({
      ...row,
      raw_json: parseJsonColumn(row.raw_json),
    }));
  } finally {
    await db.close();
  }
}

export async function listRelatedAdmrulLinksFromSqlite(lawId: string) {
  const db = await openSmartLawDb(true);
  try {
    const normalized = lawId.trim();
    if (!normalized || !(await smartLawTableExists(db, "law_admrul_links"))) {
      return [];
    }

    return (
      await db.all(
        q(
          db,
          `
    SELECT
      l.law_id,
      l.adm_serial_id,
      l.adm_lid,
      l.rule_name_kr,
      l.source_query,
      COALESCE(s.id, s.rowid) AS snapshot_id
    FROM law_admrul_links l
    LEFT JOIN admrul_snapshots s
      ON TRIM(s.adm_serial_id) = TRIM(l.adm_serial_id)
    WHERE TRIM(l.law_id) = TRIM(?)
       OR LTRIM(TRIM(l.law_id), '0') = LTRIM(TRIM(?), '0')
    ORDER BY COALESCE(l.id, l.rowid) ASC
    `,
        ),
        [normalized, normalized],
      )
    ).map((row) => ({
      law_id: String(row.law_id ?? ""),
      adm_serial_id: String(row.adm_serial_id ?? ""),
      adm_lid: String(row.adm_lid ?? ""),
      rule_name_kr: String(row.rule_name_kr ?? ""),
      source_query: String(row.source_query ?? ""),
      snapshot_id: row.snapshot_id != null ? Number(row.snapshot_id) : null,
      selection_key:
        row.snapshot_id != null
          ? `admrul:${Number(row.snapshot_id)}`
          : null,
    }));
  } finally {
    await db.close();
  }
}

function flattenAdmrulText(node: unknown, out: string[]): void {
  if (node == null) return;
  if (typeof node === "string") {
    const t = node.trim();
    if (t) out.push(t);
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) flattenAdmrulText(x, out);
  }
}

/** 행정규칙 스냅샷 → 조문형 목록 (일반법령조회 본문 패널용) */
export async function listAdmrulArticlesFromSqlite(snapshotId: number) {
  const db = await openSmartLawDb(true);
  try {
    if (!(await smartLawTableExists(db, "admrul_snapshots"))) return [];

    const cols = await smartLawTableColumns(db, "admrul_snapshots");
    const rows = cols.has("raw_response")
      ? await db.all(
          q(
            db,
            `SELECT COALESCE(id, rowid) AS id, rule_name_kr, raw_response FROM admrul_snapshots WHERE COALESCE(id, rowid) = ?`,
          ),
          [snapshotId],
        )
      : await db.all(
          q(
            db,
            `SELECT COALESCE(id, rowid) AS id, admrul_name AS rule_name_kr, raw_json AS raw_response FROM admrul_snapshots WHERE COALESCE(id, rowid) = ?`,
          ),
          [snapshotId],
        );
    const row = rows[0];
    if (!row) return [];

    const parsed = parseJsonColumn(row.raw_response);
    if (!parsed || typeof parsed !== "object") return [];
    const rootObj = parsed as Record<string, unknown>;
    const svc =
      (rootObj.AdmRulService as Record<string, unknown> | undefined) ||
      (rootObj["행정규칙"] as Record<string, unknown> | undefined) ||
      rootObj;

    const articles: Array<{
      id: number;
      law_document_id: number;
      article_no: string;
      article_title: string;
      article_content: string;
      article_type: string;
      article_revision_type: string;
      article_effective_date: string;
      article_order: number;
      raw_json: unknown;
    }> = [];
    let order = 0;
    const push = (no: string, title: string, content: string, raw: unknown) => {
      const text = content.trim();
      if (!text && !title) return;
      order += 1;
      articles.push({
        id: order,
        law_document_id: snapshotId,
        article_no: no,
        article_title: title,
        article_content: text,
        article_type: "행정규칙",
        article_revision_type: "",
        article_effective_date: "",
        article_order: order,
        raw_json: raw,
      });
    };

    const jo = svc["조문"];
    if (jo && typeof jo === "object") {
      const j = jo as Record<string, unknown>;
      const units = j["조문단위"];
      const list = Array.isArray(units)
        ? units
        : units && typeof units === "object"
          ? [units]
          : [j];
      for (const unit of list) {
        if (!unit || typeof unit !== "object") continue;
        const u = unit as Record<string, unknown>;
        push(
          String(u["조문번호"] ?? "조문"),
          String(u["조문제목"] ?? ""),
          String(u["조문내용"] ?? ""),
          u,
        );
      }
    }

    const byl = svc["부칙"];
    if (byl && typeof byl === "object") {
      const blocks: string[] = [];
      flattenAdmrulText((byl as Record<string, unknown>)["부칙내용"], blocks);
      if (blocks.length) push("부칙", "부칙", blocks.join("\n\n"), byl);
    }

    const pyegae = svc["별표"];
    if (pyegae && typeof pyegae === "object") {
      const unitsRaw = (pyegae as Record<string, unknown>)["별표단위"];
      const units = Array.isArray(unitsRaw)
        ? unitsRaw
        : unitsRaw && typeof unitsRaw === "object"
          ? [unitsRaw]
          : [];
      for (let i = 0; i < units.length; i += 1) {
        const u = units[i] as Record<string, unknown>;
        if (!u || typeof u !== "object") continue;
        const blocks: string[] = [];
        flattenAdmrulText(u["별표내용"], blocks);
        const file = String(u["별표서식파일링크"] ?? "").trim();
        const body = [blocks.join("\n").trim(), file ? `파일: ${file}` : ""]
          .filter(Boolean)
          .join("\n");
        push(
          String(u["별표번호"] ?? i + 1),
          String(u["별표제목"] ?? `별표 ${i + 1}`),
          body,
          u,
        );
      }
    }

    const attach = svc["첨부파일"];
    if (attach && typeof attach === "object") {
      const list = Array.isArray(attach) ? attach : [attach];
      for (let i = 0; i < list.length; i += 1) {
        const a = list[i] as Record<string, unknown>;
        if (!a || typeof a !== "object") continue;
        const name = String(a["첨부파일명"] ?? "").trim();
        const link = String(a["첨부파일링크"] ?? "").trim();
        if (!name && !link) continue;
        push("첨부", name || `첨부파일 ${i + 1}`, link, a);
      }
    }

    if (articles.length === 0) {
      push("본문", String(row.rule_name_kr ?? "행정규칙"), "", parsed);
    }
    return articles;
  } finally {
    await db.close();
  }
}

export async function listAdmrulAnnexesFromSqlite(admSerialId: string) {
  const db = await openSmartLawDb(true);
  try {
    if (!(await smartLawTableExists(db, "admrul_annexes"))) return [];
    const serial = admSerialId.trim();
    if (!serial) return [];

    return (
      await db.all(
        q(
          db,
          `
    SELECT
      COALESCE(id, rowid) AS id,
      admrul_id,
      annex_no,
      annex_sub_no,
      annex_type,
      annex_title,
      enf_date,
      file_link,
      local_path,
      content,
      raw_json
    FROM admrul_annexes
    WHERE TRIM(admrul_id) = TRIM(?)
    ORDER BY rowid ASC
    `,
        ),
        [serial],
      )
    ).map((row) => ({
      ...row,
      raw_json: parseJsonColumn(row.raw_json),
    }));
  } finally {
    await db.close();
  }
}
