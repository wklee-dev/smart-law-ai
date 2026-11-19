import { NextResponse } from "next/server";
import {
  getClipHsImportGuideDetail,
  openClipHsImportGuideDb,
} from "@/app/lib/clip-hs-import-guide-server";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  try {
    const hsCode = new URL(req.url).searchParams.get("hsCode")?.trim() ?? "";
    if (!hsCode) {
      return NextResponse.json(
        { ok: false, error: "hsCode가 필요합니다." },
        { status: 400 },
      );
    }
    const db = openClipHsImportGuideDb();
    try {
      const detail = getClipHsImportGuideDetail(db, hsCode);
      if (!detail) {
        return NextResponse.json(
          { ok: false, error: "가이드 상세를 찾을 수 없습니다." },
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
