import { applySatelliteAnnexFlagsToSources } from "@/app/lib/admin-rules-annex-host-match";
import {
  getAdminRulesCrawlTargets,
  mergeAdminRulesSourcesWithCrawlTargets,
} from "@/app/lib/admin-rules-crawl-targets-server";
import {
  getAdminRulesSqliteDbLabel,
  openAdminRulesSqliteDb,
} from "@/app/lib/admin-rules-sqlite";
import { getCatalogEntryByParam } from "@/app/lib/admin-rules-table-catalog";
import {
  adminRulesHasRenderableContent,
  adminRulesSatelliteTablePresence,
  adminRulesUnifiedTableNames,
  getAdminRulesRuleConfigDiagnostics,
  loadRuleConfigSources,
  resolveAdminRulesSourceFamily,
} from "@/app/lib/admin-rules-server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const db = await openAdminRulesSqliteDb();
    try {
      const diagnostics = await getAdminRulesRuleConfigDiagnostics(db);
      const rows = await loadRuleConfigSources(db);
      const sources = [];
      for (const s of rows) {
        const catalog = getCatalogEntryByParam(s.param);
        const family = await resolveAdminRulesSourceFamily(db, s);
        const unified = adminRulesUnifiedTableNames(family);
        const table_presence = await adminRulesSatelliteTablePresence(db, s);
        sources.push({
          ...s,
          source_family: family,
          unified_main_table: unified.main,
          table_in_db: await adminRulesHasRenderableContent(db, s),
          table_presence,
          catalog_param: catalog?.param ?? null,
          catalog_description: catalog?.description ?? null,
          catalog_law_url: catalog?.law_go_kr_url ?? null,
        });
      }

      const crawlBundle = getAdminRulesCrawlTargets();
      const mergedSources = crawlBundle
        ? mergeAdminRulesSourcesWithCrawlTargets(sources, crawlBundle)
        : sources;
      await applySatelliteAnnexFlagsToSources(db, mergedSources);

      return NextResponse.json({
        ok: true,
        sources: mergedSources,
        db_path: getAdminRulesSqliteDbLabel(),
        diagnostics,
        crawl_targets: crawlBundle?.meta ?? null,
      });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DB 로드 실패";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
