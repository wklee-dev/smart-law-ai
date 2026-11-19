import { NextResponse } from "next/server";
import { listOpenlawApiStatus } from "@/app/lib/openlawapi-server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const items = listOpenlawApiStatus();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error("openlawapi/status 오류:", error);
    const message =
      error instanceof Error
        ? error.message
        : "openlawapi 상태 조회 중 오류가 발생했습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
