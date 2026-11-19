import { NextResponse } from "next/server";
import {
  CLIP_PRECEDENT_TYPE_TABS,
  clipPrecedentTabCounts,
  openClipPrecedentDb,
  queryClipPrecedents,
} from "@/app/lib/clip-precedent-server";
import type {
  ClipPrecedentQueryParams,
  ClipPrecedentTypeTab,
} from "@/app/lib/clip-precedent-server";

export const dynamic = "force-dynamic";

function parseTab(v: string | null): ClipPrecedentQueryParams["trialTypeTab"] {
  const t = (v ?? "").trim();
  if (t === "" || t === "ALL" || t === "전체") return "ALL";
  if ((CLIP_PRECEDENT_TYPE_TABS as readonly string[]).includes(t)) {
    return t as ClipPrecedentTypeTab;
  }
  return "ALL";
}

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const page = Math.max(1, Number(u.searchParams.get("page")) || 1);
    const pageSize = Number(u.searchParams.get("pageSize")) || 10;
    const trialTypeTab = parseTab(u.searchParams.get("tab"));
    const case_no = u.searchParams.get("caseNo") ?? "";
    const title = u.searchParams.get("title") ?? "";
    const issue_class = u.searchParams.get("issueClass") ?? "";
    const agency = u.searchParams.get("agency") ?? "";
    const sort = u.searchParams.get("sort") ?? undefined;
    const sort_dir = u.searchParams.get("dir") ?? undefined;

    const params: ClipPrecedentQueryParams = {
      page,
      pageSize,
      trialTypeTab,
      case_no,
      title,
      issue_class,
      agency,
      sort,
      sort_dir,
    };

    const db = openClipPrecedentDb();
    try {
      const tabCounts = clipPrecedentTabCounts(db);
      const { rows, total } = queryClipPrecedents(db, params);
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
