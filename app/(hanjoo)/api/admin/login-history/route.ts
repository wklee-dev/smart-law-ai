import { searchLoginHistory } from "@/hanjoo/lib/audit-log";
import { getSessionUser } from "@/hanjoo/lib/session";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    const sp = new URL(req.url).searchParams;
    const result = searchLoginHistory({
      userId: sp.get("userId") ?? "",
      userName: sp.get("userName") ?? "",
      from: sp.get("from") ?? "",
      to: sp.get("to") ?? "",
      success: (sp.get("success") ?? "") as "" | "1" | "0",
      page: Number(sp.get("page") ?? "1"),
      pageSize: Number(sp.get("pageSize") ?? "20"),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
