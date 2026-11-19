import { NextResponse } from "next/server";
import {
  CLIP_ANNEX_TYPE_TABS,
  clipAnnexTabCounts,
  openClipAnnexDb,
  queryClipAnnexForms,
  type ClipAnnexQueryParams,
  type ClipAnnexTabKey,
} from "@/app/lib/clip-annex-server";

export const dynamic = "force-dynamic";

function parseTab(v: string | null): ClipAnnexTabKey {
  const t = (v ?? "").trim();
  if (t === "" || t === "ALL" || t === "전체") return "ALL";
  if ((CLIP_ANNEX_TYPE_TABS as readonly { code: string }[]).some((x) => x.code === t)) {
    return t as ClipAnnexTabKey;
  }
  return "ALL";
}

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: ClipAnnexQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      tab: parseTab(u.searchParams.get("tab")),
      lawName: u.searchParams.get("lawName") ?? "",
      formTitle: u.searchParams.get("formTitle") ?? "",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = openClipAnnexDb();
    try {
      const tabCounts = clipAnnexTabCounts(db);
      const { rows, total } = queryClipAnnexForms(db, params);
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
