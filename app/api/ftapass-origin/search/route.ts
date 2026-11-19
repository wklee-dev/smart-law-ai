import { NextRequest, NextResponse } from "next/server";
import { queryFtaPassOrigin } from "@/app/lib/ftapass-origin-server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const u = request.nextUrl.searchParams;
    const recent =
      u.get("recent_stdyy") === "1" ||
      u.get("recent_stdyy")?.toLowerCase() === "true" ||
      u.get("last_stdyy") === "Y";
    const result = queryFtaPassOrigin({
      stdyy: u.get("stdyy") ?? "",
      ontAgreeCd: u.get("ont_agree_cd") ?? "",
      hs6Cd: u.get("hs6_cd") ?? "",
      recentStdyy: recent,
      page: Number(u.get("page") ?? "1"),
      pageSize: Number(u.get("page_size") ?? "100"),
    });
    return NextResponse.json({ ...result, ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const bad = msg.includes("입력");
    return NextResponse.json(
      { ok: false, error: msg },
      { status: bad ? 400 : 500 },
    );
  }
}
