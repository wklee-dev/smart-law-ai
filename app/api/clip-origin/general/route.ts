import { NextResponse } from "next/server";
import {
  getClipOriginGeneralSection,
  openClipOriginGeneralDb,
} from "@/app/lib/clip-origin-general-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const sectionKey = new URL(req.url).searchParams.get("sectionKey")?.trim();
    if (!sectionKey) {
      return NextResponse.json(
        { ok: false, error: "sectionKey가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openClipOriginGeneralDb();
    try {
      const section = getClipOriginGeneralSection(db, sectionKey);
      if (!section) {
        return NextResponse.json(
          { ok: false, error: "종합정보 섹션을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, section });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
