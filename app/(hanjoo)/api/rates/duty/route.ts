import { getDutyView } from "@/hanjoo/lib/duty-rates";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const view = await getDutyView(
      sp.get("code") ?? "",
      Number(sp.get("page") ?? "1"),
      sp.get("hs") ?? "",
    );
    if (!view) {
      return NextResponse.json({ ok: false, error: "세율 구분이 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...view });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
