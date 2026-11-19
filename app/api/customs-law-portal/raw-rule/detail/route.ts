import { NextResponse } from "next/server";
import { getRawRuleDetail } from "@/app/lib/raw-rule-server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lawId = searchParams.get("lawId")?.trim();
    if (!lawId) {
      return NextResponse.json(
        { ok: false, error: "lawId 파라미터가 필요합니다." },
        { status: 400 },
      );
    }

    const detail = getRawRuleDetail(lawId);
    if (!detail) {
      return NextResponse.json(
        { ok: false, error: "해당 법령을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, detail });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "법령 본문 조회 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
