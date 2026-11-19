import { getGuidelineSources } from "@/hanjoo/lib/guideline-sources";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const code = new URL(req.url).searchParams.get("code")?.trim() ?? "";
    const view = await getGuidelineSources(code);
    if (!view) {
      return NextResponse.json({ ok: false, error: "소스가 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...view });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
