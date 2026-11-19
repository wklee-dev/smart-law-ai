import { NextRequest, NextResponse } from "next/server";
import { listOpenlawOldnewInfo } from "@/app/lib/openlaw-sqlite-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const seqRaw = request.nextUrl.searchParams.get("admrulSeq")?.trim() ?? "";
    const enforceRaw = request.nextUrl.searchParams.get("enforceDt");
    const admrulSeq = Number(seqRaw);
    if (!Number.isFinite(admrulSeq) || admrulSeq <= 0) {
      return NextResponse.json(
        { ok: false, error: "admrulSeq 쿼리 파라미터가 필요합니다." },
        { status: 400 },
      );
    }
    const enforceDt = enforceRaw ? Number(enforceRaw) : undefined;
    return NextResponse.json({
      ok: true,
      items: listOpenlawOldnewInfo(
        admrulSeq,
        Number.isFinite(enforceDt) ? enforceDt : undefined,
      ),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "신구법 본문 조회 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
