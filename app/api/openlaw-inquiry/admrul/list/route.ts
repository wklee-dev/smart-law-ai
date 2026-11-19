import { NextResponse } from "next/server";
import { listOpenlawAdmrulList } from "@/app/lib/openlaw-sqlite-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, items: listOpenlawAdmrulList() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "행정규칙 목록 조회 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
