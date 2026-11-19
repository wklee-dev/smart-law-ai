import { NextResponse } from "next/server";
import { listOpenlawOldnewList } from "@/app/lib/openlaw-sqlite-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, items: listOpenlawOldnewList() });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "신구법 목록 조회 오류";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
