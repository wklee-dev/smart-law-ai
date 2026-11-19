import { NextResponse } from "next/server";
import {
  TT_CASE_DECISION_TABS,
  openTtCaseDb,
  queryTtCases,
  ttCaseTabCounts,
  type TtCaseQueryParams,
} from "@/app/lib/tt-case-server";
import type { TtCaseDecisionTab } from "@/app/lib/tt-case-shared";

export const dynamic = "force-dynamic";

function parseTab(v: string | null): TtCaseQueryParams["decisionTab"] {
  const t = (v ?? "").trim();
  if (t === "" || t === "ALL" || t === "전체") return "ALL";
  if ((TT_CASE_DECISION_TABS as readonly string[]).includes(t)) {
    return t as TtCaseDecisionTab;
  }
  return "ALL";
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: TtCaseQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      decisionTab: parseTab(u.searchParams.get("tab")),
      claimNo: u.searchParams.get("claimNo") ?? "",
      title: u.searchParams.get("title") ?? "",
      keyword: u.searchParams.get("keyword") ?? "",
      relatedLaw: u.searchParams.get("relatedLaw") ?? "",
      dateFrom: u.searchParams.get("dateFrom") ?? "",
      dateTo: u.searchParams.get("dateTo") ?? "",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = await openTtCaseDb();
    try {
      const tabCounts = await ttCaseTabCounts(db);
      const { rows, total } = await queryTtCases(db, params);
      return NextResponse.json({
        tabCounts,
        rows,
        total,
        page: params.page,
        pageSize: Math.min(100, Math.max(5, Math.floor(params.pageSize))),
      });
    } finally {
      await db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
