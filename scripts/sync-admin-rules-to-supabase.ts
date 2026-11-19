/**
 * One-shot: SQLite admin_rules.db → Supabase sync
 * Usage: node --env-file=.env.local --import tsx scripts/sync-admin-rules-to-supabase.ts
 */
async function main() {
  const { getSupabaseAdmin } = await import("../app/lib/supabase/admin");
  const { syncAllAdminRulesToSupabase } = await import(
    "../app/lib/admin-rules-supabase-sync"
  );
  const supabase = getSupabaseAdmin();
  const { results, errors } = await syncAllAdminRulesToSupabase(supabase);
  console.log(
    JSON.stringify(
      {
        processed: results.length,
        errors,
        totals: results.reduce(
          (acc, r) => {
            for (const [k, v] of Object.entries(r.counts)) {
              acc[k] = (acc[k] ?? 0) + v;
            }
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
