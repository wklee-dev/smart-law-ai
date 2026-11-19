import {
  listKcsPressCategories,
  openKcsPressDb,
  queryKcsPress,
} from "@/app/lib/kcs-press-server";
import type { KcsPressQueryParams } from "@/app/lib/kcs-press-shared";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: KcsPressQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      keyword: u.searchParams.get("keyword") ?? "",
      searchField: u.searchParams.get("field") ?? "",
      category: u.searchParams.get("category") ?? "",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = await openKcsPressDb();
    try {
      const { rows, total } = await queryKcsPress(db, params);
      return NextResponse.json({
        ok: true,
        rows,
        total,
        categories: await listKcsPressCategories(db),
        page: params.page,
        pageSize: Math.min(100, Math.max(5, Math.floor(params.pageSize))),
      });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
