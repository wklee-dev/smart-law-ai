import { NextResponse } from "next/server";
import {
  buildClipGeneralLawTree,
  getClipGeneralLawTreeStats,
} from "@/app/lib/clip-general-law-tree-server";
import {
  buildRawRuleTree,
  buildRawRuleTreeAll,
  getRawRuleCategoryStats,
  getRawRuleCategoryStatsAll,
} from "@/app/lib/raw-rule-server";
import {
  parseGeneralLawPortalCategory,
  portalCategoryToRawGubun,
} from "@/app/shared/general-law-portal-categories";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryParam = searchParams.get("category")?.trim();
    const gubun = searchParams.get("gubun")?.trim() ?? "";

    // 일반법령 포털: smart_law_ai.db + 엑셀 허용 목록만
    if (categoryParam != null && categoryParam !== "") {
      const slug = parseGeneralLawPortalCategory(categoryParam);
      const built = buildClipGeneralLawTree(slug);
      const stats = getClipGeneralLawTreeStats(slug);
      return NextResponse.json({
        ok: true,
        category: slug,
        gubun: portalCategoryToRawGubun(slug),
        catalogMode: true,
        source: "smart_law_ai.db",
        tree: built.tree,
        missing: built.missing,
        alternateDbs: built.alternateDbs,
        smartDbPath: built.smartDbPath,
        smartDbExists: built.smartDbExists,
        stats,
      });
    }

    // (레거시) gubun 직접 조회 — 일반법령 UI는 category 사용
    const all =
      !gubun || gubun === "__all__" || gubun.toLowerCase() === "all";

    if (all) {
      const tree = buildRawRuleTreeAll();
      const stats = getRawRuleCategoryStatsAll();
      return NextResponse.json({ ok: true, gubun: null, tree, stats });
    }

    const tree = buildRawRuleTree(gubun);
    const stats = getRawRuleCategoryStats(gubun);
    return NextResponse.json({ ok: true, gubun, tree, stats });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "법령 트리 조회 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
