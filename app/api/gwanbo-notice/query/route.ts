import {
  openGwanboDb,
  queryGwanboNotices,
} from "@/app/lib/gwanbo-notice-server";
import type { GwanboQueryParams } from "@/app/lib/gwanbo-notice-shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: GwanboQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      keyword: u.searchParams.get("keyword") ?? "",
      field: u.searchParams.get("field") ?? "",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = await openGwanboDb();
    try {
      const { rows, total } = await queryGwanboNotices(db, params);
      return NextResponse.json({ ok: true, rows, total, page: params.page });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
