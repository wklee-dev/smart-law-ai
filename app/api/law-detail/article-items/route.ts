import { NextRequest, NextResponse } from "next/server";
import { itemLevelToDisplay } from "@/app/lib/law-article-db";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

const PAGE_SIZE = 1000;

export async function GET(request: NextRequest) {
  try {
    const lawArticleId = Number(request.nextUrl.searchParams.get("lawArticleId"));

    if (!Number.isFinite(lawArticleId) || lawArticleId <= 0) {
      return NextResponse.json(
        { ok: false, error: "lawArticleId 쿼리 파라미터가 필요합니다." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const itemSelect = `
          id,
          law_article_id,
          item_level,
          parent_item_id,
          item_no,
          item_content,
          display_order,
          depth,
          raw_json
        `;

    type Row = Record<string, unknown>;
    const data: Row[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const res = await supabase
        .from("law_article_items")
        .select(itemSelect)
        .eq("law_article_id", lawArticleId)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (res.error) {
        throw res.error;
      }
      const chunk = (res.data ?? []) as Row[];
      data.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
    }

    const items = data.map((row) => ({
      ...row,
      item_level: itemLevelToDisplay(String(row.item_level ?? "")),
      item_order: row.display_order,
    }));

    return NextResponse.json({
      ok: true,
      items,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "항/호/목 목록 조회 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
