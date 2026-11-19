import { getGuidelineOverview } from "@/hanjoo/lib/guideline-overview";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const code = new URL(req.url).searchParams.get("code")?.trim() ?? "";
    const overview = await getGuidelineOverview(code);
    if (!overview) {
      return NextResponse.json({ ok: false, error: "안내가 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...overview });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
