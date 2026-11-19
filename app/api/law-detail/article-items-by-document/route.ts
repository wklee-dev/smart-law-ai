import { NextRequest, NextResponse } from "next/server";
import { itemLevelToDisplay } from "@/app/lib/law-article-db";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

/** PostgREST 기본 최대 행 수(1000)를 넘는 법령에서 조문 일부만 잘리지 않도록 페이지로 모두 조회 */
const PAGE_SIZE = 1000;

function parseLawVersionId(request: NextRequest): number | null {
  const u = request.nextUrl;
  const v =
    u.searchParams.get("lawVersionId") ?? u.searchParams.get("lawDocumentId");
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(request: NextRequest) {
  try {
    const lawVersionId = parseLawVersionId(request);

    if (!lawVersionId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "lawVersionId(또는 하위 호환 lawDocumentId) 쿼리 파라미터가 필요합니다.",
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    /** `/articles`와 동일한 정렬·범위로 전부 가져와야 `in (id…)`가 조문 목록과 일치한다 */
    const articleIds: number[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: articleRows, error: articleError } = await supabase
        .from("law_articles")
        .select("id")
        .eq("law_version_id", lawVersionId)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (articleError) {
        throw articleError;
      }
      const chunk = articleRows ?? [];
      for (const row of chunk) {
        articleIds.push(row.id as number);
      }
      if (chunk.length < PAGE_SIZE) break;
    }

    if (articleIds.length === 0) {
      return NextResponse.json({
        ok: true,
        items: [],
      });
    }

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

    type ItemRow = {
      id: number;
      law_article_id: number;
      item_level: string | null;
      parent_item_id: number | null;
      item_no: string;
      item_content: string;
      display_order: number | null;
      depth: number | null;
      raw_json: unknown;
    };

    const data: ItemRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error: pageError } = await supabase
        .from("law_article_items")
        .select(itemSelect)
        .in("law_article_id", articleIds)
        .order("display_order", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (pageError) {
        throw pageError;
      }
      const chunk = (page ?? []) as ItemRow[];
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
