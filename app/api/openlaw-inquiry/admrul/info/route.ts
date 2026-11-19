import { NextRequest, NextResponse } from "next/server";
import { listOpenlawAdmrulInfo } from "@/app/lib/openlaw-sqlite-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const seqRaw = request.nextUrl.searchParams.get("admrulSeq")?.trim() ?? "";
    const admrulSeq = Number(seqRaw);
    if (!Number.isFinite(admrulSeq) || admrulSeq <= 0) {
      return NextResponse.json(
        { ok: false, error: "admrulSeq 쿼리 파라미터가 필요합니다." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      items: listOpenlawAdmrulInfo(admrulSeq),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "행정규칙 본문 조회 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
