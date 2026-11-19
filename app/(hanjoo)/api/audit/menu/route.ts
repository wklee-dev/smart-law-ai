import { clientIp, recordMenuAccess } from "@/hanjoo/lib/audit-log";
import { getSessionUser } from "@/hanjoo/lib/session";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    const body = (await req.json()) as {
      menuLabel?: string;
      menuPath?: string;
      href?: string;
      source?: string;
    };
    const href = String(body.href ?? "").trim();
    const menuPath = String(body.menuPath ?? href).trim();
    if (!href && !menuPath) {
      return NextResponse.json({ ok: false, error: "메뉴 경로가 없습니다." }, { status: 400 });
    }
    recordMenuAccess({
      userId: user.userId,
      userName: user.userName,
      menuLabel: String(body.menuLabel ?? "").trim(),
      menuPath,
      href: href || menuPath,
      source: body.source === "page" ? "page" : "menu",
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? "",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
