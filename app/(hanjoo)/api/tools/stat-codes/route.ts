import { listStatCategories, listStatDetails } from "@/hanjoo/lib/stat-codes";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const part = sp.get("part") ?? "categories";
    const page = Number(sp.get("page") ?? "1");
    const pageSize = Number(sp.get("pageSize") ?? "10");
    if (part === "details") {
      return NextResponse.json({
        ok: true,
        ...(await listStatDetails({
          code: sp.get("code") ?? "",
          keyword: sp.get("keyword") ?? "",
          page,
          pageSize,
        })),
      });
    }
    return NextResponse.json({
      ok: true,
      ...(await listStatCategories({
        keyword: sp.get("keyword") ?? "",
        sign: sp.get("sign") ?? "",
        page,
        pageSize,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
