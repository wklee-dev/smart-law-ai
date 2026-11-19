import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("law_search_items")
      .select(
        `
          id,
          search_history_id,
          item_no,
          law_serial_no,
          history_status_code,
          law_name_kr,
          law_name_short,
          law_id,
          promulgation_date,
          promulgation_no,
          revision_type_name,
          ministry_code,
          ministry_name,
          law_type_name,
          enforcement_date,
          detail_link,
          created_at
        `,
      )
      .order("id", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      ok: true,
      items: data ?? [],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "법령 목록 조회 중 오류가 발생했습니다.";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 },
    );
  }
}