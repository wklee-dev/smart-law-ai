import { NextRequest, NextResponse } from "next/server";
import { listOpenlawNwJo } from "@/app/lib/openlaw-sqlite-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const lawId = request.nextUrl.searchParams.get("lawId")?.trim() ?? "";
    const promulRaw = request.nextUrl.searchParams.get("promulDt");
    if (!lawId) {
      return NextResponse.json(
        { ok: false, error: "lawId 쿼리 파라미터가 필요합니다." },
        { status: 400 },
      );
    }
    const promulDt = promulRaw ? Number(promulRaw) : undefined;
    return NextResponse.json({
      ok: true,
      items: listOpenlawNwJo(
        lawId,
        Number.isFinite(promulDt) ? promulDt : undefined,
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "공포일 조문 조회 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
