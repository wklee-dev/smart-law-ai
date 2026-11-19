import {
  getLawInfoCenterDetail,
  openLawInfoCenterDb,
} from "@/app/lib/law-info-center-latest-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const key = new URL(req.url).searchParams.get("key")?.trim() ?? "";
    if (!key) {
      return NextResponse.json(
        { ok: false, error: "key가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openLawInfoCenterDb();
    try {
      const detail = getLawInfoCenterDetail(db, key);
      if (!detail) {
        return NextResponse.json(
          { ok: false, error: "법령을 찾을 수 없습니다." },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, detail });
    } finally {
      db.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
