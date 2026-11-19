import { searchCustomsChief } from "@/hanjoo/lib/clearance-notices";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const data = await searchCustomsChief({
      hs: sp.get("hs") ?? "",
      imex: sp.get("imex") ?? "",
      doc: sp.get("doc") ?? "",
      law: sp.get("law") ?? "",
      history: sp.get("history") === "1",
      page: Number(sp.get("page") ?? "1"),
    });
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
