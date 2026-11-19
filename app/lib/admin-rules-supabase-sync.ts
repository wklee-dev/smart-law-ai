/**
 * AdminRulesDb(본문 DB) → Supabase admin_rule* / rule_master / crawl_meta 동기화
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSafeRuleConfigParam,
  openAdminRulesDb,
  tableExists,
  type AdminRulesDb,
} from "@/app/lib/admin-rules-server";

const INSERT_BATCH = 100;

const CONTENT_TABLES = [
  "admin_rule",
  "admin_rule_addendum",
  "admin_rule_annex",
  "admin_rule_attachment",
  "raw_rule",
  "raw_rule_addendum",
  "raw_rule_annex",
  "raw_rule_attachment",
] as const;

type ContentTable = (typeof CONTENT_TABLES)[number];

export type AdminRulesSyncResult = {
  param: string;
  ruleMasterUpserted: boolean;
  crawlMetaUpserted: boolean;
  counts: Record<string, number>;
};

function str(v: unknown): string | null {
  if (v == null) return null;
  const t = String(v);
  return t.length ? t : null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function stmtAll(
  db: AdminRulesDb,
  sql: string,
  params: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  return (await db.all(sql, params)) ?? [];
}

async function stmtGet(
  db: AdminRulesDb,
  sql: string,
  params: unknown[] = [],
): Promise<Record<string, unknown> | undefined> {
  return await db.get(sql, params);
}

async function deleteParamRows(
  supabase: SupabaseClient,
  table: string,
  param: string,
): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("param", param);
  if (error) throw error;
}

async function insertBatches(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<number> {
  if (rows.length === 0) return 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw error;
  }
  return rows.length;
}

function mapMainRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    sqlite_id: num(r.id),
    gubun: str(r.gubun),
    param: str(r.param),
    seq_id: str(r.seq_id),
    law_name: str(r.law_name),
    promulgation_no: str(r.promulgation_no),
    promulgation_dt: str(r.promulgation_dt),
    section_type: str(r.section_type),
    article_no: str(r.article_no),
    article_title: str(r.article_title),
    article_content: str(r.article_content),
    created_at: str(r.created_at),
  };
}

function mapAddendumRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    sqlite_id: num(r.id),
    gubun: str(r.gubun),
    param: str(r.param),
    seq_id: str(r.seq_id),
    law_name: str(r.law_name),
    ar_seq: str(r.ar_seq),
    addendum_no: str(r.addendum_no),
    addendum_date: str(r.addendum_date),
    article_no: str(r.article_no),
    article_content: str(r.article_content),
    created_at: str(r.created_at),
  };
}

function mapAnnexRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    sqlite_id: num(r.id),
    gubun: str(r.gubun),
    param: str(r.param),
    seq_id: str(r.seq_id),
    law_name: str(r.law_name),
    byl_seq: str(r.byl_seq),
    annex_title: str(r.annex_title),
    annex_content: str(r.annex_content),
    han_fl_seq: str(r.han_fl_seq),
    pdf_fl_seq: str(r.pdf_fl_seq),
    image_fl_seqs: str(r.image_fl_seqs),
    created_at: str(r.created_at),
  };
}

function mapAttachmentRow(r: Record<string, unknown>): Record<string, unknown> {
  return {
    sqlite_id: num(r.id),
    gubun: str(r.gubun),
    param: str(r.param),
    seq_id: str(r.seq_id),
    law_name: str(r.law_name),
    fl_seq: str(r.fl_seq),
    file_name: str(r.file_name),
    file_type: str(r.file_type),
    local_path: str(r.local_path),
    download_url: str(r.download_url),
    downloaded: num(r.downloaded) ?? 0,
    created_at: str(r.created_at),
  };
}

async function loadMappedRows(
  db: AdminRulesDb,
  table: ContentTable,
  param: string,
): Promise<Record<string, unknown>[]> {
  if (!(await tableExists(db, table))) return [];
  const rows = await stmtAll(
    db,
    `SELECT * FROM "${table}" WHERE param = ? ORDER BY id`,
    [param],
  );
  if (table.endsWith("_addendum")) return rows.map(mapAddendumRow);
  if (table.endsWith("_annex")) return rows.map(mapAnnexRow);
  if (table.endsWith("_attachment")) return rows.map(mapAttachmentRow);
  return rows.map(mapMainRow);
}

export async function syncAdminRulesParamToSupabase(
  supabase: SupabaseClient,
  param: string,
): Promise<AdminRulesSyncResult> {
  if (!isSafeRuleConfigParam(param)) {
    throw new Error(`유효하지 않은 param: ${param}`);
  }

  const db = await openAdminRulesDb();
  try {
    const counts: Record<string, number> = {};

    // rule_master upsert
    let ruleMasterUpserted = false;
    if (await tableExists(db, "rule_master")) {
      const master = await stmtGet(
        db,
        `SELECT * FROM rule_master WHERE param = ? LIMIT 1`,
        [param],
      );
      if (master) {
        const row = {
          param,
          gubun: str(master.gubun),
          description: str(master.description),
          note: str(master.note),
          reference: str(master.reference),
          url: str(master.url),
          url_type: str(master.url_type),
          no_body: num(master.no_body) ?? 0,
          seq_id: str(master.seq_id),
          updated_at: str(master.updated_at) ?? new Date().toISOString(),
        };
        const { error } = await supabase.from("rule_master").upsert(row, {
          onConflict: "param",
        });
        if (error) throw error;
        ruleMasterUpserted = true;
      }
    }

    // crawl_meta upsert
    let crawlMetaUpserted = false;
    if (await tableExists(db, "crawl_meta")) {
      const meta = await stmtGet(
        db,
        `SELECT * FROM crawl_meta WHERE param = ? LIMIT 1`,
        [param],
      );
      if (meta) {
        const row = {
          param,
          gubun: str(meta.gubun),
          description: str(meta.description),
          url: str(meta.url),
          seq_id: str(meta.seq_id),
          crawled_at: str(meta.crawled_at),
          status: str(meta.status),
        };
        const { error } = await supabase.from("crawl_meta").upsert(row, {
          onConflict: "param",
        });
        if (error) throw error;
        crawlMetaUpserted = true;
      }
    }

    for (const table of CONTENT_TABLES) {
      if (!(await tableExists(db, table))) {
        counts[table] = 0;
        continue;
      }
      await deleteParamRows(supabase, table, param);
      const mapped = (await loadMappedRows(db, table, param)).filter(
        (r) => r.param,
      );
      counts[table] = await insertBatches(supabase, table, mapped);
    }

    return {
      param,
      ruleMasterUpserted,
      crawlMetaUpserted,
      counts,
    };
  } finally {
    await db.close();
  }
}

export async function syncAllAdminRulesToSupabase(
  supabase: SupabaseClient,
): Promise<{
  results: AdminRulesSyncResult[];
  errors: { param: string; error: string }[];
}> {
  const db = await openAdminRulesDb();
  let params: string[] = [];
  try {
    if (await tableExists(db, "rule_master")) {
      params = (await stmtAll(
        db,
        `SELECT param FROM rule_master ORDER BY param`,
      ))
        .map((r) => String(r.param ?? "").trim())
        .filter((p) => isSafeRuleConfigParam(p));
    }
  } finally {
    await db.close();
  }

  const results: AdminRulesSyncResult[] = [];
  const errors: { param: string; error: string }[] = [];
  for (const param of params) {
    try {
      results.push(await syncAdminRulesParamToSupabase(supabase, param));
    } catch (e) {
      errors.push({
        param,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { results, errors };
}
