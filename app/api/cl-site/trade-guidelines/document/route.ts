import { getCielDocumentById } from "@/app/lib/ciel-db";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const idRaw = new URL(req.url).searchParams.get("id")?.trim() ?? "";
    const id = Number(idRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json(
        { ok: false, error: "유효한 id가 필요합니다." },
        { status: 400 },
      );
    }
    const document = getCielDocumentById(id);
    if (!document) {
      return NextResponse.json(
        { ok: false, error: "문서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, document });
  } catch (e) {
    const message = e instanceof Error ? e.message : "문서 조회 실패";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
