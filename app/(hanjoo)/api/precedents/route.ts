import { getPrecedent, searchPrecedents } from "@/hanjoo/lib/precedents";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const id = (sp.get("id") ?? "").trim();
    if (id) {
      const row = await getPrecedent(id);
      if (!row) {
        return NextResponse.json({ ok: false, error: "결정례가 없습니다." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, row });
    }
    const data = await searchPrecedents({
      tab: sp.get("tab") ?? "",
      caseNo: sp.get("caseNo") ?? "",
      title: sp.get("title") ?? "",
      issue: sp.get("issue") ?? "",
      agency: sp.get("agency") ?? "",
      page: Number(sp.get("page") ?? "1"),
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
