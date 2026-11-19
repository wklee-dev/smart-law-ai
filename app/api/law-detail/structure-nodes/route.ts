import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

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

    const { data, error } = await supabase
      .from("law_structure_nodes")
      .select(
        "id, law_version_id, parent_id, node_type, node_no, node_title, full_title, article_no, article_key, display_order, depth, raw_json, created_at",
      )
      .eq("law_version_id", lawVersionId)
      .order("display_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      nodes: data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "law_structure_nodes 조회 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
