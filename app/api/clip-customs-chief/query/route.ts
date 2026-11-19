import { NextResponse } from "next/server";
import {
  countClipCustomsChiefItems,
  openClipCustomsChiefDb,
  queryClipCustomsChiefItems,
  type ClipCustomsChiefQueryParams,
} from "@/app/lib/clip-customs-chief-server";
import type { ClipCustomsChiefImexFilter } from "@/app/lib/clip-customs-chief-shared";

export const dynamic = "force-dynamic";

function parseImex(v: string | null): ClipCustomsChiefImexFilter {
  const t = (v ?? "").trim().toUpperCase();
  if (t === "E" || t === "EXPORT" || t === "수출") return "E";
  if (t === "I" || t === "IMPORT" || t === "수입") return "I";
  return "";
}

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: ClipCustomsChiefQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      hsCode: u.searchParams.get("hsCode") ?? "",
      requirementDoc: u.searchParams.get("requirementDoc") ?? "",
      relatedLaw: u.searchParams.get("relatedLaw") ?? "",
      imex: parseImex(u.searchParams.get("imex")),
      includeHistory: u.searchParams.get("includeHistory") === "1",
      sort: u.searchParams.get("sort") ?? undefined,
      sort_dir: u.searchParams.get("dir") ?? undefined,
    };

    const db = openClipCustomsChiefDb();
    try {
      const { rows, total } = queryClipCustomsChiefItems(db, params);
      const dbTotal = countClipCustomsChiefItems(db);
      return NextResponse.json({
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
