import { getLatestLaw, searchLatestLaws } from "@/hanjoo/lib/latest-laws";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const id = (sp.get("id") ?? "").trim();
    if (id) {
      const row = await getLatestLaw(id);
      if (!row) {
        return NextResponse.json({ ok: false, error: "법령이 없습니다." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, row });
    }
    const data = await searchLatestLaws({
      type: sp.get("type") ?? "",
      category: sp.get("category") ?? "",
      jurisdiction: sp.get("jurisdiction") ?? "",
      q: sp.get("q") ?? "",
      page: Number(sp.get("page") ?? "1"),
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
