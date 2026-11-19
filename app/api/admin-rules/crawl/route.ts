import { NextRequest, NextResponse } from "next/server";
import { runAdminRulesCrawler } from "@/app/lib/admin-rules-crawler";
import {
  isSafeRuleConfigParam,
  openAdminRulesDb,
} from "@/app/lib/admin-rules-server";

export const runtime = "nodejs";
export const maxDuration = 600;

type Body = {
  param?: string;
  force?: boolean;
  noDownload?: boolean;
};

async function countParamRows(param: string): Promise<Record<string, number>> {
  const db = await openAdminRulesDb();
  try {
    const tables = [
      "admin_rule",
      "admin_rule_addendum",
      "admin_rule_annex",
      "admin_rule_attachment",
      "raw_rule",
      "raw_rule_addendum",
      "raw_rule_annex",
      "raw_rule_attachment",
    ] as const;
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const row = await db.get(
        `SELECT COUNT(*)::int AS c FROM "${t}" WHERE param = ?`,
        [param],
      );
      counts[t] = Number(row?.c ?? 0);
    }
    return counts;
  } finally {
    await db.close();
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const param = body.param?.trim() ?? "";
    if (!isSafeRuleConfigParam(param)) {
      return NextResponse.json(
        { ok: false, error: "크롤링할 param 이 필요합니다. (예: a~j)" },
        { status: 400 },
      );
    }

    const crawl = await runAdminRulesCrawler({
      param,
      force: body.force !== false,
      noDownload: body.noDownload === true,
    });

    if (crawl.exitCode !== 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `크롤러 종료 코드 ${crawl.exitCode}`,
          logTail: crawl.log.slice(-4000),
        },
        { status: 500 },
      );
    }

    const counts = await countParamRows(param);
    return NextResponse.json({
      ok: true,
      mode: "crawl_supabase",
      param,
      crawlExitCode: crawl.exitCode,
      sync: { counts },
      logTail: crawl.log.slice(-2000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("admin-rules/crawl:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
