import { getAdminNotice, searchAdminNotices } from "@/hanjoo/lib/admin-notices";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const id = (sp.get("id") ?? "").trim();
    if (id) {
      const row = await getAdminNotice(id);
      if (!row) {
        return NextResponse.json({ ok: false, error: "게시글이 없습니다." }, { status: 404 });
      }
      return NextResponse.json({ ok: true, row });
    }
    const data = await searchAdminNotices(
      sp.get("q") ?? "",
      Number(sp.get("page") ?? "1"),
    );
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
