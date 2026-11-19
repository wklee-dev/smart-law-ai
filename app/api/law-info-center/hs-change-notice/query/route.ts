import {
  openLlcHsChangeNoticeDb,
  queryLlcHsChangeNotice,
} from "@/app/lib/llc-hs-change-notice-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const db = openLlcHsChangeNoticeDb();
    try {
      const result = queryLlcHsChangeNotice(db, {
        noticeNo: u.searchParams.get("noticeNo") ?? "",
        hsCode: u.searchParams.get("hsCode") ?? "",
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
