import { NextRequest, NextResponse } from "next/server";
import { saveLawDetailToSqlite } from "@/app/lib/smart-law-sqlite-save";

export const runtime = "nodejs";
export const maxDuration = 300;

type SaveLawDetailRequest = {
  rawJson: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaveLawDetailRequest;

    if (!body.rawJson || typeof body.rawJson !== "object") {
      return NextResponse.json(
        { ok: false, error: "rawJson 객체가 필요합니다." },
        { status: 400 },
      );
    }

    const result = saveLawDetailToSqlite(body.rawJson);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("law-detail-sqlite/save 오류:", error);
    const message =
      error instanceof Error
        ? error.message
        : "SQLite 법령 상세 저장 중 오류가 발생했습니다.";

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
