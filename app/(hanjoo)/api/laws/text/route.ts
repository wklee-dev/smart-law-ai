import { loadLawInquiry, parseInquiryTab } from "@/hanjoo/lib/law-text";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const name = (u.searchParams.get("name") ?? "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "법령명이 필요합니다." }, { status: 400 });
    }
    const tab = parseInquiryTab(u.searchParams.get("tab"));
    const key = (u.searchParams.get("k") ?? "").trim();
    const view = await loadLawInquiry(name, tab, key);
    return NextResponse.json({ ok: true, ...view });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
