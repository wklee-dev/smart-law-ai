import {
  CLIP_LATEST_LAW_TYPE_TABS,
  clipLatestLawTabCounts,
  openClipLatestLawDb,
  queryClipLatestLaws,
  type ClipLatestLawTypeCode,
} from "@/app/lib/clip-latest-law-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseTab(raw: string | null): "" | "ALL" | ClipLatestLawTypeCode {
  const t = (raw ?? "").trim();
  if (!t || t === "ALL" || t === "전체") return "ALL";
  if ((CLIP_LATEST_LAW_TYPE_TABS as readonly { code: string }[]).some((x) => x.code === t)) {
    return t as ClipLatestLawTypeCode;
  }
  const byLabel = CLIP_LATEST_LAW_TYPE_TABS.find((x) => x.label === t);
  if (byLabel) return byLabel.code;
  return "ALL";
}

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      lawTypeTab: parseTab(u.searchParams.get("tab")),
      category: u.searchParams.get("category") ?? "",
      jurisdiction: u.searchParams.get("jurisdiction") ?? "",
      lawName: u.searchParams.get("lawName") ?? "",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = openClipLatestLawDb();
    try {
      const tabCounts = clipLatestLawTabCounts(db);
      const { rows, total } = queryClipLatestLaws(db, params);
      return NextResponse.json({
        ok: true,
        tabCounts,
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
