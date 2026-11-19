import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabase/admin";
import { normalizeLawIdForStorage } from "@/app/shared/law-id";

/**
 * GET ?lawId=001556&limit=50
 * law_eflaw_josub_snapshots + laws 법령명
 */
export async function GET(request: NextRequest) {
  try {
    const lawIdRaw = request.nextUrl.searchParams.get("lawId")?.trim() ?? "";
    const lawId = lawIdRaw ? normalizeLawIdForStorage(lawIdRaw) : "";
    const limit = Math.min(
      200,
      Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? "50") || 50),
    );

    const supabase = getSupabaseAdmin();

    let q = supabase
      .from("law_eflaw_josub_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (lawId) {
      q = q.eq("law_id_text", lawId);
    }

    const { data, error } = await q;

    if (error) {
      if (
        error.message?.includes("law_eflaw_josub_snapshots") ||
        error.code === "42P01"
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "law_eflaw_josub_snapshots 테이블이 없습니다. sql/law_eflaw_josub.sql 을 Supabase에서 실행하세요.",
          },
          { status: 500 },
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("law-eflaw-josub/list:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
