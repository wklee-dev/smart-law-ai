import { NextResponse } from "next/server";
import {
  openClipWorldHsClassificationCasesDb,
  queryClipWorldHsClassificationCases,
  type ClipWorldHsClassificationCaseQueryParams,
  worldHsClassificationCasesTableReady,
} from "@/app/lib/clip-world-hs-classification-cases-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: ClipWorldHsClassificationCaseQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      registeredFrom: u.searchParams.get("registeredFrom") ?? "",
      registeredTo: u.searchParams.get("registeredTo") ?? "",
      country: u.searchParams.get("country") ?? "",
      effectivePeriod: u.searchParams.get("effectivePeriod") ?? "",
      keyword: u.searchParams.get("keyword") ?? "",
      keywordField: u.searchParams.get("keywordField") ?? "title",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = openClipWorldHsClassificationCasesDb();
    try {
      const ready = worldHsClassificationCasesTableReady(db);
      const { rows, total } = queryClipWorldHsClassificationCases(db, params);
      return NextResponse.json({
        ok: true,
        ready,
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
