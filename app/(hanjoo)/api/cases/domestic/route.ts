import { getDomesticCase, searchDomesticCases } from "@/hanjoo/lib/case-catalog";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const id = Number(sp.get("id") ?? "");
    if (Number.isFinite(id) && id > 0 && sp.has("id")) {
      const row = await getDomesticCase(id);
      if (!row) return NextResponse.json({ ok: false, error: "사례가 없습니다." }, { status: 404 });
      return NextResponse.json({ ok: true, row });
    }
    const data = await searchDomesticCases({
      bucket: sp.get("bucket") ?? "",
      reff: sp.get("reff") ?? "",
      hs: sp.get("hs") ?? "",
      name: sp.get("name") ?? "",
      keyword: sp.get("q") ?? "",
      from: sp.get("from") ?? "",
      to: sp.get("to") ?? "",
      page: Number(sp.get("page") ?? "1"),
      pageSize: Number(sp.get("pageSize") ?? "10"),
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
