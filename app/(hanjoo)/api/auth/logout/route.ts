import { NextResponse } from "next/server";
import { sessionCookieName } from "@/hanjoo/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const asForm = !(req.headers.get("content-type") ?? "").includes("application/json")
    && (req.headers.get("accept") ?? "").includes("text/html");
  // 상대 Location: 서버 내부 host(localhost) 대신 브라우저 주소 유지
  const res = asForm
    ? new NextResponse(null, { status: 303, headers: { Location: "/login" } })
    : NextResponse.json({ ok: true });
  res.cookies.set(sessionCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
