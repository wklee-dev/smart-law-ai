import { ftaAbbrMeta, searchFtaAbbr, suggestFtaAbbrHs } from "@/hanjoo/lib/fta-pass-origin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const part = sp.get("part") ?? "";
    if (part === "meta") {
      return NextResponse.json({ ok: true, ...(await ftaAbbrMeta()) });
    }
    if (part === "suggest") {
      return NextResponse.json({
        ok: true,
        hs: await suggestFtaAbbrHs(sp.get("hs") ?? ""),
      });
    }
    const data = await searchFtaAbbr({
      year: sp.get("year") ?? "",
      agreement: sp.get("agreement") ?? "",
      hs: sp.get("hs") ?? "",
      recent: sp.get("recent") === "1",
      page: Number(sp.get("page") ?? "1"),
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
