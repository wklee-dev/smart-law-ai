import { NextRequest, NextResponse } from "next/server";
import { listOpenlawEfydJo } from "@/app/lib/openlaw-sqlite-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const lawId = request.nextUrl.searchParams.get("lawId")?.trim() ?? "";
    const enforceRaw = request.nextUrl.searchParams.get("enforceDt");
    if (!lawId) {
      return NextResponse.json(
        { ok: false, error: "lawId 쿼리 파라미터가 필요합니다." },
        { status: 400 },
      );
    }
    const enforceDt = enforceRaw ? Number(enforceRaw) : undefined;
    const items = listOpenlawEfydJo(
      lawId,
      Number.isFinite(enforceDt) ? enforceDt : undefined,
    );
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "시행일 조문 조회 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
