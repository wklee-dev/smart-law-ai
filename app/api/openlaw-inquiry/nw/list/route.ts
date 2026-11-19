import { NextRequest, NextResponse } from "next/server";
import { listOpenlawNwList } from "@/app/lib/openlaw-sqlite-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const lawId = request.nextUrl.searchParams.get("lawId")?.trim() ?? "";
    if (!lawId) {
      return NextResponse.json(
        { ok: false, error: "lawId 쿼리 파라미터가 필요합니다." },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, items: listOpenlawNwList(lawId) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "공포일 목록 조회 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
