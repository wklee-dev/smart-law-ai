import { NextResponse } from "next/server";
import { getClipAnnexDetail, openClipAnnexDb } from "@/app/lib/clip-annex-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const u = new URL(req.url);
  const formKey = u.searchParams.get("formKey")?.trim();
  if (!formKey) {
    return NextResponse.json({ error: "formKey가 필요합니다." }, { status: 400 });
  }

  try {
    const db = openClipAnnexDb();
    try {
      const detail = getClipAnnexDetail(db, formKey);
      if (!detail) {
        return NextResponse.json({ error: "별표/서식을 찾을 수 없습니다." }, { status: 404 });
      }
      return NextResponse.json(detail);
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
