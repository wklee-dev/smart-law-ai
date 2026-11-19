import { NextResponse } from "next/server";
import {
  CLIP_RULE_TYPE_TABS,
  clipAdminRuleTabCounts,
  openClipAdminRuleDb,
  queryClipAdminRules,
} from "@/app/lib/clip-admin-rule-server";
import type {
  ClipAdminRuleQueryParams,
  ClipRuleTypeTab,
} from "@/app/lib/clip-admin-rule-server";

export const dynamic = "force-dynamic";

function parseTab(v: string | null): ClipAdminRuleQueryParams["ruleTypeTab"] {
  const t = (v ?? "").trim();
  if (t === "" || t === "ALL" || t === "전체") return "ALL";
  if ((CLIP_RULE_TYPE_TABS as readonly string[]).includes(t)) return t as ClipRuleTypeTab;
  return "ALL";
}

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const page = Math.max(1, Number(u.searchParams.get("page")) || 1);
    const pageSize = Number(u.searchParams.get("pageSize")) || 10;
    const ruleTypeTab = parseTab(u.searchParams.get("tab"));
    const rule_name = u.searchParams.get("ruleName") ?? "";
    const dept_name = u.searchParams.get("dept") ?? "";
    const manager_name = u.searchParams.get("manager") ?? "";
    const include_abolished =
      u.searchParams.get("includeAbolished") === "1" ||
      u.searchParams.get("includeAbolished") === "true";
    const sort = u.searchParams.get("sort") ?? undefined;
    const sort_dir = u.searchParams.get("dir") ?? undefined;

    const params: ClipAdminRuleQueryParams = {
      page,
      pageSize,
      ruleTypeTab,
      rule_name,
      dept_name,
      manager_name,
      include_abolished,
      sort,
      sort_dir,
    };

    const db = openClipAdminRuleDb();
    try {
      const tabCounts = clipAdminRuleTabCounts(db);
      const { rows, total } = queryClipAdminRules(db, params);
      return NextResponse.json({
        tabCounts,
        rows,
        total,
        page: params.page,
        pageSize: Math.min(
          100,
          Math.max(5, Math.floor(params.pageSize)),
        ),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
