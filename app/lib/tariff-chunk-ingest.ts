import type { DatabaseSync } from "node:sqlite";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  bodyFromEmbedOrFields,
  chapterFallbackBody,
  expandTariffRowToChunks,
  headingFallbackBody,
  itemFallbackBody,
  sectionFallbackBody,
  type TariffSourceLevel,
} from "@/app/lib/tariff-chunk-text";
import { normalizeTariffCountryCode, parseTariffYear } from "@/app/lib/tariff-country-code";
import {
  getTariffScheduleDb,
  getTariffScheduleDbPath,
} from "@/app/tariff/lib/tariff-schedule-db";
import {
  scheduleCountryPred,
  scheduleYearPred,
} from "@/app/tariff/lib/tariff-schedule-sql";

export type TariffIngestOptions = {
  year: number;
  countryCode: string;
  replace: boolean;
  /** section | chapter | heading | item — 미지정 시 전체 */
  levels?: TariffSourceLevel[];
  limit?: number;
};

export type TariffIngestResult = {
  scheduleDbPath: string;
  year: number;
  countryCode: string;
  deletedCount: number;
  insertedCount: number;
  skippedEmpty: number;
  rowsScanned: number;
  byLevel: Record<TariffSourceLevel, { scanned: number; inserted: number; skipped: number }>;
  warning?: string;
};

const INSERT_BATCH = 80;
const ALL_LEVELS: TariffSourceLevel[] = [
  "section",
  "chapter",
  "heading",
  "item",
];

function levelsToProcess(opts: TariffIngestOptions): TariffSourceLevel[] {
  const raw = opts.levels?.length ? opts.levels : ALL_LEVELS;
  return raw.filter((l) => ALL_LEVELS.includes(l));
}

type ChunkInsert = Record<string, unknown>;

function pushRowChunks(
  acc: ChunkInsert[],
  input: Parameters<typeof expandTariffRowToChunks>[0],
  counters: { inserted: number; skipped: number },
): void {
  const chunks = expandTariffRowToChunks(input);
  if (chunks.length === 0) {
    counters.skipped += 1;
    return;
  }
  for (const c of chunks) {
    acc.push({
      sqlite_id: input.sqliteId,
      record_uuid: input.recordUuid,
      year: input.year,
      country_code: input.countryCode,
      country_name: input.countryName,
      source_level: input.sourceLevel,
      source_key: input.sourceKey,
      source_title: input.sourceTitle,
      chunk_text: c.chunk_text,
      chunk_index: c.chunk_index,
      metadata: c.metadata,
    });
    counters.inserted += 1;
  }
}

export function loadTariffChunksFromSqlite(
  db: DatabaseSync,
  opts: TariffIngestOptions,
): {
  rows: ChunkInsert[];
  skippedEmpty: number;
  rowsScanned: number;
  byLevel: TariffIngestResult["byLevel"];
} {
  const year = parseTariffYear(opts.year);
  const countryCode = normalizeTariffCountryCode(opts.countryCode);
  const levels = levelsToProcess(opts);
  const limit = opts.limit != null && opts.limit > 0 ? opts.limit : undefined;

  const acc: ChunkInsert[] = [];
  const byLevel = Object.fromEntries(
    ALL_LEVELS.map((l) => [l, { scanned: 0, inserted: 0, skipped: 0 }]),
  ) as TariffIngestResult["byLevel"];

  let rowsScanned = 0;
  let skippedEmpty = 0;
  let remaining = limit;

  const yearSql = scheduleYearPred("t");
  const countrySql = scheduleCountryPred("t");

  if (levels.includes("section")) {
    const sql = `
      SELECT t.id, t.record_uuid, t.year, t.country_code, t.country_name,
             t.section_code, t.section_name, t.section_name_en, t.note_text, t.embed_text
      FROM tariff_section t
      WHERE ${yearSql} AND ${countrySql}
      ORDER BY CAST(t.section_code AS INTEGER)
      ${remaining != null ? "LIMIT ?" : ""}
    `;
    const params =
      remaining != null ? [year, countryCode, remaining] : [year, countryCode];
    const rows = db.prepare(sql).all(...params) as {
      id: number;
      record_uuid: string;
      year: number;
      country_code: string;
      country_name: string;
      section_code: string;
      section_name: string;
      section_name_en: string | null;
      note_text: string | null;
      embed_text: string | null;
    }[];
    for (const r of rows) {
      if (remaining != null && remaining <= 0) break;
      rowsScanned += 1;
      byLevel.section.scanned += 1;
      const body = bodyFromEmbedOrFields(r.embed_text, sectionFallbackBody(r));
      const before = acc.length;
      pushRowChunks(
        acc,
        {
          sqliteId: r.id,
          recordUuid: r.record_uuid,
          year,
          countryCode,
          countryName: r.country_name,
          sourceLevel: "section",
          sourceKey: r.section_code.trim(),
          sourceTitle: r.section_name.trim(),
          body,
          metadata: {
            record_uuid: r.record_uuid,
            section_code: r.section_code,
          },
        },
        byLevel.section,
      );
      if (acc.length === before) skippedEmpty += 1;
      if (remaining != null) remaining -= 1;
    }
  }

  if (levels.includes("chapter") && (remaining == null || remaining > 0)) {
    const sql = `
      SELECT t.id, t.record_uuid, t.year, t.country_code, t.country_name,
             t.section_code, t.chapter_code, t.chapter_name, t.chapter_name_en,
             t.note_text, t.embed_text
      FROM tariff_chapter t
      WHERE ${yearSql} AND ${countrySql}
      ORDER BY CAST(t.section_code AS INTEGER), CAST(t.chapter_code AS INTEGER)
      ${remaining != null ? "LIMIT ?" : ""}
    `;
    const params =
      remaining != null ? [year, countryCode, remaining] : [year, countryCode];
    const rows = db.prepare(sql).all(...params) as {
      id: number;
      record_uuid: string;
      country_name: string;
      section_code: string;
      chapter_code: string;
      chapter_name: string;
      chapter_name_en: string | null;
      note_text: string | null;
      embed_text: string | null;
    }[];
    for (const r of rows) {
      if (remaining != null && remaining <= 0) break;
      rowsScanned += 1;
      byLevel.chapter.scanned += 1;
      const body = bodyFromEmbedOrFields(r.embed_text, chapterFallbackBody(r));
      const before = acc.length;
      pushRowChunks(
        acc,
        {
          sqliteId: r.id,
          recordUuid: r.record_uuid,
          year,
          countryCode,
          countryName: r.country_name,
          sourceLevel: "chapter",
          sourceKey: r.chapter_code.trim(),
          sourceTitle: r.chapter_name.trim(),
          body,
          metadata: {
            record_uuid: r.record_uuid,
            section_code: r.section_code,
            chapter_code: r.chapter_code,
          },
        },
        byLevel.chapter,
      );
      if (acc.length === before) skippedEmpty += 1;
      if (remaining != null) remaining -= 1;
    }
  }

  if (levels.includes("heading") && (remaining == null || remaining > 0)) {
    const sql = `
      SELECT t.id, t.record_uuid, t.year, t.country_code, t.country_name,
             t.section_code, t.chapter_code, t.heading_code, t.heading_name,
             t.heading_name_en, t.note_text, t.embed_text
      FROM tariff_heading t
      WHERE ${yearSql} AND ${countrySql}
      ORDER BY CAST(t.heading_code AS INTEGER)
      ${remaining != null ? "LIMIT ?" : ""}
    `;
    const params =
      remaining != null ? [year, countryCode, remaining] : [year, countryCode];
    const rows = db.prepare(sql).all(...params) as {
      id: number;
      record_uuid: string;
      country_name: string;
      section_code: string;
      chapter_code: string;
      heading_code: string;
      heading_name: string;
      heading_name_en: string | null;
      note_text: string | null;
      embed_text: string | null;
    }[];
    for (const r of rows) {
      if (remaining != null && remaining <= 0) break;
      rowsScanned += 1;
      byLevel.heading.scanned += 1;
      const body = bodyFromEmbedOrFields(r.embed_text, headingFallbackBody(r));
      const before = acc.length;
      pushRowChunks(
        acc,
        {
          sqliteId: r.id,
          recordUuid: r.record_uuid,
          year,
          countryCode,
          countryName: r.country_name,
          sourceLevel: "heading",
          sourceKey: r.heading_code.trim(),
          sourceTitle: r.heading_name.trim(),
          body,
          metadata: {
            record_uuid: r.record_uuid,
            section_code: r.section_code,
            chapter_code: r.chapter_code,
            heading_code: r.heading_code,
          },
        },
        byLevel.heading,
      );
      if (acc.length === before) skippedEmpty += 1;
      if (remaining != null) remaining -= 1;
    }
  }

  if (levels.includes("item") && (remaining == null || remaining > 0)) {
    const sql = `
      SELECT t.id, t.record_uuid, t.year, t.country_code, t.country_name,
             t.section_code, t.chapter_code, t.heading_code, t.hs_code,
             t.item_name, t.item_name_en, t.unit,
             t.basic_rate, t.elastic_rate, t.fta_rate, t.temp_rate, t.special_rate,
             t.import_notice, t.embed_text
      FROM tariff_item t
      WHERE ${yearSql} AND ${countrySql}
      ORDER BY length(replace(trim(t.hs_code),' ','')),
               replace(trim(t.hs_code),' ','')
      ${remaining != null ? "LIMIT ?" : ""}
    `;
    const params =
      remaining != null ? [year, countryCode, remaining] : [year, countryCode];
    const rows = db.prepare(sql).all(...params) as {
      id: number;
      record_uuid: string;
      country_name: string;
      section_code: string;
      chapter_code: string;
      heading_code: string;
      hs_code: string;
      item_name: string;
      item_name_en: string | null;
      unit: string | null;
      basic_rate: string | null;
      elastic_rate: string | null;
      fta_rate: string | null;
      temp_rate: string | null;
      special_rate: string | null;
      import_notice: string | null;
      embed_text: string | null;
    }[];
    for (const r of rows) {
      if (remaining != null && remaining <= 0) break;
      rowsScanned += 1;
      byLevel.item.scanned += 1;
      const body = bodyFromEmbedOrFields(r.embed_text, itemFallbackBody(r));
      const before = acc.length;
      pushRowChunks(
        acc,
        {
          sqliteId: r.id,
          recordUuid: r.record_uuid,
          year,
          countryCode,
          countryName: r.country_name,
          sourceLevel: "item",
          sourceKey: r.hs_code.trim(),
          sourceTitle: r.item_name.trim(),
          body,
          metadata: {
            record_uuid: r.record_uuid,
            section_code: r.section_code,
            chapter_code: r.chapter_code,
            heading_code: r.heading_code,
            hs_code: r.hs_code,
          },
        },
        byLevel.item,
      );
      if (acc.length === before) skippedEmpty += 1;
      if (remaining != null) remaining -= 1;
    }
  }

  const insertedTotal = Object.values(byLevel).reduce((s, x) => s + x.inserted, 0);
  return {
    rows: acc,
    skippedEmpty,
    rowsScanned,
    byLevel,
  };
}

export async function ingestTariffChunksToSupabase(
  supabase: SupabaseClient,
  opts: TariffIngestOptions,
): Promise<TariffIngestResult> {
  const year = parseTariffYear(opts.year);
  const countryCode = normalizeTariffCountryCode(opts.countryCode);
  const db = getTariffScheduleDb();
  const { rows, skippedEmpty, rowsScanned, byLevel } = loadTariffChunksFromSqlite(
    db,
    { ...opts, year, countryCode },
  );

  let deletedCount = 0;
  if (opts.replace) {
    const { error: delErr, count } = await supabase
      .from("tariff_chunks")
      .delete({ count: "exact" })
      .eq("year", year)
      .eq("country_code", countryCode);
    if (delErr) throw delErr;
    deletedCount = count ?? 0;
  }

  let insertedCount = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await supabase.from("tariff_chunks").insert(batch);
    if (error) throw error;
    insertedCount += batch.length;
  }

  let warning: string | undefined;
  if (insertedCount === 0) {
    warning =
      `적재된 청크가 없습니다. year=${year} country=${countryCode}. ` +
      `SQLite 스캔 ${rowsScanned}건, 본문 없음 ${skippedEmpty}건. ` +
      `DB: ${getTariffScheduleDbPath()}`;
  }

  return {
    scheduleDbPath: getTariffScheduleDbPath(),
    year,
    countryCode,
    deletedCount,
    insertedCount,
    skippedEmpty,
    rowsScanned,
    byLevel,
    warning,
  };
}
