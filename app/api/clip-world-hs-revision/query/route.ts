import { NextResponse } from "next/server";
import {
  openClipWorldHsRevisionDb,
  queryClipWorldHsRevisions,
  type ClipWorldHsRevisionQueryParams,
  worldHsRevisionTableReady,
} from "@/app/lib/clip-world-hs-revision-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const params: ClipWorldHsRevisionQueryParams = {
      page: Math.max(1, Number(u.searchParams.get("page")) || 1),
      pageSize: Number(u.searchParams.get("pageSize")) || 10,
      versionPair: u.searchParams.get("versionPair") ?? "",
      hsCode: u.searchParams.get("hsCode") ?? "",
      description: u.searchParams.get("description") ?? "",
    };

    const db = openClipWorldHsRevisionDb();
    try {
      const ready = worldHsRevisionTableReady(db);
      const { rows, total } = queryClipWorldHsRevisions(db, params);
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
