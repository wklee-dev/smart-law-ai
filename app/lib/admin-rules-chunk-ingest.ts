/**
 * Supabase admin_rule / raw_rule 본문 → admin_rule_chunks / raw_rule_chunks 적재
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminRulesConfigSource } from "@/app/lib/admin-rules-paths";
import {
  adminRulesHasRenderableContent,
  buildAdminRulesDocument,
  getSourceMetaFromDbByParam,
  isSafeRuleConfigParam,
  loadRuleConfigSources,
  openAdminRulesDb,
  resolveAdminRulesSourceFamily,
  type AdminRulesArticleRow,
  type AdminRulesDb,
  type AdminRulesDocumentOut,
} from "@/app/lib/admin-rules-server";
import {
  adminRulesVectorTables,
  type AdminRulesVectorFamily,
} from "@/app/lib/admin-rules-vector-tables";
import { embedAdminRulesChunkTextsByIds } from "@/app/lib/embed-admin-rules-chunks";
import { splitBodyIntoChunks } from "@/app/lib/hs-chunk-text";

export type AdminRulesChunkDef = {
  source_type: string;
  source_key: string;
  source_title: string;
  chunk_text: string;
  chunk_index: number;
  metadata: Record<string, unknown>;
};

export type AdminRulesVectorizeResult = {
  param: string;
  ruleName: string;
  sourceFamily: AdminRulesVectorFamily;
  tablePrefix: "admin_rule" | "raw_rule";
  chunksTable: "admin_rule_chunks" | "raw_rule_chunks";
  snapshotId: number;
  chunkCount: number;
  embeddedCount: number;
  deletedSnapshotCount: number;
};

const ARTICLE_HEADING_RE = /^제\d+조(?:의\d+)?(?:\([^)]+\))?/;
const EMBED_BATCH = 40;
const INSERT_BATCH = 80;

function articleHeading(article: AdminRulesArticleRow): string {
  const firstLine = article.article_content.trim().split(/\n/)[0]?.trim() ?? "";
  const fromContent = firstLine.match(ARTICLE_HEADING_RE);
  if (fromContent) return fromContent[0];
  if (article.article_title.trim()) return article.article_title.trim();
  return article.article_no.trim() || `조문-${article.id}`;
}

function baseMetadata(
  source: AdminRulesConfigSource,
  doc: AdminRulesDocumentOut,
  sourceFamily: AdminRulesVectorFamily,
  tablePrefix: "admin_rule" | "raw_rule",
): Record<string, unknown> {
  return {
    source: `supabase:${tablePrefix}`,
    admin_rules_param: source.param,
    source_family: sourceFamily,
    table_prefix: tablePrefix,
    table_name: source.table_name,
    seq_id: doc.seqId || null,
    rule_name_kr: doc.lawName || source.description,
    promulgation_no: doc.promulgationNo || null,
    promulgation_date: doc.promulgationDate || null,
  };
}

function pushChunks(
  rows: AdminRulesChunkDef[],
  baseMeta: Record<string, unknown>,
  sourceType: string,
  sourceKey: string,
  sourceTitle: string,
  body: string,
  startIndex: { value: number },
): void {
  const header = `[${String(baseMeta.rule_name_kr ?? "행정규칙")}] ${sourceTitle}`;
  const parts = splitBodyIntoChunks(body);
  for (let i = 0; i < parts.length; i += 1) {
    const suffix = parts.length > 1 ? ` (${i + 1}/${parts.length})` : "";
    rows.push({
      source_type: sourceType,
      source_key: parts.length > 1 ? `${sourceKey}#${i + 1}` : sourceKey,
      source_title: `${sourceTitle}${suffix}`.slice(0, 2000),
      chunk_text: `${header}\n---\n${parts[i]}`,
      chunk_index: startIndex.value++,
      metadata: { ...baseMeta },
    });
  }
}

export function buildAdminRulesChunksFromDocument(
  source: AdminRulesConfigSource,
  doc: AdminRulesDocumentOut,
  sourceFamily: AdminRulesVectorFamily,
): AdminRulesChunkDef[] {
  const tables = adminRulesVectorTables(sourceFamily);
  const baseMeta = baseMetadata(source, doc, sourceFamily, tables.prefix);
  const rows: AdminRulesChunkDef[] = [];
  const idx = { value: 0 };

  const metaLines = [
    doc.lawName && `규칙명: ${doc.lawName}`,
    doc.seqId && `seq_id: ${doc.seqId}`,
    doc.promulgationNo && `공포번호: ${doc.promulgationNo}`,
    doc.promulgationDate && `시행일: ${doc.promulgationDate}`,
    source.url && `URL: ${source.url}`,
  ].filter(Boolean);
  if (metaLines.length) {
    pushChunks(
      rows,
      baseMeta,
      "meta",
      "header",
      doc.lawName || source.description,
      metaLines.join("\n"),
      idx,
    );
  }

  const allArticles: AdminRulesArticleRow[] = [...doc.looseArticles];
  for (const ch of doc.chapters) {
    for (const a of ch.articles) allArticles.push(a);
  }

  for (const article of allArticles) {
    const content = article.article_content?.trim();
    if (!content) continue;
    const heading = articleHeading(article);
    const key = article.article_no.trim() || `id-${article.id}`;
    pushChunks(rows, baseMeta, "jo", key, heading, content, idx);
  }

  for (const group of doc.addendumGroups) {
    const body = group.rows
      .map((r) => {
        const no = r.article_no?.trim();
        const c = r.article_content?.trim();
        if (!c) return "";
        return no ? `${no}\n${c}` : c;
      })
      .filter(Boolean)
      .join("\n\n");
    if (!body) continue;
    const title = group.header.trim() || "부칙";
    pushChunks(rows, baseMeta, "byl", group.key || title, title, body, idx);
  }

  for (const ax of doc.annexes) {
    const body = ax.annexContent?.trim();
    if (!body) continue;
    const title = ax.title.trim() || `별표-${ax.id}`;
    pushChunks(rows, baseMeta, "schedule", ax.bylSeq || String(ax.id), title, body, idx);
  }

  return rows;
}

async function deleteExistingSnapshots(
  supabase: SupabaseClient,
  family: AdminRulesVectorFamily,
  param: string,
): Promise<number> {
  const { snapshots } = adminRulesVectorTables(family);
  const { data, error } = await supabase
    .from(snapshots)
    .select("id")
    .eq("param", param);
  if (error) throw error;
  const ids = (data ?? []).map((r) => r.id as number);
  if (ids.length === 0) return 0;
  const { error: delErr } = await supabase.from(snapshots).delete().in("id", ids);
  if (delErr) throw delErr;
  return ids.length;
}

async function embedChunksInBatches(
  supabase: SupabaseClient,
  family: AdminRulesVectorFamily,
  chunkIds: number[],
): Promise<number> {
  let total = 0;
  for (let i = 0; i < chunkIds.length; i += EMBED_BATCH) {
    const batch = chunkIds.slice(i, i + EMBED_BATCH);
    const r = await embedAdminRulesChunkTextsByIds(supabase, family, batch);
    total += r.embeddedCount;
  }
  return total;
}

export async function vectorizeAdminRulesSource(
  supabase: SupabaseClient,
  param: string,
  options?: {
    embed?: boolean;
    replace?: boolean;
    openDb?: () => Promise<AdminRulesDb>;
  },
): Promise<AdminRulesVectorizeResult> {
  if (!isSafeRuleConfigParam(param)) {
    throw new Error(`유효하지 않은 param: ${param}`);
  }

  const openDb = options?.openDb ?? openAdminRulesDb;
  const db = await openDb();
  try {
    const source = await getSourceMetaFromDbByParam(db, param);
    if (!source) {
      throw new Error(`rule_master에 없는 param: ${param}`);
    }
    if (!(await adminRulesHasRenderableContent(db, source))) {
      throw new Error(`「${source.description}」에 본문·부칙·별표 데이터가 없습니다.`);
    }

    const doc = await buildAdminRulesDocument(db, source);
    const sourceFamily = await resolveAdminRulesSourceFamily(db, source);
    const tables = adminRulesVectorTables(sourceFamily);

    const chunkDefs = buildAdminRulesChunksFromDocument(source, doc, sourceFamily);
    if (chunkDefs.length === 0) {
      throw new Error("벡터화할 청크가 없습니다.");
    }

    let deletedSnapshotCount = 0;
    if (options?.replace !== false) {
      deletedSnapshotCount = await deleteExistingSnapshots(
        supabase,
        sourceFamily,
        param,
      );
    }

    const serialId = doc.seqId.trim() || param;
    const { data: snap, error: snapErr } = await supabase
      .from(tables.snapshots)
      .insert({
        seq_id: serialId,
        param,
        rule_name_kr: doc.lawName || source.description,
        enforcement_date: doc.promulgationDate || null,
        promulgation_date: doc.promulgationDate || null,
        requested_url: source.url || null,
        raw_response: {
          source: `supabase:${tables.prefix}`,
          admin_rules_param: param,
          source_family: sourceFamily,
          table_prefix: tables.prefix,
          table_name: source.table_name,
          seq_id: doc.seqId || null,
          chunk_count: chunkDefs.length,
        },
      })
      .select("id")
      .single();
    if (snapErr) throw snapErr;

    const snapshotId = snap?.id as number;
    const chunkRows = chunkDefs.map((c) => ({
      [tables.snapshotFk]: snapshotId,
      source_type: c.source_type,
      source_key: c.source_key,
      source_title: c.source_title,
      chunk_text: c.chunk_text,
      chunk_index: c.chunk_index,
      metadata: c.metadata,
    }));

    const insertedIds: number[] = [];
    for (let i = 0; i < chunkRows.length; i += INSERT_BATCH) {
      const batch = chunkRows.slice(i, i + INSERT_BATCH);
      const { data: inserted, error: insErr } = await supabase
        .from(tables.chunks)
        .insert(batch)
        .select("id");
      if (insErr) throw insErr;
      for (const row of inserted ?? []) {
        if (row?.id != null) insertedIds.push(row.id as number);
      }
    }

    let embeddedCount = 0;
    if (options?.embed !== false && insertedIds.length > 0) {
      embeddedCount = await embedChunksInBatches(
        supabase,
        sourceFamily,
        insertedIds,
      );
    }

    return {
      param,
      ruleName: doc.lawName || source.description,
      sourceFamily,
      tablePrefix: tables.prefix,
      chunksTable: tables.chunks,
      snapshotId,
      chunkCount: insertedIds.length,
      embeddedCount,
      deletedSnapshotCount,
    };
  } finally {
    await db.close();
  }
}

export async function vectorizeAllAdminRulesSources(
  supabase: SupabaseClient,
  options?: {
    embed?: boolean;
    replace?: boolean;
    openDb?: () => Promise<AdminRulesDb>;
  },
): Promise<{
  results: AdminRulesVectorizeResult[];
  errors: { param: string; description: string; error: string }[];
}> {
  const openDb = options?.openDb ?? openAdminRulesDb;
  const db = await openDb();
  try {
    const all = await loadRuleConfigSources(db);
    const sources = [];
    for (const s of all) {
      if (await adminRulesHasRenderableContent(db, s)) sources.push(s);
    }
    const results: AdminRulesVectorizeResult[] = [];
    const errors: { param: string; description: string; error: string }[] = [];

    for (const source of sources) {
      try {
        const r = await vectorizeAdminRulesSource(supabase, source.param, options);
        results.push(r);
      } catch (e) {
        errors.push({
          param: source.param,
          description: source.description,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return { results, errors };
  } finally {
    await db.close();
  }
}
