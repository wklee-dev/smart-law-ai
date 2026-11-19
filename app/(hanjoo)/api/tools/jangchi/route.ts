import { searchJangchi } from "@/hanjoo/lib/jangchi";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    return NextResponse.json({
      ok: true,
      ...(await searchJangchi({
        code: sp.get("code") ?? "",
        name: sp.get("name") ?? "",
        customs: sp.get("customs") ?? "",
        page: Number(sp.get("page") ?? "1"),
        pageSize: Number(sp.get("pageSize") ?? "20"),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
