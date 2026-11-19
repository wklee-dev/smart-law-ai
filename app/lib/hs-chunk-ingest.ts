import type { DatabaseSync } from "node:sqlite";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTariffDb } from "@/app/tariff/lib/tariff-db";
import {
  buildFullChunkText,
  contentTypeForUnitTpcd,
  divisionFromMeta,
  sourceTypeForUnitTpcd,
  splitBodyIntoChunks,
  type HsManualMetaRow,
} from "@/app/lib/hs-chunk-text";

export type HsIngestOptions = {
  aplyYear: string;
  /** KR | WCO — KR 시 한국 출처만 */
  division: "KR" | "WCO";
  langCode: string;
  replace: boolean;
  /** 테스트용 상한 (미지정이면 전체) */
  limit?: number;
};

export type HsIngestResult = {
  deletedCount: number;
  insertedCount: number;
  skippedEmpty: number;
  metaMatched: number;
  aplyYear: string;
  division: string;
  langCode: string;
  /** insertedCount=0 일 때 SQLite 에서 확인한 해당 연도 출처 목록 */
  originsInYear?: { name: string | null; tpcd: string | null; count: number }[];
  warning?: string;
};

const INSERT_BATCH = 80;

function pickBodyText(
  rows: { content_type: string; lang_code: string; content_text: string | null }[],
  contentType: string,
  langCode: string,
): string {
  const r = rows.find(
    (x) => x.content_type === contentType && x.lang_code === langCode,
  );
  return (r?.content_text ?? "").trim();
}

function krMetaWhereClause(): string {
  return `(m.manl_orgn_tpcd_nm LIKE '%한국%' OR m.manl_orgn_tpcd = 'KR')`;
}

function wcoMetaWhereClause(): string {
  return `m.manl_orgn_tpcd_nm = 'WCO'`;
}

export function countHsMetaForIngest(
  db: DatabaseSync,
  opts: Pick<HsIngestOptions, "aplyYear" | "division" | "limit">,
): number {
  const orgSql = opts.division === "KR" ? krMetaWhereClause() : wcoMetaWhereClause();
  const metaSql = `
    SELECT COUNT(*) AS c FROM hs_manual_meta m
    WHERE m.aply_year = ? AND ${orgSql}
  `;
  const row = db.prepare(metaSql).get(opts.aplyYear) as { c: number };
  return row?.c ?? 0;
}

export function listOriginsForYear(
  db: DatabaseSync,
  aplyYear: string,
): { name: string | null; tpcd: string | null; count: number }[] {
  return db
    .prepare(
      `SELECT manl_orgn_tpcd_nm AS name, manl_orgn_tpcd AS tpcd, COUNT(*) AS count
       FROM hs_manual_meta WHERE aply_year = ?
       GROUP BY 1, 2 ORDER BY count DESC`,
    )
    .all(aplyYear) as { name: string | null; tpcd: string | null; count: number }[];
}

export function loadHsChunksFromSqlite(
  db: DatabaseSync,
  opts: HsIngestOptions,
): {
  rows: Record<string, unknown>[];
  skippedEmpty: number;
  metaMatched: number;
} {
  const { aplyYear, division, langCode, limit } = opts;
  const orgSql = division === "KR" ? krMetaWhereClause() : wcoMetaWhereClause();

  const metaSql = `
    SELECT
      m.id,
      m.aply_year,
      m.manl_orgn_tpcd,
      m.manl_orgn_tpcd_nm,
      m.manl_ut_tpcd,
      m.manl_ut_tpcd_nm,
      m.manl_ut_sgn,
      m.display_title
    FROM hs_manual_meta m
    WHERE m.aply_year = ?
      AND ${orgSql}
    ORDER BY m.manl_ut_tpcd ASC, LENGTH(m.manl_ut_sgn), m.manl_ut_sgn ASC
    ${limit != null && limit > 0 ? "LIMIT ?" : ""}
  `;

  const metaParams =
    limit != null && limit > 0 ? [aplyYear, limit] : [aplyYear];
  const metas = db.prepare(metaSql).all(...metaParams) as HsManualMetaRow[];
  const metaMatched = metas.length;

  const contentStmt = db.prepare(
    `SELECT meta_id, content_type, lang_code, content_text
     FROM hs_manual_content
     WHERE meta_id = ?`,
  );

  const out: Record<string, unknown>[] = [];
  let skippedEmpty = 0;

  for (const meta of metas) {
    const div = divisionFromMeta(meta);
    if (div !== division) continue;

    const contentType = contentTypeForUnitTpcd(meta.manl_ut_tpcd);
    const allContent = contentStmt.all(meta.id) as {
      meta_id: number;
      content_type: string;
      lang_code: string;
      content_text: string | null;
    }[];
    const body = pickBodyText(allContent, contentType, langCode);
    if (!body) {
      skippedEmpty += 1;
      continue;
    }

    const sourceType = sourceTypeForUnitTpcd(meta.manl_ut_tpcd);
    const sourceKey = meta.manl_ut_sgn.trim();
    const sourceTitle =
      (meta.display_title ?? "").trim().split(/\r?\n/)[0]?.slice(0, 300) ||
      `${meta.manl_ut_tpcd_nm ?? ""} ${sourceKey}`.trim();

    const bodyParts = splitBodyIntoChunks(body);
    for (let chunkIndex = 0; chunkIndex < bodyParts.length; chunkIndex += 1) {
      const chunkText = buildFullChunkText(
        meta,
        bodyParts[chunkIndex] ?? "",
        division,
        langCode,
      );
      if (!chunkText.trim()) continue;

      out.push({
        hs_meta_id: meta.id,
        aply_year: meta.aply_year,
        division,
        source_type: sourceType,
        source_key: sourceKey,
        source_title: sourceTitle,
        lang_code: langCode,
        chunk_text: chunkText,
        chunk_index: chunkIndex,
        metadata: {
          hs_meta_id: meta.id,
          aply_year: meta.aply_year,
          division,
          lang_code: langCode,
          content_type: contentType,
          manl_ut_tpcd: meta.manl_ut_tpcd,
          manl_ut_tpcd_nm: meta.manl_ut_tpcd_nm,
          manl_ut_sgn: sourceKey,
          manl_orgn_tpcd: meta.manl_orgn_tpcd,
          manl_orgn_tpcd_nm: meta.manl_orgn_tpcd_nm,
          chunk_part: bodyParts.length > 1 ? chunkIndex + 1 : null,
          chunk_parts: bodyParts.length > 1 ? bodyParts.length : null,
        },
      });
    }
  }

  return { rows: out, skippedEmpty, metaMatched };
}

export async function ingestHsChunksToSupabase(
  supabase: SupabaseClient,
  opts: HsIngestOptions,
): Promise<HsIngestResult> {
  const db = getTariffDb();
  const { rows, skippedEmpty, metaMatched } = loadHsChunksFromSqlite(db, opts);
  const originsInYear =
    rows.length === 0 ? listOriginsForYear(db, opts.aplyYear) : undefined;

  let deletedCount = 0;
  if (opts.replace) {
    const { error: delErr, count } = await supabase
      .from("hs_chunks")
      .delete({ count: "exact" })
      .eq("aply_year", opts.aplyYear)
      .eq("division", opts.division)
      .eq("lang_code", opts.langCode);
    if (delErr) throw delErr;
    deletedCount = count ?? 0;
  }

  let insertedCount = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await supabase.from("hs_chunks").insert(batch);
    if (error) throw error;
    insertedCount += batch.length;
  }

  let warning: string | undefined;
  if (insertedCount === 0) {
    if (metaMatched === 0) {
      const originHint =
        originsInYear?.map((o) => `${o.name ?? "?"}(${o.tpcd ?? "?"})×${o.count}`).join(", ") ??
        "(없음)";
      warning =
        `적재된 청크가 없습니다. ${opts.aplyYear}년·division=${opts.division} 메타 0건. ` +
        `해당 연도 SQLite 출처: ${originHint}. ` +
        `현재 DB( hs_manual_complete.db )는 WCO만 있을 수 있습니다 — division을 WCO로 하거나 한국 해설 DB를 확인하세요.`;
    } else if (skippedEmpty === metaMatched) {
      warning =
        `메타 ${metaMatched}건은 있으나 lang=${opts.langCode} 본문이 모두 비었습니다.`;
    }
  }

  return {
    deletedCount,
    insertedCount,
    skippedEmpty,
    metaMatched,
    aplyYear: opts.aplyYear,
    division: opts.division,
    langCode: opts.langCode,
    originsInYear,
    warning,
  };
}
