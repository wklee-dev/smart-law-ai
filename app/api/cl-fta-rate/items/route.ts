import { openClFtaRateDb } from "@/app/lib/cl-fta-rate-server";
import { queryPortalHsItems } from "@/app/lib/fta-portal-rate-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const ftaCd = u.searchParams.get("ftaCd")?.trim() ?? "";
    const chapter = u.searchParams.get("chapter")?.trim() ?? "";
    const q = u.searchParams.get("q")?.trim() ?? "";
    const qTypeRaw = (u.searchParams.get("qType") ?? "hs").trim();
    const qType =
      qTypeRaw === "ko" || qTypeRaw === "en" || qTypeRaw === "hs"
        ? qTypeRaw
        : "hs";

    if (!ftaCd && !q && !chapter) {
      return NextResponse.json(
        { ok: false, error: "ftaCd, chapter 또는 q가 필요합니다." },
        { status: 400 },
      );
    }

    const db = openClFtaRateDb();
    try {
      const { rows, total } = queryPortalHsItems(db, {
        nationCode: ftaCd,
        chapter,
        q,
        qType,
        page: Number(u.searchParams.get("page") ?? "1"),
        pageSize: Number(u.searchParams.get("pageSize") ?? "50"),
      });
      return NextResponse.json({ ok: true, rows, total });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
