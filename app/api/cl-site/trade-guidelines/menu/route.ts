import { listCielMenus } from "@/app/lib/ciel-db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { dbPath, items } = listCielMenus();
    return NextResponse.json({ ok: true, dbPath, items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "메뉴 조회 실패";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
