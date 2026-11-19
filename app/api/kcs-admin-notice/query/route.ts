import {
  openKcsAdminNoticeDb,
  queryKcsAdminNotices,
} from "@/app/lib/kcs-admin-notice-server";
import type { KcsAdminNoticeQueryParams } from "@/app/lib/kcs-admin-notice-shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: KcsAdminNoticeQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      title: u.searchParams.get("title") ?? "",
      keyword: u.searchParams.get("keyword") ?? "",
      searchField: u.searchParams.get("field") ?? "",
      writer: u.searchParams.get("writer") ?? "",
      dateFrom: u.searchParams.get("dateFrom") ?? "",
      dateTo: u.searchParams.get("dateTo") ?? "",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = openKcsAdminNoticeDb();
    try {
      const { rows, total } = queryKcsAdminNotices(db, params);
      return NextResponse.json({
        ok: true,
        rows,
        total,
        page: params.page,
        pageSize: Math.min(100, Math.max(5, Math.floor(params.pageSize))),
      });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
