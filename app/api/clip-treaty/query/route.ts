import { NextResponse } from "next/server";
import {
  CLIP_TREATY_CATEGORY_TABS,
  clipTreatyTabCounts,
  openClipTreatyDb,
  queryClipTreaties,
  type ClipTreatyQueryParams,
  type ClipTreatyTabKey,
} from "@/app/lib/clip-treaty-server";

export const dynamic = "force-dynamic";

function parseTab(v: string | null): ClipTreatyTabKey {
  const t = (v ?? "").trim();
  if (t === "" || t === "ALL" || t === "전체") return "ALL";
  if ((CLIP_TREATY_CATEGORY_TABS as readonly string[]).includes(t)) {
    return t as ClipTreatyTabKey;
  }
  return "ALL";
}

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: ClipTreatyQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      tab: parseTab(u.searchParams.get("tab")),
      treatyName: u.searchParams.get("treatyName") ?? "",
      countryName: u.searchParams.get("countryName") ?? "",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = openClipTreatyDb();
    try {
      const tabCounts = clipTreatyTabCounts(db);
      const { rows, total } = queryClipTreaties(db, params);
      return NextResponse.json({
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
