import { getAdminRulesDbLabel } from "@/app/lib/admin-rules-pg";
import { getCatalogEntryByParam } from "@/app/lib/admin-rules-table-catalog";
import {
  adminRulesHasRenderableContent,
  adminRulesSatelliteTablePresence,
  adminRulesUnifiedTableNames,
  getAdminRulesRuleConfigDiagnostics,
  loadRuleConfigSources,
  openAdminRulesDb,
  resolveAdminRulesSourceFamily,
} from "@/app/lib/admin-rules-server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const db = await openAdminRulesDb();
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
      return NextResponse.json({
        ok: true,
        sources,
        db_path: getAdminRulesDbLabel(),
        diagnostics,
      });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DB 로드 실패";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
