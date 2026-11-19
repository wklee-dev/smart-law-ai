import { NextResponse } from "next/server";
import {
  openClipStandardProductCodeDb,
  queryClipStandardProductCodes,
  type ClipStandardProductCodeQueryParams,
} from "@/app/lib/clip-standard-product-code-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: ClipStandardProductCodeQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      hsCode: u.searchParams.get("hsCode") ?? "",
      itemName: u.searchParams.get("itemName") ?? "",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = openClipStandardProductCodeDb();
    try {
      const { rows, total } = queryClipStandardProductCodes(db, params);
      return NextResponse.json({
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
