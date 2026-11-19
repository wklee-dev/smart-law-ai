import { generalLawMenu } from "@/hanjoo/lib/general-law-catalog";
import { listGeneralLawTree } from "@/hanjoo/lib/general-laws";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("category")?.trim() ?? "";
    const menu = generalLawMenu(slug);
    if (!menu) {
      return NextResponse.json({ ok: false, error: "법령 분류가 없습니다." }, { status: 404 });
    }
    const nodes = listGeneralLawTree(menu);
    return NextResponse.json({ ok: true, label: menu.label, nodes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
