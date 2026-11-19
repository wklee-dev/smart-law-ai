import { NextResponse } from "next/server";
import {
  CLIP_QUESTION_AREA_TABS,
  clipQuestionTabCounts,
  openClipQuestionDb,
  queryClipQuestions,
} from "@/app/lib/clip-question-server";
import type {
  ClipQuestionAreaTab,
  ClipQuestionQueryParams,
} from "@/app/lib/clip-question-server";

export const dynamic = "force-dynamic";

function parseTab(v: string | null): ClipQuestionQueryParams["areaTab"] {
  const t = (v ?? "").trim();
  if (t === "" || t === "ALL" || t === "전체") return "ALL";
  if ((CLIP_QUESTION_AREA_TABS as readonly string[]).includes(t)) {
    return t as ClipQuestionAreaTab;
  }
  return "ALL";
}

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const page = Math.max(1, Number(u.searchParams.get("page")) || 1);
    const pageSize = Number(u.searchParams.get("pageSize")) || 10;
    const areaTab = parseTab(u.searchParams.get("tab"));
    const gubun = u.searchParams.get("gubun") ?? "";
    const title = u.searchParams.get("title") ?? "";
    const sort = u.searchParams.get("sort") ?? undefined;
    const sort_dir = u.searchParams.get("dir") ?? undefined;

    const params: ClipQuestionQueryParams = {
      page,
      pageSize,
      areaTab,
      gubun,
      title,
      sort,
      sort_dir,
    };

    const db = openClipQuestionDb();
    try {
      const tabCounts = clipQuestionTabCounts(db);
      const { rows, total } = queryClipQuestions(db, params);
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
