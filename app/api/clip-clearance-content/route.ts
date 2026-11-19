import { NextResponse } from "next/server";
import { isClipClearanceContentSlug } from "@/app/lib/clip-clearance-content-shared";
import {
  getClipClearanceContent,
  openClipClearanceContentDb,
} from "@/app/lib/clip-clearance-content-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug")?.trim() ?? "";
    if (!isClipClearanceContentSlug(slug)) {
      return NextResponse.json(
        { ok: false, error: "slug가 올바르지 않습니다." },
        { status: 400 },
      );
    }
    const db = openClipClearanceContentDb();
    try {
      const content = getClipClearanceContent(db, slug);
      if (!content) {
        return NextResponse.json(
          { ok: false, error: "종합정보를 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, content });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
