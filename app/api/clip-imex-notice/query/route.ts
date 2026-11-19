import { NextResponse } from "next/server";
import {
  countClipImexNoticeItems,
  openClipImexNoticeDb,
  queryClipImexNoticeItems,
  type ClipImexNoticeQueryParams,
} from "@/app/lib/clip-imex-notice-server";
import type { ClipImexNoticeTypeFilter } from "@/app/lib/clip-imex-notice-shared";

export const dynamic = "force-dynamic";

function parseImexType(v: string | null): ClipImexNoticeTypeFilter {
  const t = (v ?? "").trim();
  if (t === "01" || t === "02" || t === "03") return t;
  return "";
}

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const noticeKey = (u.searchParams.get("noticeKey") ?? "").trim();
    if (!noticeKey) {
      return NextResponse.json(
        { ok: false, error: "noticeKey가 필요합니다." },
        { status: 400 },
      );
    }
    const params: ClipImexNoticeQueryParams = {
      noticeKey,
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      hsCode: u.searchParams.get("hsCode") ?? "",
      keyword: u.searchParams.get("keyword") ?? "",
      imexType: parseImexType(u.searchParams.get("imexType")),
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = openClipImexNoticeDb();
    try {
      const { rows, total } = queryClipImexNoticeItems(db, params);
      const dbTotal = countClipImexNoticeItems(db);
      return NextResponse.json({
        ok: true,
        rows,
        total,
        dbTotal,
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
