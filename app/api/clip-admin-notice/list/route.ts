import {
  listClipAdminNotices,
  openClipAdminNoticeDb,
} from "@/app/lib/clip-admin-notice-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const db = openClipAdminNoticeDb();
    try {
      const result = listClipAdminNotices(db, {
        keyword: u.searchParams.get("keyword") ?? "",
        page: Number(u.searchParams.get("page") ?? "1"),
        pageSize: Number(u.searchParams.get("pageSize") ?? "10"),
      });
      return NextResponse.json({ ...result, ok: true });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
