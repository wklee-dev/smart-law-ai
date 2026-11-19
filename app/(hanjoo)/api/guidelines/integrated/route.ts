import { searchIntegrated } from "@/hanjoo/lib/clearance-notices";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const data = await searchIntegrated({
      issue: sp.get("issue") ?? "",
      hs: sp.get("hs") ?? "",
      direction: sp.get("direction") ?? "",
      q: sp.get("q") ?? "",
      page: Number(sp.get("page") ?? "1"),
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
