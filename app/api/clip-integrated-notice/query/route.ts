import { NextResponse } from "next/server";
import {
  countClipIntegratedNoticeItems,
  openClipIntegratedNoticeDb,
  queryClipIntegratedNoticeItems,
  type ClipIntegratedNoticeQueryParams,
} from "@/app/lib/clip-integrated-notice-server";
import type { ClipIntegratedNoticeDirectionFilter } from "@/app/lib/clip-integrated-notice-shared";

export const dynamic = "force-dynamic";

function parseDirection(v: string | null): ClipIntegratedNoticeDirectionFilter {
  const t = (v ?? "").trim();
  if (t === "11" || t === "12") return t;
  return "";
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const issueCode = (u.searchParams.get("issueCode") ?? "").trim();
    if (!issueCode) {
      return NextResponse.json(
        { ok: false, error: "issueCode가 필요합니다." },
        { status: 400 },
      );
    }
    const params: ClipIntegratedNoticeQueryParams = {
      issueCode,
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      hsCode: u.searchParams.get("hsCode") ?? "",
      keyword: u.searchParams.get("keyword") ?? "",
      direction: parseDirection(u.searchParams.get("direction")),
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = openClipIntegratedNoticeDb();
    try {
      const { rows, total } = await queryClipIntegratedNoticeItems(db, params);
      const dbTotal = countClipIntegratedNoticeItems(db);
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
