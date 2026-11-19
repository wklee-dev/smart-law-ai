import { listYcpPosts, openYcpDb } from "@/app/lib/yestrade-cp-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const page = Number(u.searchParams.get("page") ?? "1");
    const pageSize = Number(u.searchParams.get("pageSize") ?? "10");
    const keyword = u.searchParams.get("keyword") ?? "";
    const db = openYcpDb();
    try {
      const { rows, total } = listYcpPosts(db, { page, pageSize, keyword });
      return NextResponse.json({ ok: true, rows, total });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
